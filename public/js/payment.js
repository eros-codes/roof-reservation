import { api, faDateTime, toman } from './api.js';
import { ICONS, mountHoldRing, initHeaderScroll } from './ui.js';

initHeaderScroll();

const id = new URLSearchParams(location.search).get('id');
const box = document.getElementById('paymentBox');
let reservation = null;
let ring = null;

function tablesText(r) { return r.tables.map((rt) => rt.table.displayNumber).join(' و '); }
function endTimeText(r) { return new Date(r.endAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); }
function row(icon, label, value) {
  return `<div class="detail-row"><span class="ico">${icon}</span><span>${label}: <strong>${value}</strong></span></div>`;
}

function renderInvalid(message) {
  box.innerHTML = `<h3>پرداخت</h3><div class="notice danger">${message}</div><div class="actions"><a class="primary-btn" href="/">رزرو جدید</a></div>`;
}

function renderExpired() {
  if (ring) ring.stop();
  box.innerHTML = `
    <div class="result-state">
      <div class="result-icon warn">${ICONS.clock}</div>
      <h3>زمان نگه‌داری تمام شد</h3>
      <p>میز دیگر برات نگه داشته نمی‌شه؛ از صفحه‌ی رزرو دوباره انتخاب کن.</p>
      <a class="primary-btn" href="/" style="max-width:200px">انتخاب دوباره</a>
    </div>`;
}

function renderResult(kind, data) {
  if (ring) ring.stop();
  if (kind === 'success') {
    box.innerHTML = `
      <div class="result-state">
        <div class="result-icon ok">${ICONS.check}</div>
        <h3>پرداخت موفق بود</h3>
        <p>رزروت تایید شد.</p>
        <div class="tracking-code">${reservation.trackingCode}</div>
      </div>`;
    setTimeout(() => { location.href = `/invoice.html?id=${reservation.id}`; }, 1400);
    return;
  }
  if (kind === 'fail') {
    box.innerHTML = `
      <div class="result-state">
        <div class="result-icon fail">${ICONS.x}</div>
        <h3>پرداخت ناموفق بود</h3>
        <p>${data?.message || 'میز تا پایان زمان نگه‌داری همچنان براته.'}</p>
        <button class="primary-btn" id="retryPay" style="max-width:180px">تلاش دوباره</button>
      </div>`;
    document.getElementById('retryPay').addEventListener('click', () => init());
    return;
  }
  box.innerHTML = `
    <div class="result-state">
      <div class="result-icon warn">${ICONS.clock}</div>
      <h3>در حال بررسی پرداخت</h3>
      <p>${data?.message || 'نتیجه هنوز مشخص نیست؛ بعد از بررسی نهایی می‌شود.'}</p>
      <a class="secondary-btn" href="/profile.html">پیگیری از پروفایل</a>
    </div>`;
}

function render() {
  const holdActive = ['HOLD', 'PAYMENT_PENDING'].includes(reservation.status) && reservation.holdExpiresAt && new Date(reservation.holdExpiresAt) > new Date();

  box.innerHTML = `
    <h3>خلاصه رزرو</h3>
    <div style="margin-bottom:16px">
      ${row(ICONS.receipt, 'کد پیگیری', reservation.trackingCode)}
      ${row(ICONS.table, 'میز', tablesText(reservation))}
      ${row(ICONS.clock, 'زمان', `${faDateTime(reservation.startAt)} تا ${endTimeText(reservation)}`)}
      ${row(ICONS.users, 'تعداد نفرات', reservation.guestCount.toLocaleString('fa-IR'))}
      <div class="amount-row"><span>مبلغ قابل پرداخت</span><strong>${toman(reservation.totalAmount)}</strong></div>
    </div>

    ${holdActive ? `
      <div class="hold-ring-wrap" style="margin-bottom:16px">
        <div id="ringMount"></div>
        <div class="hold-ring-text"><strong>زمان نگه‌داری میز</strong><span>جای رزروت تا پایان این تایمر محفوظه.</span></div>
      </div>` : ''}

    <div class="actions" style="flex-direction:column">
      <button class="primary-btn" id="successPay">${ICONS.check}<span>پرداخت موفق</span></button>
      <button class="secondary-btn" id="failPay">${ICONS.x}<span>پرداخت ناموفق</span></button>
      <button class="danger-btn" id="reviewPay">نیاز به بررسی</button>
    </div>
  `;

  if (holdActive) ring = mountHoldRing(document.getElementById('ringMount'), reservation.holdExpiresAt, { onExpire: renderExpired });
  document.getElementById('successPay').onclick = () => pay('success');
  document.getElementById('failPay').onclick = () => pay('fail');
  document.getElementById('reviewPay').onclick = () => pay('review');
}

async function pay(result) {
  document.querySelectorAll('#paymentBox button').forEach((b) => b.disabled = true);
  try {
    const data = await api(`/api/payments/${reservation.id}/mock`, { method: 'POST', body: { result } });
    renderResult(result === 'success' ? 'success' : result === 'fail' ? 'fail' : 'review', data);
  } catch (error) {
    document.querySelectorAll('#paymentBox button').forEach((b) => b.disabled = false);
    renderResult('fail', { message: error.message });
  }
}

async function init() {
  if (!id) return renderInvalid('شناسه رزرو در آدرس صفحه پیدا نشد.');
  const { reservation: r } = await api(`/api/reservations/${id}`);
  reservation = r;
  if (reservation.status === 'CONFIRMED') { location.href = `/invoice.html?id=${reservation.id}`; return; }
  if (['CANCELLED', 'EXPIRED'].includes(reservation.status)) return renderExpired();
  render();
}

init().catch((error) => renderInvalid(error.message));
