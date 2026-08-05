import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll, escapeHtml, faHours, detailRow as row, tablesText } from './ui.js';

initHeaderScroll();

function icsDate(value) {
	return new Date(value)
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
}

function escapeIcs(text) {
	return String(text || '')
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\n/g, '\\n');
}

function downloadCalendarFile(reservation) {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Roof//Reservation//FA',
		'BEGIN:VEVENT',
		`UID:${reservation.trackingCode}@roof`,
		`DTSTAMP:${icsDate(new Date())}`,
		`DTSTART:${icsDate(reservation.startAt)}`,
		`DTEND:${icsDate(reservation.endAt)}`,
		`SUMMARY:${escapeIcs('رزرو میز در کافه Roof')}`,
		`DESCRIPTION:${escapeIcs(`کد پیگیری: ${reservation.trackingCode}\nمیز ${tablesText(reservation)}\n${reservation.guestCount} نفر`)}`,
		'BEGIN:VALARM',
		'TRIGGER:-PT3H',
		'ACTION:DISPLAY',
		`DESCRIPTION:${escapeIcs('۳ ساعت تا رزرو کافه Roof')}`,
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR',
	];

	const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `roof-${reservation.trackingCode}.ics`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

const id = new URLSearchParams(location.search).get('id');
const box = document.getElementById('invoiceBox');

const PAYMENT_STATUS_FA = {
	PENDING: 'در انتظار',
	PAID: 'پرداخت‌شده',
	FAILED: 'ناموفق',
	REVIEW: 'در حال بررسی',
	REFUND_PENDING: 'در انتظار بازگشت وجه',
	REFUNDED: 'بازگشت داده شده',
};
const REFUND_STATUS_FA = {
	PENDING: 'در انتظار بازگشت به شما',
	DONE: 'بازگشت داده شد',
};

async function init() {
	if (!id) throw new Error('شناسه فاکتور در آدرس پیدا نشد.');
	box.innerHTML = '<div class="notice">در حال بارگذاری فاکتور…</div>';
	const { reservation } = await api(`/api/reservations/${encodeURIComponent(id)}`);
	const payment = reservation.payments?.[0] || {};

	box.innerHTML = `
    <div class="invoice-head">
      <div>
        <h3 style="margin-bottom:6px">فاکتور رزرو Roof</h3>
        <span class="invoice-num">کد پیگیری ${escapeHtml(reservation.trackingCode)}</span>
      </div>
      <div style="text-align:left">
        <div class="brand-word" style="font-size:22px">${escapeHtml(reservation.invoice?.number || '—')}</div>
        <span class="status ${escapeHtml(reservation.status)}" style="margin-top:6px">${escapeHtml(statusFa(reservation.status))}</span>
      </div>
    </div>

    ${row('نام مشتری', reservation.customerName)}
    ${row('شماره موبایل', reservation.customerPhone)}
    ${row('تاریخ و ساعت', faDateTime(reservation.startAt))}
    ${row('مدت رزرو', `${faHours(reservation.durationMinutes)} ساعت`)}
    ${row('میز', tablesText(reservation))}
    ${row('تعداد نفرات', Number(reservation.guestCount || 0).toLocaleString('fa-IR'))}
    ${reservation.decorationAmount > 0 ? row('تزئین میز', `${toman(reservation.decorationAmount)}${reservation.decorationNote ? ` · ${reservation.decorationNote}` : ''}`) : ''}
    ${row('قیمت هر نفر', toman(reservation.pricePerGuest))}
    ${row('وضعیت پرداخت', payment.status ? PAYMENT_STATUS_FA[payment.status] || payment.status : '—')}
    ${payment.refId ? row('کد پیگیری پرداخت', payment.refId) : ''}
    ${reservation.refundStatus && reservation.refundStatus !== 'NONE' ? row('وضعیت بازگشت وجه', REFUND_STATUS_FA[reservation.refundStatus] || reservation.refundStatus) : ''}

    <div class="amount-row"><span>مبلغ کل</span><strong>${toman(reservation.totalAmount)}</strong></div>

    <div class="actions">
      <button class="primary-btn" id="printBtn">${ICONS.receipt}<span>پرینت فاکتور</span></button>
      <button class="secondary-btn" id="calendarBtn">${ICONS.calendar}<span>افزودن به تقویم</span></button>
      <a class="secondary-btn" href="/profile.html">پروفایل من</a>
    </div>
  `;
	document.getElementById('printBtn').addEventListener('click', () => window.print());
	document.getElementById('calendarBtn').addEventListener('click', () => downloadCalendarFile(reservation));
}

init().catch((error) => {
	box.innerHTML = `<div class="notice danger"></div><div class="actions"><a class="secondary-btn" href="/">بازگشت به رزرو</a></div>`;
	box.querySelector('.notice').textContent = error.message;
});
