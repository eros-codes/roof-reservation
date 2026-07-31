import { api, faDateTime, toman } from './api.js';
import { ICONS, mountHoldRing, initHeaderScroll, escapeHtml, tablesText } from './ui.js';

initHeaderScroll();

const id = new URLSearchParams(location.search).get('id');
let resultParam = new URLSearchParams(location.search).get('result');
const box = document.getElementById('paymentBox');
let reservation = null;
let ring = null;

function endTimeText(r) {
	return new Date(r.endAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}
function row(icon, label, value) {
	return `<div class="detail-row"><span class="ico">${icon}</span><span>${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong></span></div>`;
}

function renderInvalid(message) {
	box.innerHTML = `<h3>پرداخت</h3><div class="notice danger"></div><div class="actions"><a class="primary-btn" href="/">رزرو جدید</a></div>`;
	box.querySelector('.notice').textContent = message;
}

function renderExpired(title = 'زمان نگه‌داری تمام شد', message = 'میز دیگر برات نگه داشته نمی‌شه؛ از صفحه‌ی رزرو دوباره انتخاب کن.') {
	if (ring) ring.stop();
	box.innerHTML = `
    <div class="result-state">
      <div class="result-icon warn">${ICONS.clock}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <a class="primary-btn" href="/" style="max-width:200px">انتخاب دوباره</a>
    </div>`;
}

function renderReview() {
	if (ring) ring.stop();
	box.innerHTML = `
    <div class="result-state">
      <div class="result-icon warn">${ICONS.clock}</div>
      <h3>پرداخت در حال بررسیه</h3>
      <p>پرداختت ثبت شده و داره بررسی می‌شه؛ نتیجه‌ش به‌زودی مشخص می‌شه. لازم نیست دوباره پرداخت کنی.</p>
      <button class="secondary-btn" id="refreshStatus" style="max-width:200px">بررسی وضعیت</button>
    </div>`;
	document.getElementById('refreshStatus').addEventListener('click', () => init().catch((error) => renderInvalid(error.message)));
}

function renderSuccess() {
	if (ring) ring.stop();
	box.innerHTML = `
    <div class="result-state">
      <div class="result-icon ok">${ICONS.check}</div>
      <h3>پرداخت موفق بود</h3>
      <p>رزروت تایید شد.</p>
      <div class="tracking-code">${escapeHtml(reservation.trackingCode)}</div>

    </div>`;
	setTimeout(() => {
		location.href = `/invoice.html?id=${encodeURIComponent(reservation.id)}`;
	}, 1400);
}

function renderFail(message) {
	if (ring) ring.stop();
	box.innerHTML = `
    <div class="result-state">
      <div class="result-icon fail">${ICONS.x}</div>
      <h3>پرداخت ناموفق بود</h3>
      <p>${escapeHtml(message || 'میز تا پایان زمان نگه‌داری همچنان براته؛ می‌تونی دوباره تلاش کنی.')}</p>
      <button class="primary-btn" id="retryPay" style="max-width:180px">تلاش دوباره</button>
    </div>`;
	document.getElementById('retryPay').addEventListener('click', () => init().catch((error) => renderInvalid(error.message)));
}

function render() {
	if (ring) {
		ring.stop();
		ring = null;
	}
	const holdActive =
		['HOLD', 'PAYMENT_PENDING'].includes(reservation.status) &&
		reservation.holdExpiresAt &&
		new Date(reservation.holdExpiresAt) > new Date();

	box.innerHTML = `
    <h3>خلاصه رزرو</h3>
    <div style="margin-bottom:16px">
      ${row(ICONS.receipt, 'کد پیگیری', reservation.trackingCode)}
      ${row(ICONS.table, 'میز', tablesText(reservation))}
      ${row(ICONS.clock, 'زمان', `${faDateTime(reservation.startAt)} تا ${endTimeText(reservation)}`)}
      ${row(ICONS.users, 'تعداد نفرات', Number(reservation.guestCount || 0).toLocaleString('fa-IR'))}
      <div class="amount-row"><span>مبلغ قابل پرداخت</span><strong>${toman(reservation.totalAmount)}</strong></div>
    </div>

    ${
			holdActive
				? `
      <div class="hold-ring-wrap" style="margin-bottom:16px">
        <div id="ringMount"></div>
        <div class="hold-ring-text"><strong>زمان نگه‌داری میز</strong><span>جای رزروت تا پایان این تایمر محفوظه.</span></div>
      </div>`
				: ''
		}

    <div class="actions">
      <button class="primary-btn" id="payBtn">${ICONS.check}<span>پرداخت</span></button>
    </div>
  `;

	// دکمه اول وصل می‌شود: اگر تایمر در همان لحظه منقضی باشد، onExpire محتوای
	// box را عوض می‌کند و دیگر payBtn وجود ندارد
	document.getElementById('payBtn').addEventListener('click', pay);
	if (holdActive) {
		// کل مهلت نگه‌داری از فاصله‌ی ساخت رزرو تا انقضا حساب می‌شه، وگرنه
		// حلقه بعد از هر رفرش دوباره از صد درصد شروع می‌کنه
		const holdTotalSeconds = reservation.createdAt
			? Math.max(1, Math.round((new Date(reservation.holdExpiresAt) - new Date(reservation.createdAt)) / 1000))
			: undefined;
		ring = mountHoldRing(document.getElementById('ringMount'), reservation.holdExpiresAt, {
			totalSeconds: holdTotalSeconds,
			onExpire: renderExpired,
		});
	}
}

async function pay() {
	const btn = document.getElementById('payBtn');
	btn.disabled = true;
	try {
		const { paymentUrl } = await api(`/api/payments/${reservation.id}/request`, { method: 'POST' });
		if (!paymentUrl) throw new Error('درگاه پرداخت در دسترس نیست.');
		location.href = paymentUrl;
	} catch (error) {
		btn.disabled = false;
		renderFail(error.message);
	}
}

async function init() {
	if (!id) return renderInvalid('شناسه رزرو در آدرس صفحه پیدا نشد.');
	box.innerHTML = '<div class="notice">در حال بارگذاری…</div>';
	const { reservation: r } = await api(`/api/reservations/${id}`);
	reservation = r;

	// resultParam فقط یه‌بار مصرف می‌شه؛ وگرنه بعد از یه پرداخت ناموفق، دکمه‌ی
	// «تلاش دوباره» چون همون ?result=fail هنوز تو آدرس/حافظه‌ست، هر بار init()
	// رو که دوباره صدا می‌زنه بازم مستقیم می‌ره رو همون صفحه‌ی fail، انگار
	// اصلاً تلاش دوباره‌ای اتفاق نیفتاده.
	const currentResult = resultParam;
	resultParam = null;
	if (currentResult) history.replaceState(null, '', `${location.pathname}?id=${encodeURIComponent(id)}`);

	// برگشت از درگاه زرین‌پال - بک‌اند خودش تو callback همه‌چیو verify و ثبت کرده
	if (currentResult === 'success' || reservation.status === 'CONFIRMED') return renderSuccess();
	if (currentResult === 'fail') return renderFail();
	if (reservation.status === 'PAYMENT_REVIEW') return renderReview();

	if (reservation.status === 'CANCELLED')
		return renderExpired('این رزرو لغو شده', 'این رزرو لغو شده؛ از صفحه‌ی رزرو می‌تونی دوباره یه میز انتخاب کنی.');
	if (reservation.status === 'EXPIRED') return renderExpired();
	if (reservation.status === 'COMPLETED' || reservation.status === 'NO_SHOW') {
		return renderExpired('این رزرو بسته شده', 'این رزرو دیگه قابل پرداخت نیست؛ برای رزرو جدید به صفحه‌ی اصلی برو.');
	}
	render();
}

init().catch((error) => renderInvalid(error.message));
