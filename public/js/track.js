import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll } from './ui.js';
import { mountOtpWidget } from './otp-widget.js';

initHeaderScroll();

const result = document.getElementById('result');
result.innerHTML = `${ICONS.search}<strong>هنوز رزروی نمایش داده نشده</strong><p>فرم کناری رو پر کن تا جزئیات رزرو رو ببینی.</p>`;
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
function row(label, value) { return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }

mountOtpWidget(document.getElementById('otpBox'), {
  purpose: 'GUEST_ACCESS',
  extraFields: [{ key: 'trackingCode', label: 'کد پیگیری', placeholder: 'RSV-123456' }],
  submitLabel: 'نمایش رزرو',
  onVerified: async (data) => {
    try {
      const { reservation } = await api(`/api/reservations/${data.reservationId}`);
      result.className = '';
      result.innerHTML = `
        ${row('کد پیگیری', reservation.trackingCode)}
        ${row('نام', reservation.customerName)}
        ${row('زمان', faDateTime(reservation.startAt))}
        ${row('میز', reservation.tables.map((t) => t.table.displayNumber).join(' و '))}
        ${row('مبلغ', toman(reservation.totalAmount))}
        <div class="detail-row"><span>وضعیت</span><span class="status ${reservation.status}">${statusFa(reservation.status)}</span></div>
        <div class="actions"><a class="secondary-btn" href="/invoice.html?id=${reservation.id}">${ICONS.receipt}<span>فاکتور</span></a></div>
      `;
    } catch (error) {
      result.className = 'notice danger';
      result.textContent = error.message;
    }
  }
});
