import { prisma } from './prisma.js';

export async function sendMockSms({ phone, type, message }) {
  const log = await prisma.smsLog.create({ data: { phone, type, message, status: 'MOCK_SENT' } });
  console.log(`\n[MOCK SMS][${type}] ${phone}: ${message}\n`);
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
