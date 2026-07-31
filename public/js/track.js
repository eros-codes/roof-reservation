import { api, faDateTime, statusFa, toman } from './api.js';
import { escapeHtml, ICONS, initHeaderScroll, detailRow as row, tablesText } from './ui.js';
import { mountOtpWidget } from './otp-widget.js';

initHeaderScroll();

const result = document.getElementById('result');
result.innerHTML = `${ICONS.search}<strong>هنوز رزروی نمایش داده نشده</strong><p>فرم کناری رو پر کن تا جزئیات رزرو رو ببینی.</p>`;

function render(reservation) {
	result.className = '';
	result.innerHTML = `
        ${row('کد پیگیری', reservation.trackingCode)}
        ${row('نام', reservation.customerName)}
        ${row('زمان', faDateTime(reservation.startAt))}
        ${row('میز', tablesText(reservation))}
        ${row('مبلغ', toman(reservation.totalAmount))}
        <div class="detail-row"><span>وضعیت</span><span class="status ${escapeHtml(reservation.status)}">${escapeHtml(statusFa(reservation.status))}</span></div>
        <div class="actions"><a class="secondary-btn" href="/invoice.html?id=${encodeURIComponent(reservation.id)}">${ICONS.receipt}<span>فاکتور</span></a></div>
      `;
}

const otpBox = document.getElementById('otpBox');

function mountGuestFlow(notice = '') {
	mountOtpWidget(otpBox, {
		purpose: 'GUEST_ACCESS',
		extraFields: [{ key: 'trackingCode', label: 'کد پیگیری', placeholder: 'RSV-123456' }],
		submitLabel: 'نمایش رزرو',
		onVerified: async (data) => {
			try {
				if (!data?.reservationId) throw new Error('رزروی برای این کد پیگیری پیدا نشد.');
				const { reservation } = await api(`/api/reservations/${data.reservationId}`);
				render(reservation);
			} catch (error) {
				result.className = 'notice danger';
				result.textContent = error.message;
			}
		},
	});
	if (notice) {
		const box = otpBox.querySelector('[data-otp-notice]');
		if (box) {
			box.className = 'notice warn';
			box.textContent = notice;
		}
	}
}

// کاربر واردشده اگر مالک رزرو باشد نیازی به تایید پیامکی ندارد
function mountLoggedInFlow() {
	otpBox.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>کد پیگیری</label><input id="quickCode" placeholder="RSV-123456"></div>
      <button type="button" class="primary-btn" id="quickShow">نمایش رزرو</button>
      <div id="quickNotice"></div>
    </div>
  `;
	const btn = document.getElementById('quickShow');
	const notice = document.getElementById('quickNotice');
	btn.addEventListener('click', async () => {
		const code = document.getElementById('quickCode').value.trim().toUpperCase();
		if (!code) {
			notice.className = 'notice danger';
			notice.textContent = 'کد پیگیری رو وارد کن.';
			return;
		}
		btn.disabled = true;
		try {
			const { reservation } = await api(`/api/reservations/${encodeURIComponent(code)}`);
			render(reservation);
		} catch (error) {
			// این رزرو مال حساب فعلی نیست؛ برگشت به مسیر تایید پیامکی
			if (error.status === 403 || error.status === 404) {
				mountGuestFlow('این رزرو به حساب شما وصل نیست؛ با تایید پیامکی ادامه بده.');
				return;
			}
			notice.className = 'notice danger';
			notice.textContent = error.message;
		} finally {
			btn.disabled = false;
		}
	});
}

api('/api/me')
	.then(({ user }) => (user ? mountLoggedInFlow() : mountGuestFlow()))
	.catch(() => mountGuestFlow());
