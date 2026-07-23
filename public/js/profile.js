import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll } from './ui.js';
import { mountOtpWidget } from './otp-widget.js';

initHeaderScroll();

const q = (id) => document.getElementById(id);

function dateBlock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `<div class="timeline-date"><strong>—</strong><span>—</span></div>`;
  return `<div class="timeline-date"><strong>${d.toLocaleDateString('fa-IR', { day: 'numeric' })}</strong><span>${d.toLocaleDateString('fa-IR', { month: 'short' })}</span></div>`;
}

function renderReservations(reservations) {
  const box = q('reservationsBox');
  box.className = '';
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

function showHub(user) {
  q('loginGate').hidden = true;
  q('loginGateForm').hidden = true;
  q('accountHub').hidden = false;
  q('logoutBtn').hidden = false;
  q('hubGreeting').textContent = user.name ? `سلام ${user.name}` : 'حساب من';
  q('accountName').value = user.name || '';
  q('accountPhone').value = user.phone;
}

function showLoginGate() {
  q('loginGate').hidden = false;
  q('loginGateForm').hidden = false;
  q('accountHub').hidden = true;
  q('logoutBtn').hidden = true;
  mountOtpWidget(q('loginGateForm'), {
    purpose: 'LOGIN',
    extraFields: [{ key: 'name', label: 'نام (اختیاری)' }],
    submitLabel: 'ورود',
    onVerified: async () => { await load(); }
  });
}

q('hubTabs').addEventListener('click', (event) => {
  const btn = event.target.closest('[data-tab]');
  if (!btn) return;
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('[data-tab-panel]').forEach((p) => p.classList.toggle('active', p.dataset.tabPanel === btn.dataset.tab));
});

q('logoutBtn').addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch (error) {
    console.warn('خروج با خطا مواجه شد:', error);
  }
  await load();
});

q('saveAccountBtn').addEventListener('click', async () => {
  const notice = q('accountNotice');
  try {
    const { user } = await api('/api/me', { method: 'PATCH', body: { name: q('accountName').value.trim() } });
    notice.className = 'notice ok';
    notice.textContent = 'ذخیره شد.';
    q('hubGreeting').textContent = user.name ? `سلام ${user.name}` : 'حساب من';
  } catch (error) {
    notice.className = 'notice danger';
    notice.textContent = error.message;
  }
});

async function load() {
  try {
    const { user } = await api('/api/me');
    if (!user) { showLoginGate(); return; }
    showHub(user);
    const { reservations } = await api('/api/reservations/profile/list');
    renderReservations(reservations);
  } catch (error) {
    showLoginGate();
    const notice = q('loginGateForm').querySelector('[data-otp-notice]');
    if (notice) { notice.className = 'notice danger'; notice.textContent = error.message; }
  }
}

load();
