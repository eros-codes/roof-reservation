import express from 'express';
import { prisma } from '../lib/prisma.js';
import { normalizePhone } from '../lib/time.js';
import { optionalUser, requireUser } from '../middleware/auth.js';
import { canChangeOrCancel, cancelReservation, createReservationHold, getReservationFull } from '../services/reservation.service.js';
import { sendMockSms } from '../lib/sms.js';
import { setCookie, signGuestToken, verifyGuestToken } from '../lib/auth.js';
import rateLimit from 'express-rate-limit';

// هر HOLD میزها را تا چند دقیقه قفل می‌کند، پس باید محدود باشد
const holdLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	max: 10,
	message: { message: 'تعداد درخواست رزرو بیش از حد مجاز است؛ کمی بعد دوباره تلاش کن.' },
});
export const reservationRouter = express.Router();

reservationRouter.post('/hold', holdLimiter, optionalUser, async (req, res, next) => {
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
			source: req.user ? 'ONLINE' : 'GUEST',
			decoration: payload.decoration === true,
			decorationNote: payload.decorationNote,
		});
		// کوکی دسترسی همان لحظه صادر می‌شود تا صفحه‌ی پرداخت/فاکتور
		// بدون نیاز به تایید پیامکی بتواند همین رزرو را ببیند
		setCookie(
			res,
			'guestToken',
			signGuestToken({
				phone: reservation.customerPhone,
				reservationId: reservation.id,
				trackingCode: reservation.trackingCode,
			}),
		);
		res.status(201).json({ reservation });
	} catch (error) {
		next(error);
	}
});

function hasReservationAccess(req, reservation) {
	if (req.user && reservation.userId === req.user.id) return true;
	if (!req.cookies?.guestToken) return false;
	try {
		return verifyGuestToken(req.cookies.guestToken).reservationId === reservation.id;
	} catch {
		return false;
	}
}

reservationRouter.get('/:id', optionalUser, async (req, res, next) => {
	try {
		const reservation = await getReservationFull(req.params.id);
		if (!reservation) return res.status(404).json({ message: 'رزرو پیدا نشد.' });
		if (!hasReservationAccess(req, reservation))
			return res.status(403).json({
				message: 'برای دیدن این رزرو باید وارد حساب شوی یا با کد پیگیری تایید کنی.',
			});
		res.json({ reservation });
	} catch (error) {
		next(error);
	}
});

reservationRouter.post('/:id/cancel', optionalUser, async (req, res, next) => {
	try {
		const reservation = await getReservationFull(req.params.id);
		if (!reservation) return res.status(404).json({ message: 'رزرو پیدا نشد.' });
		if (!hasReservationAccess(req, reservation)) {
			return res.status(403).json({ message: 'برای لغو رزرو باید مالک رزرو باشید.' });
		}
		const updated = await cancelReservation(reservation.id, req.body.note || 'لغو توسط مشتری');

		res.json({ reservation: updated });
	} catch (error) {
		next(error);
	}
});

