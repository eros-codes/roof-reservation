import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll } from './ui.js';

initHeaderScroll();

const notice = document.getElementById('notice');
const result = document.getElementById('result');
result.innerHTML = `${ICONS.search}<strong>هنوز رزروی نمایش داده نشده</strong><p>فرم کناری رو پر کن تا جزئیات رزرو رو ببینی.</p>`;

function row(label, value) { return `<div class="detail-row"><span>${label}</span><strong>${value}</strong></div>`; }

document.getElementById('sendOtp').onclick = async () => {
  try {
    const data = await api('/api/otp/send', { method: 'POST', body: { phone: document.getElementById('phone').value, purpose: 'GUEST_ACCESS' } });
    notice.className = 'notice ok';
    notice.textContent = `کد ارسال شد${data.devCode ? ` — کد آزمایشی: ${data.devCode}` : ''}`;
  } catch (error) { notice.className = 'notice danger'; notice.textContent = error.message; }
};

document.getElementById('verifyOtp').onclick = async () => {
  try {
    const trackingCode = document.getElementById('trackingCode').value;
    const data = await api('/api/otp/verify', { method: 'POST', body: { phone: document.getElementById('phone').value, code: document.getElementById('code').value, purpose: 'GUEST_ACCESS', trackingCode } });
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
  } catch (error) { notice.className = 'notice danger'; notice.textContent = error.message; }
};
