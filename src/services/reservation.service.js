import { prisma } from '../lib/prisma.js';
import { addMinutes, combineDateAndTime, generateInvoiceNumber, generateTrackingCode } from '../lib/time.js';
import { getSettings, numberSetting } from './settings.service.js';
import { assertTablesAvailable } from './availability.service.js';
import { reminderMessage, sendMockSms } from '../lib/sms.js';
import { config } from '../config.js';
import { createHttpError } from '../lib/http-error.js';
import { CANCEL_WINDOW_MINUTES } from '../lib/constants.js';

async function uniqueTrackingCode(client) {
	for (let i = 0; i < 10; i++) {
		const code = generateTrackingCode();
		const existing = await client.reservation.findUnique({
			where: { trackingCode: code },
		});
		if (!existing) return code;
	}
	throw new Error('ساخت کد پیگیری ناموفق بود.');
}

async function uniqueInvoiceNumber(client) {
	for (let i = 0; i < 10; i++) {
		const number = generateInvoiceNumber();
		const existing = await client.invoice.findUnique({ where: { number } });
		if (!existing) return number;
	}
	throw new Error('ساخت شماره فاکتور ناموفق بود.');
}

export async function createReservationHold({
	tableIds,
	date,
	startTime,
	durationMinutes,
	guestCount,
	customerName,
	customerPhone,
	userId = null,
	source = 'ONLINE',
	originalReservationId = null,
	decoration = false,
	decorationNote = null,
}) {
	if (!Array.isArray(tableIds) || tableIds.length < 1 || tableIds.length > 6) throw createHttpError(400, 'انتخاب میز نامعتبر است.');
	if (new Set(tableIds).size !== tableIds.length) throw createHttpError(400, 'یک میز نمی‌تواند دوبار در یک رزرو باشد.');
	if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 50) throw createHttpError(400, 'تعداد نفرات نامعتبر است.');
	if (!Number.isInteger(durationMinutes) || durationMinutes < 1) throw createHttpError(400, 'مدت رزرو نامعتبر است.');
	if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw createHttpError(400, 'تاریخ نامعتبر است.');
	if (typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime)) throw createHttpError(400, 'ساعت شروع نامعتبر است.');
	if (!customerPhone) throw createHttpError(400, 'شماره موبایل نامعتبر است.');
	if (!customerName || !String(customerName).trim()) throw createHttpError(400, 'نام مشتری لازم است.');

	// خواندن تنظیمات قبل از باز شدن تراکنش، تا از استخر اتصال‌ها اتصال دوم گرفته نشود
	const settings = await getSettings();
	const pricePerGuest = numberSetting(settings, 'pricePerGuest', 100000);
	const holdMinutes = numberSetting(settings, 'holdMinutes', 10);
	// قیمت از تنظیمات خونده می‌شه نه از ورودی کاربر، وگرنه می‌شد مبلغ دلخواه فرستاد
	const decorationPrice = numberSetting(settings, 'decorationPrice', 0, { min: 0 });
	const decorationAmount = decoration && decorationPrice > 0 ? decorationPrice : 0;
	const safeDecorationNote = decorationAmount > 0 && decorationNote ? String(decorationNote).trim().slice(0, 200) || null : null;

	try {
		return await prisma.$transaction(
			async (tx) => {
				await assertTablesAvailable({ tableIds, date, startTime, durationMinutes, guestCount }, tx);
				const totalAmount = pricePerGuest * guestCount + decorationAmount;
				const startAt = combineDateAndTime(date, startTime);
				const endAt = addMinutes(startAt, durationMinutes);
				const trackingCode = await uniqueTrackingCode(tx);
				const invoiceNumber = await uniqueInvoiceNumber(tx);
				const holdExpiresAt = addMinutes(new Date(), holdMinutes);

				return tx.reservation.create({
					data: {
						trackingCode,
						userId,
						customerName,
						customerPhone,
						guestCount,
						startAt,
						endAt,
						durationMinutes,
						status: source === 'ADMIN_MANUAL' ? 'CONFIRMED' : 'HOLD',
						source,
						holdExpiresAt: source === 'ADMIN_MANUAL' ? null : holdExpiresAt,
						pricePerGuest,
						totalAmount,
						decorationAmount,
						decorationNote: safeDecorationNote,
						paidAmount: source === 'ADMIN_MANUAL' ? totalAmount : 0,
						originalReservationId,
						tables: {
							create: tableIds.map((tableId) => ({ tableId })),
						},
						invoice: {
							create: { number: invoiceNumber, totalAmount },
						},
						payments: {
							create: {
								amount: totalAmount,
								status: source === 'ADMIN_MANUAL' ? 'PAID' : 'PENDING',
								method: source === 'ADMIN_MANUAL' ? 'MANUAL' : 'ZARINPAL',
								provider: source === 'ADMIN_MANUAL' ? 'manual' : 'zarinpal',
								isMock: false,
							},
						},
					},
					include: {
						tables: { include: { table: true } },
						payments: true,
						invoice: true,
						user: true,
					},
				});
			},
			{ isolationLevel: 'Serializable' },
		);
	} catch (error) {
		if (error?.code === 'P2034') throw createHttpError(409, 'این میز همین الان توسط شخص دیگری رزرو شد؛ یک گزینه‌ی دیگر انتخاب کن.');
		if (error?.status) throw error;
		throw createHttpError(500, error?.message || 'رزرو ناموفق بود.');
	}
}

