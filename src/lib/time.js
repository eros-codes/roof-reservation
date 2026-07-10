export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function timeToMinutes(time) {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
}

export function dateOnlyString(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

export function combineDateAndTime(dateString, timeString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const [hour, minute] = timeString.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60 * 1000);
}

export function overlapWithBuffer(startA, endA, startB, endB, bufferMinutes = 0) {
  const bufferedStartB = addMinutes(startB, -bufferMinutes);
  const bufferedEndB = addMinutes(endB, bufferMinutes);
  return startA < bufferedEndB && endA > bufferedStartB;
}

export function makeTimeSlots(openTime, closeTime, intervalMinutes = 15) {
  const slots = [];
  for (let m = timeToMinutes(openTime); m <= timeToMinutes(closeTime); m += intervalMinutes) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

export function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[^0-9+]/g, '');
}

export function generateTrackingCode() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `RSV-${n}`;
}

export function generateInvoiceNumber() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `INV-${n}`;
}

export function toFaZone(zone) {
  return { WINDOW: 'کنار پنجره', CENTER: 'وسط', ROOF: 'روف' }[zone] || zone;
}

export function toFaReservationStatus(status) {
  return {
    DRAFT: 'پیش‌نویس',
    HOLD: 'رزرو موقت',
    PAYMENT_PENDING: 'در انتظار پرداخت',
    PAYMENT_REVIEW: 'نیازمند بررسی پرداخت',
    CONFIRMED: 'تایید شده',
    CHANGE_PENDING: 'در انتظار تغییر',
    CANCELLED: 'لغو شده',
    COMPLETED: 'انجام شده',
    NO_SHOW: 'عدم حضور',
    EXPIRED: 'منقضی شده'
  }[status] || status;
}