reservationRouter.post('/:id/change/hold', holdLimiter, optionalUser, async (req, res, next) => {
	try {
		const original = await getReservationFull(req.params.id);
		if (!original) return res.status(404).json({ message: 'رزرو اصلی پیدا نشد.' });
		if (!canChangeOrCancel(original))
			return res.status(400).json({
				message: 'تغییر رزرو فقط تا ۲ ساعت قبل از شروع مجاز است.',
			});

		if (!hasReservationAccess(req, original)) {
			return res.status(403).json({ message: 'برای تغییر رزرو باید مالک رزرو باشید.' });
		}

		const nextGuestCount = Number(req.body.guestCount);
		const oldTotal = original.totalAmount;
		// تزئین رزرو اصلی باید به رزرو جدید منتقل بشه، وگرنه هم از قلم می‌افته
		// هم محاسبه‌ی مابه‌التفاوت اشتباه می‌شه
		const keepsDecoration = original.decorationAmount > 0;
		const change = await createReservationHold({
			tableIds: req.body.tableIds,
			date: req.body.date,
			startTime: req.body.startTime,
			durationMinutes: Number(req.body.durationMinutes),
			guestCount: nextGuestCount,
			customerName: req.body.customerName || original.customerName,
			customerPhone: original.customerPhone,
			userId: original.userId,
			source: 'ONLINE',
			originalReservationId: original.id,
			decoration: keepsDecoration,
			decorationNote: original.decorationNote,
		});

		// مبلغ واقعیِ ثبت‌شده ملاک است، نه محاسبه‌ی دستی؛ وگرنه اگر قیمت‌ها
		// از زمان رزرو اولیه عوض شده باشند، paidAmount با totalAmount نمی‌خواند
		const newTotal = change.totalAmount;

		if (newTotal === oldTotal) {
			const [, confirmedChange] = await prisma.$transaction([
				prisma.payment.updateMany({
					where: {
						reservationId: change.id,
						status: { in: ['PENDING', 'FAILED', 'REVIEW'] },
					},
					data: {
						status: 'PAID',
						method: 'MANUAL',
						refId: `CHANGE-FREE-${Date.now()}`,
						verifiedAt: new Date(),
						isMock: true,
					},
				}),
				prisma.reservation.update({
					where: { id: change.id },
					data: { status: 'CONFIRMED', paidAmount: newTotal },
				}),
				prisma.reservation.update({
					where: { id: original.id },
					data: {
						status: 'CANCELLED',
						notes: 'با تغییر رزرو جایگزین شد.',
					},
				}),
			]);
			await sendMockSms({
				phone: original.customerPhone,
				type: 'CHANGE',
				message: `تغییر رزرو ${original.trackingCode} تایید شد. کد جدید: ${change.trackingCode}`,
			}).catch((error) => console.error('SMS تغییر ارسال نشد:', error));
			return res.json({
				reservation: confirmedChange,
				priceDiff: 0,
				message: 'تغییر بدون پرداخت انجام شد.',
			});
		}

		if (newTotal < oldTotal) {
			const [, confirmedChange] = await prisma.$transaction([
				prisma.payment.updateMany({
					where: {
						reservationId: change.id,
						status: { in: ['PENDING', 'FAILED', 'REVIEW'] },
					},
					data: {
						status: 'PAID',
						method: 'MANUAL',
						refId: `CHANGE-REFUND-${Date.now()}`,
						verifiedAt: new Date(),
						isMock: true,
					},
				}),
				prisma.reservation.update({
					where: { id: change.id },
					data: {
						status: 'CONFIRMED',
						paidAmount: newTotal,
						refundStatus: 'PENDING',
					},
				}),
				prisma.reservation.update({
					where: { id: original.id },
					data: {
						status: 'CANCELLED',
						notes: 'با تغییر رزرو جایگزین شد؛ بازگشت مابه‌التفاوت در انتظار است.',
					},
				}),
			]);
			await sendMockSms({
				phone: original.customerPhone,
				type: 'CHANGE',
				message: `تغییر رزرو ${original.trackingCode} تایید شد. برای بازگشت مابه‌التفاوت با مجموعه تماس بگیرید.`,
			}).catch((error) => console.error('SMS تغییر ارسال نشد:', error));
			return res.json({
				reservation: confirmedChange,
				priceDiff: newTotal - oldTotal,
				message: 'تغییر تایید شد. برای مابه‌التفاوت با مجموعه تماس بگیرید.',
			});
		}

		res.json({
			reservation: change,
			priceDiff: newTotal - oldTotal,
			message: 'برای تغییر رزرو باید مابه‌التفاوت پرداخت شود.',
		});
	} catch (error) {
		next(error);
	}
});

reservationRouter.get('/profile/list', requireUser, async (req, res, next) => {
	try {
		// رزروهای مهمانِ همین شماره که هنوز به حساب وصل نشدن، همین‌جا وصل می‌شن —
		// تا اگه کاربر بعد از ورود هم رزرو مهمان ثبت کرد، از قلم نیفته
		await prisma.reservation
			.updateMany({ where: { customerPhone: req.user.phone, userId: null }, data: { userId: req.user.id } })
			.catch((error) => console.error('اتصال رزروهای قبلی ناموفق بود:', error));

		const reservations = await prisma.reservation.findMany({
			where: { userId: req.user.id },
			orderBy: { startAt: 'desc' },
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
