import { prisma } from '../lib/prisma.js';
import { addMinutes, combineDateAndTime, generateInvoiceNumber, generateTrackingCode } from '../lib/time.js';
import { getSettings, numberSetting } from './settings.service.js';
import { assertTablesAvailable } from './availability.service.js';

async function uniqueTrackingCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateTrackingCode();
    const existing = await prisma.reservation.findUnique({ where: { trackingCode: code } });
    if (!existing) return code;
  }
  throw new Error('ساخت کد پیگیری ناموفق بود.');
}

async function uniqueInvoiceNumber() {
  for (let i = 0; i < 10; i++) {
    const number = generateInvoiceNumber();
    const existing = await prisma.invoice.findUnique({ where: { number } });
    if (!existing) return number;
  }
  throw new Error('ساخت شماره فاکتور ناموفق بود.');
}

export async function createReservationHold({ tableIds, date, startTime, durationMinutes, guestCount, customerName, customerPhone, userId = null, source = 'ONLINE', originalReservationId = null }) {
  if (!Array.isArray(tableIds) || tableIds.length < 1 || tableIds.length > 2) throw new Error('انتخاب میز نامعتبر است.');
  await assertTablesAvailable({ tableIds, date, startTime, durationMinutes, guestCount });

  const settings = await getSettings();
  const pricePerGuest = numberSetting(settings, 'pricePerGuest', 100000);
  const holdMinutes = numberSetting(settings, 'holdMinutes', 10);
  const totalAmount = pricePerGuest * guestCount;
  const startAt = combineDateAndTime(date, startTime);
  const endAt = addMinutes(startAt, durationMinutes);
  const trackingCode = await uniqueTrackingCode();
  const invoiceNumber = await uniqueInvoiceNumber();
  const holdExpiresAt = addMinutes(new Date(), holdMinutes);

  return prisma.reservation.create({
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
      tables: { create: tableIds.map((tableId) => ({ tableId })) },
      invoice: { create: { number: invoiceNumber, totalAmount } },
      payments: {
        create: {
          amount: totalAmount,
          status: source === 'ADMIN_MANUAL' ? 'PAID' : 'PENDING',
          method: source === 'ADMIN_MANUAL' ? 'MANUAL' : 'ZARINPAL',
          provider: source === 'ADMIN_MANUAL' ? 'manual' : 'zarinpal',
          isMock: false
        }
      }
    },
    include: { tables: { include: { table: true } }, payments: true, invoice: true, user: true }
  });
}

export async function getReservationFull(idOrCode) {
  const where = idOrCode.startsWith?.('RSV-') ? { trackingCode: idOrCode } : { id: idOrCode };
  return prisma.reservation.findUnique({
    where,
    include: { tables: { include: { table: true } }, payments: { orderBy: { createdAt: 'desc' } }, invoice: true, user: true }
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
  return prisma.reservation.update({ where: { id: reservationId }, data: { status: 'CANCELLED', notes: note || reservation.notes } });
}

export async function commitChangeIfReady(changeReservationId) {
  const change = await getReservationFull(changeReservationId);
  if (!change || !change.originalReservationId) throw new Error('درخواست تغییر پیدا نشد.');
  if (change.status !== 'CONFIRMED') throw new Error('تغییر هنوز تایید نشده است.');
  await prisma.reservation.update({ where: { id: change.originalReservationId }, data: { status: 'CANCELLED', notes: 'با رزرو جدید جایگزین شد.' } });
  return change;
}
