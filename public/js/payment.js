import { api, faDateTime, toman } from './api.js';
import { ICONS, mountHoldRing, initHeaderScroll } from './ui.js';

initHeaderScroll();

const id = new URLSearchParams(location.search).get('id');
const resultParam = new URLSearchParams(location.search).get('result');
const box = document.getElementById('paymentBox');
let reservation = null;
let ring = null;

function tablesText(r) { return r.tables.map((rt) => rt.table.displayNumber).join(' و '); }
function endTimeText(r) { return new Date(r.endAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); }
function escapeHtml(str) {
	return String(str).replace(
		/[&<>"']/g,
		(c) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[c],
	);
}
function row(icon, label, value) {
  return `<div class="detail-row"><span class="ico">${icon}</span><span>${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong></span></div>`;
}

function renderInvalid(message) {
  box.innerHTML = `<h3>پرداخت</h3><div class="notice danger">${message}</div><div class="actions"><a class="primary-btn" href="/">رزرو جدید</a></div>`;
}

function renderExpired(title = 'زمان نگه‌داری تمام شد', message = 'میز دیگر برات نگه داشته نمی‌شه؛ از صفحه‌ی رزرو دوباره انتخاب کن.') {
  if (ring) ring.stop();
  box.innerHTML = `
    <div class="result-state">
      <div class="result-icon warn">${ICONS.clock}</div>
      <h3>${title}</h3>
      <p>${message}</p>
      <a class="primary-btn" href="/" style="max-width:200px">انتخاب دوباره</a>
    </div>`;
}

function renderSuccess() {
  if (ring) ring.stop();
  box.innerHTML = `
    <div class="result-state">
      <div class="result-icon ok">${ICONS.check}</div>
      <h3>پرداخت موفق بود</h3>
      <p>رزروت تایید شد.</p>
      <div class="tracking-code">${reservation.trackingCode}</div>
    </div>`;
  setTimeout(() => { location.href = `/invoice.html?id=${reservation.id}`; }, 1400);
}

function renderFail(message) {
  if (ring) ring.stop();
  box.innerHTML = `
    <div class="result-state">
      <div class="result-icon fail">${ICONS.x}</div>
      <h3>پرداخت ناموفق بود</h3>
      <p>${message || 'میز تا پایان زمان نگه‌داری همچنان براته؛ می‌تونی دوباره تلاش کنی.'}</p>
      <button class="primary-btn" id="retryPay" style="max-width:180px">تلاش دوباره</button>
    </div>`;
  document
		.getElementById("retryPay")
		.addEventListener("click", () =>
			init().catch((error) => renderInvalid(error.message)),
		);
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

    <div class="actions">
      <button class="primary-btn" id="payBtn">${ICONS.check}<span>پرداخت</span></button>
    </div>
  `;

  if (holdActive) ring = mountHoldRing(document.getElementById('ringMount'), reservation.holdExpiresAt, { onExpire: renderExpired });
  document.getElementById('payBtn').addEventListener('click', pay);
}

async function pay() {
  const btn = document.getElementById('payBtn');
  btn.disabled = true;
  try {
    const { paymentUrl } = await api(`/api/payments/${reservation.id}/request`, { method: 'POST' });
    location.href = paymentUrl;
  } catch (error) {
    btn.disabled = false;
    renderFail(error.message);
  }
}

async function init() {
  if (!id) return renderInvalid('شناسه رزرو در آدرس صفحه پیدا نشد.');
  const { reservation: r } = await api(`/api/reservations/${id}`);
  reservation = r;

  // برگشت از درگاه زرین‌پال - بک‌اند خودش تو callback همه‌چیو verify و ثبت کرده
  if (resultParam === 'success' || reservation.status === 'CONFIRMED') return renderSuccess();
  if (resultParam === 'fail') return renderFail();

  if (reservation.status === 'CANCELLED') return renderExpired('این رزرو لغو شده', 'این رزرو لغو شده؛ از صفحه‌ی رزرو می‌تونی دوباره یه میز انتخاب کنی.');
  if (reservation.status === 'EXPIRED') return renderExpired();
  render();
}

init().catch((error) => renderInvalid(error.message));
