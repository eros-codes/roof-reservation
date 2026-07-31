import { prisma } from '../lib/prisma.js';
import { addMinutes, combineDateAndTime, generateInvoiceNumber, generateTrackingCode } from '../lib/time.js';
import { getSettings, numberSetting } from './settings.service.js';
import { assertTablesAvailable } from './availability.service.js';
import { sendMockSms } from '../lib/sms.js';
import { config } from '../config.js';

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
}) {
	if (!Array.isArray(tableIds) || tableIds.length < 1 || tableIds.length > 2) throw new Error('انتخاب میز نامعتبر است.');
	if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 50) throw new Error('تعداد نفرات نامعتبر است.');
	if (!Number.isInteger(durationMinutes) || durationMinutes < 1) throw new Error('مدت رزرو نامعتبر است.');
	if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('تاریخ نامعتبر است.');
	if (typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime)) throw new Error('ساعت شروع نامعتبر است.');
	if (!customerPhone) throw new Error('شماره موبایل نامعتبر است.');
	if (!customerName || !String(customerName).trim()) throw new Error('نام مشتری لازم است.');

	// خواندن تنظیمات قبل از باز شدن تراکنش، تا از استخر اتصال‌ها اتصال دوم گرفته نشود
	const settings = await getSettings();
	const pricePerGuest = numberSetting(settings, 'pricePerGuest', 100000);
	const holdMinutes = numberSetting(settings, 'holdMinutes', 10);

	try {
		return await prisma.$transaction(
			async (tx) => {
				await assertTablesAvailable({ tableIds, date, startTime, durationMinutes, guestCount }, tx);
				const totalAmount = pricePerGuest * guestCount;
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
		if (error.code === 'P2034') throw new Error('این میز همین الان توسط شخص دیگری رزرو شد؛ یک گزینه‌ی دیگر انتخاب کن.');
		throw error;
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
	const twoHoursFromNow = addMinutes(new Date(), 120);
	return reservation.startAt > twoHoursFromNow && reservation.status === 'CONFIRMED';
}

export async function cancelReservation(reservationId, note = '') {
	const reservation = await getReservationFull(reservationId);
	if (!reservation) throw new Error('رزرو پیدا نشد.');
	if (!canChangeOrCancel(reservation)) throw new Error('لغو رزرو فقط تا ۲ ساعت قبل از شروع مجاز است.');
	const updated = await prisma.reservation.update({
		where: { id: reservationId },
		data: { status: 'CANCELLED', notes: note || reservation.notes },
	});
	await sendMockSms({
		phone: reservation.customerPhone,
		type: 'CANCELLATION',
		message: `رزرو ${reservation.trackingCode} لغو شد.`,
	}).catch((error) => console.error('SMS لغو ارسال نشد:', error));
	return updated;
}