export async function getReservationFull(idOrCode) {
	if (typeof idOrCode !== 'string' || !idOrCode.trim()) return null;
	const where = idOrCode.startsWith('RSV-') ? { trackingCode: idOrCode } : { id: idOrCode };
	return prisma.reservation.findUnique({
		where,
		include: {
			tables: { include: { table: true } },
			payments: { orderBy: { createdAt: 'desc' } },
			invoice: true,
			user: true,
		},
	});
}

export async function createManualReservation(data) {
	return createReservationHold({ ...data, source: 'ADMIN_MANUAL' });
}

export function canChangeOrCancel(reservation) {
	const deadline = addMinutes(new Date(), CANCEL_WINDOW_MINUTES);
	return reservation.startAt > deadline && reservation.status === 'CONFIRMED';
}

export async function cancelReservation(reservationId, note = '') {
	const reservation = await getReservationFull(reservationId);
	if (!reservation) throw new Error('رزرو پیدا نشد.');
	if (!canChangeOrCancel(reservation)) throw new Error('لغو رزرو فقط تا ۲ ساعت قبل از شروع مجاز است.');
	// اگر پول واقعی پرداخت شده، لغو باید بدهی بازگشت وجه را ثبت کند —
	// مشابه رفتار مسیر لغو توسط ادمین
	const paidReal = (reservation.payments || []).some((p) => p.status === 'PAID');
	const [updated] = await prisma.$transaction([
		prisma.reservation.update({
			where: { id: reservationId },
			data: {
				status: 'CANCELLED',
				notes: note || reservation.notes,
				...(paidReal ? { refundStatus: 'PENDING' } : {}),
			},
		}),
		prisma.payment.updateMany({ where: { reservationId, status: 'PAID' }, data: { status: 'REFUND_PENDING' } }),
	]);
	await sendMockSms({
		phone: reservation.customerPhone,
		type: 'CANCELLATION',
		message: paidReal
			? `رزرو ${reservation.trackingCode} لغو شد. برای بازگشت وجه با مجموعه تماس بگیرید.`
			: `رزرو ${reservation.trackingCode} لغو شد.`,
	}).catch((error) => console.error('SMS لغو ارسال نشد:', error));
	return updated;
}

export async function sendDueReminders() {
	const settings = await getSettings();
	const reminderMinutes = numberSetting(settings, 'reminderBeforeMinutes', 180, { min: 0 });
	if (reminderMinutes <= 0) return 0;

	const now = new Date();
	const windowEnd = addMinutes(now, reminderMinutes);

	const due = await prisma.reservation.findMany({
		where: {
			status: 'CONFIRMED',
			reminderSentAt: null,
			startAt: { gt: now, lte: windowEnd },
		},
		include: { tables: { include: { table: true } } },
		take: 50,
	});

	let sent = 0;
	for (const reservation of due) {
		const bookedInsideWindow = addMinutes(new Date(reservation.createdAt), reminderMinutes) >= new Date(reservation.startAt);
		if (bookedInsideWindow) {
			await prisma.reservation.update({ where: { id: reservation.id }, data: { reminderSentAt: now } }).catch(() => {});
			continue;
		}

		try {
			await sendMockSms({
				phone: reservation.customerPhone,
				type: 'REMINDER',
				message: reminderMessage(reservation, reminderMinutes),
			});
			await prisma.reservation.update({ where: { id: reservation.id }, data: { reminderSentAt: new Date() } });
			sent += 1;
		} catch (error) {
			console.error(`ارسال یادآوری برای رزرو ${reservation.trackingCode} ناموفق بود:`, error);
		}
	}
	return sent;
}
