import { prisma } from './prisma.js';
import { config } from '../config.js';

export async function sendMockSms({ phone, type, message }) {
	const status = config.smsMode === 'console' ? 'MOCK_SENT' : 'PENDING_PROVIDER';
	// کد تایید نباید تو دیتابیس بمونه؛ فقط شکل پیام لاگ می‌شه
	const storedMessage = type === 'OTP' ? 'کد تایید Roof: ******' : message;
	let log = null;
	try {
		log = await prisma.smsLog.create({ data: { phone, type, message: storedMessage, status } });
	} catch (error) {
		console.error('ثبت لاگ پیامک ناموفق بود (ارسال پیامک ادامه پیدا می‌کند):', error);
	}
	if (config.smsMode === 'console') {
		console.log(`\n[MOCK SMS][${type}] ${phone}: ${message}\n`);
	} else {
		// TODO: وقتی پروایدر واقعی (مثلاً ir.sms) انتخاب شد، اینجا فراخوانی واقعی اضافه می‌شه.
		// log می‌تونه null باشه (اگه نوشتن لاگ بالاتر شکست خورده باشه)
		if (log) {
			await prisma.smsLog
				.update({ where: { id: log.id }, data: { status: 'FAILED' } })
				.catch((error) => console.error('به‌روزرسانی وضعیت لاگ پیامک ناموفق بود:', error));
		}
		throw new Error(`هیچ سرویس پیامکی برای SMS_MODE="${config.smsMode}" پیاده‌سازی نشده است.`);
	}
	return log;
}

export function otpMessage(code) {
	return `کد تایید Roof: ${code}`;
}

export function confirmationMessage(reservation) {
	return `رزرو شما در Roof تایید شد. کد پیگیری: ${reservation.trackingCode}`;
}

export function notConfirmedMessage(reservation) {
	return `رزرو ${reservation.trackingCode} تایید نشد، لطفاً با مجموعه تماس بگیرید.`;
}

export function reminderMessage(reservation) {
	return `یادآوری Roof: رزرو شما تا ۳ ساعت دیگر شروع می‌شود. کد: ${reservation.trackingCode}`;
}
