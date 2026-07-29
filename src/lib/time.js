import { randomInt } from 'crypto';

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
	if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error(`فرمت ساعت نامعتبر است: ${time}`);
	if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error(`ساعت خارج از محدوده‌ی معتبر است: ${time}`);
	return h * 60 + m;
}

export function dateOnlyString(date = new Date()) {
	const d = new Date(date);
	// بر اساس وقت محلی (Asia/Tehran) نه UTC، وگرنه بامدادها تاریخ دیروز برمی‌گرده
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
	const step = Number(intervalMinutes);
	// بدون این محافظ، مقدار صفر یا منفی حلقه رو بی‌نهایت می‌کنه و کل سرور قفل می‌شه
	if (!Number.isFinite(step) || step <= 0) {
		throw new Error(`فاصله‌ی زمانی اسلات باید عددی بزرگ‌تر از صفر باشد: ${intervalMinutes}`);
	}
	const slots = [];
	const end = timeToMinutes(closeTime);
	for (let m = timeToMinutes(openTime); m <= end; m += step) {
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
	let p = String(phone || '')
		.trim()
		.replace(/[^0-9+]/g, '');
	if (p.startsWith('+98')) p = '0' + p.slice(3);
	else if (p.startsWith('0098')) p = '0' + p.slice(4);
	else if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
	else if (p.length === 10 && p.startsWith('9')) p = '0' + p;
	return /^09\d{9}$/.test(p) ? p : '';
}

// ۹ رقم به‌جای ۶ رقم: فضای حالت هزار برابر می‌شه و randomInt هم
// برخلاف Math.random قابل حدس زدن نیست (این کدها کلید پیگیری مهمان‌اند)
function randomDigits(length) {
	let out = '';
	for (let i = 0; i < length; i += 1) out += randomInt(0, 10);
	return out;
}

export function generateTrackingCode() {
	return `RSV-${randomDigits(9)}`;
}

export function generateInvoiceNumber() {
	return `INV-${randomDigits(9)}`;
}

export function toFaZone(zone) {
	return { WINDOW: 'کنار پنجره', CENTER: 'وسط', ROOF: 'روف' }[zone] || zone;
}

export function toFaReservationStatus(status) {
	return (
		{
			DRAFT: 'پیش‌نویس',
			HOLD: 'رزرو موقت',
			PAYMENT_PENDING: 'در انتظار پرداخت',
			PAYMENT_REVIEW: 'نیازمند بررسی پرداخت',
			CONFIRMED: 'تایید شده',
			CHANGE_PENDING: 'در انتظار تغییر',
			CANCELLED: 'لغو شده',
			COMPLETED: 'انجام شده',
			NO_SHOW: 'عدم حضور',
			EXPIRED: 'منقضی شده',
		}[status] || status
	);
}
