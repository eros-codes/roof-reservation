import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll } from './ui.js';

initHeaderScroll();

const box = document.getElementById('profileBox');
const notice = document.getElementById('loginNotice');

function dateBlock(iso) {
  const d = new Date(iso);
  return `<div class="timeline-date"><strong>${d.toLocaleDateString('fa-IR', { day: 'numeric' })}</strong><span>${d.toLocaleDateString('fa-IR', { month: 'short' })}</span></div>`;
}

function renderList(reservations) {
  if (!reservations.length) {
    box.innerHTML = `<div class="empty-state">${ICONS.empty}<strong>هنوز رزروی ثبت نشده</strong><p>از صفحه اصلی یک تاریخ انتخاب کن تا اولین رزروت اینجا بیفته.</p></div>`;
    return;
  }
  box.innerHTML = `<div class="timeline">${reservations.map((r) => `
    <div class="timeline-item">
      ${dateBlock(r.startAt)}
      <div class="timeline-body">
        <strong>میز ${r.tables.map((t) => t.table.displayNumber).join(' و ')} · ${r.guestCount.toLocaleString('fa-IR')} نفر</strong>
        <span>${faDateTime(r.startAt)} · ${toman(r.totalAmount)}</span>
      </div>
      <div class="timeline-actions">
        <span class="status ${r.status}">${statusFa(r.status)}</span>
        <a class="secondary-btn" href="/invoice.html?id=${r.id}">فاکتور</a>
      </div>
    </div>`).join('')}</div>`;
}

async function loadMe() {
  const { user } = await api('/api/me');
  if (!user) {
    box.className = '';
    box.innerHTML = `<div class="empty-state">${ICONS.phone}<strong>هنوز وارد نشده‌ای</strong><p>از فرم کناری با موبایلت وارد شو تا رزروهات نمایش داده بشه.</p></div>`;
    return;
  }
  notice.className = 'notice ok';
  notice.textContent = `وارد شده با شماره ${user.phone}`;
  box.className = '';
  const { reservations } = await api('/api/reservations/profile/list');
  renderList(reservations);
}

document.getElementById('sendOtp').onclick = async () => {
  try {
    const data = await api('/api/otp/send', { method: 'POST', body: { phone: document.getElementById('phone').value, purpose: 'LOGIN' } });
    notice.className = 'notice ok';
    notice.textContent = `کد ارسال شد${data.devCode ? ` — کد آزمایشی: ${data.devCode}` : ''}`;
  } catch (error) { notice.className = 'notice danger'; notice.textContent = error.message; }
};

document.getElementById('verifyOtp').onclick = async () => {
  try {
    await api('/api/otp/verify', { method: 'POST', body: { phone: document.getElementById('phone').value, code: document.getElementById('code').value, name: document.getElementById('name').value, purpose: 'LOGIN' } });
    await loadMe();
  } catch (error) { notice.className = 'notice danger'; notice.textContent = error.message; }
};

document.getElementById('logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.reload(); };

loadMe().catch((error) => { box.innerHTML = `<div class="notice danger">${error.message}</div>`; });
