import { prisma } from './prisma.js';
import { config } from "../config.js";

export async function sendMockSms({ phone, type, message }) {
  const status = config.smsMode === 'console' ? 'MOCK_SENT' : 'PENDING_PROVIDER';
  const log = await prisma.smsLog.create({ data: { phone, type, message, status } });
  if (config.smsMode === 'console') {
    console.log(`\n[MOCK SMS][${type}] ${phone}: ${message}\n`);
  } else {
    // TODO: وقتی پروایدر واقعی (مثلاً ir.sms) انتخاب شد، اینجا فراخوانی واقعی اضافه می‌شه.
    console.warn(`[SMS] هنوز هیچ پروایدر واقعی برای SMS_MODE="${config.smsMode}" وصل نشده.`);
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
