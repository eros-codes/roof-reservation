import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll } from './ui.js';

initHeaderScroll();

const id = new URLSearchParams(location.search).get('id');
const box = document.getElementById('invoiceBox');

const PAYMENT_STATUS_FA = { PENDING: 'در انتظار', PAID: 'پرداخت‌شده', FAILED: 'ناموفق', REVIEW: 'در حال بررسی', REFUND_PENDING: 'در انتظار بازگشت وجه', REFUNDED: 'بازگشت داده شده' };
function tablesText(r) { return r.tables.map((rt) => rt.table.displayNumber).join(' و '); }
function row(label, value) { return `<div class="detail-row"><span>${label}</span><strong>${value}</strong></div>`; }

async function init() {
  if (!id) throw new Error('شناسه فاکتور در آدرس پیدا نشد.');
  const { reservation } = await api(`/api/reservations/${id}`);
  const payment = reservation.payments[0] || {};

  box.innerHTML = `
    <div class="invoice-head">
      <div>
        <h3 style="margin-bottom:6px">فاکتور رزرو Roof</h3>
        <span class="invoice-num">کد پیگیری ${reservation.trackingCode}</span>
      </div>
      <div style="text-align:left">
        <div class="brand-word" style="font-size:22px">${reservation.invoice?.number || '—'}</div>
        <span class="status ${reservation.status}" style="margin-top:6px">${statusFa(reservation.status)}</span>
      </div>
    </div>

    ${row('نام مشتری', reservation.customerName)}
    ${row('شماره موبایل', reservation.customerPhone)}
    ${row('تاریخ و ساعت', faDateTime(reservation.startAt))}
    ${row('مدت رزرو', `${(reservation.durationMinutes / 60).toLocaleString('fa-IR')} ساعت`)}
    ${row('میز', tablesText(reservation))}
    ${row('تعداد نفرات', reservation.guestCount.toLocaleString('fa-IR'))}
    ${row('قیمت هر نفر', toman(reservation.pricePerGuest))}
    ${row('وضعیت پرداخت', payment.status ? (PAYMENT_STATUS_FA[payment.status] || payment.status) : '—')}
    ${payment.refId ? row('کد رهگیری زرین‌پال', payment.refId) : ''}

    <div class="amount-row"><span>مبلغ کل</span><strong>${toman(reservation.totalAmount)}</strong></div>

    <div class="actions">
      <button class="primary-btn" id="printBtn">${ICONS.receipt}<span>پرینت فاکتور</span></button>
      <a class="secondary-btn" href="/profile.html">پروفایل من</a>
    </div>
  `;
  document.getElementById('printBtn').addEventListener('click', () => window.print());
}

init().catch((error) => { box.innerHTML = `<div class="notice danger">${error.message}</div><div class="actions"><a class="secondary-btn" href="/">بازگشت به رزرو</a></div>`; });
