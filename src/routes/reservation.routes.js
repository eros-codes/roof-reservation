import express from "express";
import { prisma } from "../lib/prisma.js";
import { normalizePhone } from "../lib/time.js";
import { optionalUser, requireUser } from "../middleware/auth.js";
import {
	canChangeOrCancel,
	cancelReservation,
	createReservationHold,
	getReservationFull,
} from "../services/reservation.service.js";
import { sendMockSms } from "../lib/sms.js";
import { verifyGuestToken } from "../lib/auth.js";

export const reservationRouter = express.Router();

reservationRouter.post("/hold", optionalUser, async (req, res, next) => {
	try {
		const payload = req.body;
		const reservation = await createReservationHold({
			tableIds: payload.tableIds,
			date: payload.date,
			startTime: payload.startTime,
			durationMinutes: Number(payload.durationMinutes),
			guestCount: Number(payload.guestCount),
			customerName: payload.customerName,
			customerPhone: normalizePhone(payload.customerPhone),
			userId: req.user?.id || null,
			source: req.user ? "ONLINE" : "GUEST",
		});
		res.status(201).json({ reservation });
	} catch (error) {
		next(error);
	}
});

reservationRouter.get("/:id", async (req, res, next) => {
	try {
		const reservation = await getReservationFull(req.params.id);
		if (!reservation)
			return res.status(404).json({ message: "رزرو پیدا نشد." });
		res.json({ reservation });
	} catch (error) {
		next(error);
	}
});

reservationRouter.post("/:id/cancel", optionalUser, async (req, res, next) => {
	try {
		const reservation = await getReservationFull(req.params.id);
		if (!reservation)
			return res.status(404).json({ message: "رزرو پیدا نشد." });
		const allowedUser = req.user && reservation.userId === req.user.id;
		let allowedGuest = false;
		if (req.cookies?.guestToken) {
			try {
				allowedGuest =
					verifyGuestToken(req.cookies.guestToken).reservationId ===
					original.id;
			} catch {
				allowedGuest = false;
			}
		}
		if (!allowedUser && !allowedGuest) {
			return res
				.status(403)
				.json({ message: "برای تغییر رزرو باید مالک رزرو باشید." });
		}
		const updated = await cancelReservation(
			reservation.id,
			req.body.note || "لغو توسط مشتری",
		);
		await sendMockSms({
			phone: reservation.customerPhone,
			type: "CANCELLATION",
			message: `رزرو ${reservation.trackingCode} لغو شد.`,
		});
		res.json({ reservation: updated });
	} catch (error) {
		next(error);
	}
});

reservationRouter.post(
	"/:id/change/hold",
	optionalUser,
	async (req, res, next) => {
		try {
			const original = await getReservationFull(req.params.id);
			if (!original)
				return res.status(404).json({ message: "رزرو اصلی پیدا نشد." });
			if (!canChangeOrCancel(original))
				return res
					.status(400)
					.json({
						message:
							"تغییر رزرو فقط تا ۲ ساعت قبل از شروع مجاز است.",
					});

			const allowedUser = req.user && original.userId === req.user.id;
			if (
				!allowedUser &&
				normalizePhone(req.body.customerPhone) !==
					original.customerPhone
			) {
				return res
					.status(403)
					.json({ message: "برای تغییر رزرو باید مالک رزرو باشید." });
			}

			const nextGuestCount = Number(req.body.guestCount);
			const oldTotal = original.totalAmount;
			const newTotal = original.pricePerGuest * nextGuestCount;
			const change = await createReservationHold({
				tableIds: req.body.tableIds,
				date: req.body.date,
				startTime: req.body.startTime,
				durationMinutes: Number(req.body.durationMinutes),
				guestCount: nextGuestCount,
				customerName: req.body.customerName || original.customerName,
				customerPhone: original.customerPhone,
				userId: original.userId,
				source: "ONLINE",
				originalReservationId: original.id,
			});

			if (newTotal === oldTotal) {
				await prisma.payment.updateMany({
					where: { reservationId: change.id },
					data: {
						status: "PAID",
						method: "ZARINPAL",
						refId: `CHANGE-FREE-${Date.now()}`,
						verifiedAt: new Date(),
						isMock: false,
					},
				});
				const confirmedChange = await prisma.reservation.update({
					where: { id: change.id },
					data: { status: "CONFIRMED", paidAmount: newTotal },
				});
				await prisma.reservation.update({
					where: { id: original.id },
					data: {
						status: "CANCELLED",
						notes: "با تغییر رزرو جایگزین شد.",
					},
				});
				await sendMockSms({
					phone: original.customerPhone,
					type: "CHANGE",
					message: `تغییر رزرو ${original.trackingCode} تایید شد. کد جدید: ${change.trackingCode}`,
				});
				return res.json({
					reservation: confirmedChange,
					priceDiff: 0,
					message: "تغییر بدون پرداخت انجام شد.",
				});
			}

			if (newTotal < oldTotal) {
				await prisma.payment.updateMany({
					where: {
						reservationId: change.id,
						status: { in: ["PENDING", "FAILED", "REVIEW"] },
					},
					data: {
						status: "PAID",
						method: "ZARINPAL",
						refId: `CHANGE-REFUND-${Date.now()}`,
						verifiedAt: new Date(),
						isMock: false,
					},
				});
				const confirmedChange = await prisma.reservation.update({
					where: { id: change.id },
					data: {
						status: "CONFIRMED",
						paidAmount: newTotal,
						refundStatus: "PENDING",
					},
				});
				await prisma.reservation.update({
					where: { id: original.id },
					data: {
						status: "CANCELLED",
						notes: "با تغییر رزرو جایگزین شد؛ بازگشت مابه‌التفاوت در انتظار است.",
					},
				});
				await sendMockSms({
					phone: original.customerPhone,
					type: "CHANGE",
					message: `تغییر رزرو ${original.trackingCode} تایید شد. برای بازگشت مابه‌التفاوت با مجموعه تماس بگیرید.`,
				});
				return res.json({
					reservation: confirmedChange,
					priceDiff: newTotal - oldTotal,
					message:
						"تغییر تایید شد. برای مابه‌التفاوت با مجموعه تماس بگیرید.",
				});
			}

			res.json({
				reservation: change,
				priceDiff: newTotal - oldTotal,
				message: "برای تغییر رزرو باید مابه‌التفاوت پرداخت شود.",
			});
		} catch (error) {
			next(error);
		}
	},
);

reservationRouter.get("/profile/list", requireUser, async (req, res, next) => {
	try {
		const reservations = await prisma.reservation.findMany({
			where: { userId: req.user.id },
			orderBy: { startAt: "desc" },
			include: {
				tables: { include: { table: true } },
				invoice: true,
				payments: true,
			},
		});
		res.json({ reservations });
	} catch (error) {
		next(error);
	}
});
