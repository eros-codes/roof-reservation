import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll } from './ui.js';

initHeaderScroll();

const state = { admin: null, tables: [], manualSelected: [], manualDuration: 60 };
const el = (id) => document.getElementById(id);
const q = (s) => document.querySelector(s);

const SECTIONS = [
  { key: 'dashboard', label: 'داشبورد امروز', icon: 'home' },
  { key: 'reservations', label: 'رزروها', icon: 'list' },
  { key: 'manual', label: 'رزرو دستی', icon: 'plus' },
  { key: 'tables', label: 'مدیریت میزها', icon: 'table' },
  { key: 'hours', label: 'ساعت کاری', icon: 'clock' },
  { key: 'closures', label: 'تعطیلی‌ها', icon: 'ban' },
  { key: 'settings', label: 'قیمت و تنظیمات', icon: 'gear' },
  { key: 'reports', label: 'گزارش‌ها', icon: 'chart' }
];
const ZONE_FA = { WINDOW: 'کنار پنجره', CENTER: 'وسط', ROOF: 'روف' };
const SHAPE_FA = { ROUND: 'گرد', SQUARE: 'مربع', RECTANGLE: 'مستطیل' };
const ROLE_FA = { OWNER: 'مالک', MANAGER: 'مدیر', RECEPTION: 'پذیرش' };
const DAY_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const SETTINGS_FIELDS = [
  ['pricePerGuest', 'قیمت هر نفر (تومان)'],
  ['reservationWindowDays', 'بازه باز بودن رزرو (روز)'],
  ['minLeadMinutes', 'حداقل فاصله از الان (دقیقه)'],
  ['minDurationMinutes', 'حداقل مدت رزرو (دقیقه)'],
  ['maxDurationMinutes', 'حداکثر مدت رزرو (دقیقه)'],
  ['slotIntervalMinutes', 'فاصله اسلات‌ها (دقیقه)'],
  ['cleaningBufferMinutes', 'زمان آماده‌سازی بین رزروها (دقیقه)'],
  ['holdMinutes', 'مدت نگه‌داری hold (دقیقه)'],
  ['reminderBeforeMinutes', 'یادآوری پیامکی قبل از رزرو (دقیقه)']
];

/* ---------- menu / sections ---------- */
function renderMenu() {
  const nav = el('adminMenu');
  nav.innerHTML = SECTIONS.map((s, i) => `<button data-section="${s.key}" class="${i === 0 ? 'active' : ''}">${ICONS[s.icon]}<span>${s.label}</span></button>`).join('');
  nav.querySelectorAll('button').forEach((b) => b.onclick = () => switchSection(b.dataset.section));
}
function switchSection(name) {
  document.querySelectorAll('.admin-menu button').forEach((b) => b.classList.toggle('active', b.dataset.section === name));
  document.querySelectorAll('.admin-section').forEach((s) => s.classList.toggle('active', s.id === name));
}
el('adminLogout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.href = '/admin-login.html'; };

function kpi(icon, label, value) {
  return `<div class="kpi"><div class="kpi-icon">${ICONS[icon]}</div><span>${label}</span><strong>${value}</strong></div>`;
}
function skeletonKpis(n) {
  return Array.from({ length: n }).map(() => `<div class="kpi"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px"></div><div class="skeleton" style="height:22px;width:40%"></div></div>`).join('');
}

/* ---------- dashboard ---------- */
async function loadDashboard() {
  el('dashboardBox').innerHTML = skeletonKpis(4);
  const d = await api('/api/admin/dashboard');
  el('dashboardBox').innerHTML =
    kpi('calendar', 'رزرو امروز', d.todayReservations.toLocaleString('fa-IR')) +
    kpi('clock', 'پرداخت‌های معلق', d.pendingPayments.toLocaleString('fa-IR')) +
    kpi('ban', 'عدم حضور (No-show)', d.noShows.toLocaleString('fa-IR')) +
    kpi('receipt', 'درآمد کل', toman(d.totalRevenue));
}

/* ---------- reservations ---------- */
function statusOptions() {
  return `<option value="">انتخاب</option>
    <option value="COMPLETED">تکمیل‌شده</option>
    <option value="NO_SHOW">عدم حضور مشتری</option>
    <option value="CANCELLED">لغو رزرو</option>
    ${state.admin.role !== 'RECEPTION' ? '<option value="CONFIRMED">تایید</option>' : ''}`;
}
async function loadReservations() {
  el('reservationBox').innerHTML = `<div class="skeleton" style="height:180px"></div>`;
  const { reservations } = await api('/api/admin/reservations');
  if (!reservations.length) {
    el('reservationBox').innerHTML = `<div class="empty-state">${ICONS.empty}<strong>هنوز رزروی ثبت نشده</strong><p>رزروهای جدید همین‌جا ظاهر می‌شوند.</p></div>`;
    return;
  }
  el('reservationBox').innerHTML = `<table class="table-list"><thead><tr><th>کد</th><th>مشتری</th><th>زمان</th><th>میز</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${reservations.map((r) => `
    <tr>
      <td>${r.trackingCode}</td>
      <td>${r.customerName}<br><small style="color:var(--deep-taupe)">${r.customerPhone}</small></td>
      <td>${faDateTime(r.startAt)}</td>
      <td>${r.tables.map((t) => t.table.displayNumber).join(' و ')}</td>
      <td>${toman(r.totalAmount)}</td>
      <td><span class="status ${r.status}">${statusFa(r.status)}</span></td>
      <td><select data-status="${r.id}">${statusOptions()}</select></td>
    </tr>`).join('')}</tbody></table>`;
  document.querySelectorAll('[data-status]').forEach((s) => s.onchange = async () => {
    if (!s.value) return;
    await api(`/api/admin/reservations/${s.dataset.status}/status`, { method: 'PATCH', body: { status: s.value } });
    await Promise.all([loadReservations(), loadDashboard()]);
  });
}

/* ---------- manual booking ---------- */
function renderDurationChips() {
  const row = el('mDurationRow');
  row.innerHTML = '';
  for (let m = 60; m <= 240; m += 30) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (m === state.manualDuration ? ' active' : '');
    btn.textContent = `${(m / 60).toLocaleString('fa-IR')} ساعت`;
    btn.onclick = () => { state.manualDuration = m; renderDurationChips(); };
    row.appendChild(btn);
  }
}
document.querySelectorAll('[data-mstep]').forEach((btn) => btn.onclick = () => {
  const input = el('mGuests');
  input.value = Math.max(1, Number(input.value || 1) + Number(btn.dataset.mstep));
});

function renderTablePicker() {
  const wrap = el('mTables');
  wrap.innerHTML = '';
  state.tables.forEach((t) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (state.manualSelected.includes(t.id) ? ' active' : '');
    btn.textContent = `میز ${t.displayNumber} · ${ZONE_FA[t.zone] || t.zone} · ${t.capacity} نفره`;
    btn.onclick = () => {
      const i = state.manualSelected.indexOf(t.id);
      if (i === -1) state.manualSelected.push(t.id); else state.manualSelected.splice(i, 1);
      renderTablePicker();
    };
    wrap.appendChild(btn);
  });
}

async function createManual() {
  const notice = el('manualNotice');
  try {
    if (!state.manualSelected.length) throw new Error('حداقل یک میز رو انتخاب کن.');
    const { reservation } = await api('/api/admin/reservations/manual', {
      method: 'POST',
      body: {
        tableIds: state.manualSelected, date: el('mDate').value, startTime: el('mTime').value,
        durationMinutes: state.manualDuration, guestCount: Number(el('mGuests').value),
        customerName: el('mName').value, customerPhone: el('mPhone').value
      }
    });
    notice.className = 'notice ok';
    notice.textContent = `رزرو دستی ثبت شد: ${reservation.trackingCode}`;
    state.manualSelected = [];
    renderTablePicker();
    await Promise.all([loadReservations(), loadDashboard()]);
  } catch (error) { notice.className = 'notice danger'; notice.textContent = error.message; }
}
el('createManual').onclick = createManual;

/* ---------- tables management ---------- */
async function loadTables() {
  const { tables } = await api('/api/admin/tables');
  state.tables = tables;
  renderTablePicker();
  el('tableBox').innerHTML = `<table class="table-list"><thead><tr><th>کد</th><th>شماره</th><th>زون</th><th>شکل</th><th>ظرفیت</th><th>min/max</th><th>فعال</th><th></th></tr></thead><tbody>${tables.map((t) => `
    <tr>
      <td>${t.code}</td><td>${t.displayNumber}</td><td>${ZONE_FA[t.zone] || t.zone}</td><td>${SHAPE_FA[t.shape] || t.shape}</td>
      <td>${t.capacity}</td><td>${t.minGuests}/${t.maxGuests}</td>
      <td><span class="status ${t.isActive ? 'CONFIRMED' : 'CANCELLED'}">${t.isActive ? 'فعال' : 'غیرفعال'}</span></td>
      <td><button class="secondary-btn" data-toggle-table="${t.id}">${t.isActive ? 'غیرفعال کن' : 'فعال کن'}</button></td>
    </tr>`).join('')}</tbody></table>`;
  document.querySelectorAll('[data-toggle-table]').forEach((btn) => btn.onclick = async () => {
    const t = state.tables.find((x) => x.id === btn.dataset.toggleTable);
    await api(`/api/admin/tables/${t.id}`, { method: 'PATCH', body: { isActive: !t.isActive } });
    await loadTables();
  });
}

/* ---------- working hours ---------- */
async function loadHours() {
  const { workingHours } = await api('/api/admin/working-hours');
  el('hoursBox').innerHTML = `<table class="table-list"><thead><tr><th>روز</th><th>از ساعت</th><th>تا ساعت</th><th>تعطیل</th><th></th></tr></thead><tbody>${workingHours.map((h) => `
    <tr>
      <td>${DAY_FA[h.dayOfWeek]}</td>
      <td><input value="${h.opensAt}" data-open="${h.dayOfWeek}" style="max-width:100px"></td>
      <td><input value="${h.closesAt}" data-close="${h.dayOfWeek}" style="max-width:100px"></td>
      <td><input type="checkbox" ${h.isClosed ? 'checked' : ''} data-closed="${h.dayOfWeek}" style="width:18px;height:18px;box-shadow:none"></td>
      <td><button class="secondary-btn" data-save-hour="${h.dayOfWeek}">ذخیره</button></td>
    </tr>`).join('')}</tbody></table>`;
  document.querySelectorAll('[data-save-hour]').forEach((btn) => btn.onclick = async () => {
    const day = btn.dataset.saveHour;
    await api(`/api/admin/working-hours/${day}`, { method: 'PATCH', body: { opensAt: q(`[data-open="${day}"]`).value, closesAt: q(`[data-close="${day}"]`).value, isClosed: q(`[data-closed="${day}"]`).checked } });
    await loadHours();
  });
}

/* ---------- closures ---------- */
async function loadClosures() {
  const { closures } = await api('/api/admin/closures');
  el('closuresBox').innerHTML = `
    <div class="form-grid" style="margin-bottom:20px">
      <div class="row"><div class="field"><label>عنوان تعطیلی</label><input id="cTitle" placeholder="مثلاً تعطیلی رسمی"></div><div class="field"><label>تاریخ</label><input id="cDate" type="date"></div></div>
      <div class="row"><div class="field"><label>از ساعت (اختیاری)</label><input id="cStart" type="time" step="900"></div><div class="field"><label>تا ساعت (اختیاری)</label><input id="cEnd" type="time" step="900"></div></div>
      <div class="row">
        <div class="field"><label>زون</label><select id="cZone"><option value="">کل کافه</option><option value="WINDOW">کنار پنجره</option><option value="CENTER">وسط</option><option value="ROOF">روف</option></select></div>
        <div class="field"><label>میز خاص</label><select id="cTable"><option value="">بدون میز خاص</option>${state.tables.map((t) => `<option value="${t.id}">میز ${t.displayNumber}</option>`).join('')}</select></div>
      </div>
      <button id="addClosure" class="primary-btn">${ICONS.plus}<span>افزودن تعطیلی / بلاک</span></button>
    </div>
    <table class="table-list"><thead><tr><th>عنوان</th><th>تاریخ</th><th>بازه</th><th>زون/میز</th><th></th></tr></thead><tbody>${closures.map((c) => `
      <tr>
        <td>${c.title}</td><td>${new Date(c.date).toLocaleDateString('fa-IR')}</td>
        <td>${c.startTime ? `${c.startTime} تا ${c.endTime || '?'}` : 'کل روز'}</td>
        <td>${ZONE_FA[c.zone] || ''} ${c.table ? `میز ${c.table.displayNumber}` : ''}</td>
        <td><button class="danger-btn" data-del-closure="${c.id}">${ICONS.trash}</button></td>
      </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--deep-taupe)">تعطیلی ثبت نشده</td></tr>`}</tbody></table>`;
  el('addClosure').onclick = async () => {
    await api('/api/admin/closures', { method: 'POST', body: { title: el('cTitle').value, date: el('cDate').value, startTime: el('cStart').value || null, endTime: el('cEnd').value || null, zone: el('cZone').value || null, tableId: el('cTable').value || null } });
    await loadClosures();
  };
  document.querySelectorAll('[data-del-closure]').forEach((btn) => btn.onclick = async () => { await api(`/api/admin/closures/${btn.dataset.delClosure}`, { method: 'DELETE' }); await loadClosures(); });
}

/* ---------- settings ---------- */
async function loadSettings() {
  const { settings } = await api('/api/admin/settings');
  el('settingsBox').innerHTML = `<div class="form-grid">
    <div class="row">${SETTINGS_FIELDS.map(([k, label]) => `<div class="field"><label>${label}</label><input id="set-${k}" value="${settings[k] ?? ''}"></div>`).join('')}</div>
    <button id="saveSettings" class="primary-btn">ذخیره تنظیمات</button>
    <div id="settingsNotice" class="notice">قیمت پیش‌فرض: ۱۰۰٬۰۰۰ تومان به ازای هر نفر.</div>
  </div>`;
  el('saveSettings').onclick = async () => {
    const body = {};
    SETTINGS_FIELDS.forEach(([k]) => body[k] = el(`set-${k}`).value);
    await api('/api/admin/settings', { method: 'PATCH', body });
    el('settingsNotice').className = 'notice ok';
    el('settingsNotice').textContent = 'تنظیمات ذخیره شد.';
  };
}

/* ---------- reports ---------- */
async function loadReports() {
  el('reportsBox').innerHTML = skeletonKpis(4);
  const r = await api('/api/admin/reports/revenue');
  el('reportsBox').innerHTML =
    kpi('check', 'پرداخت موفق', r.paidCount.toLocaleString('fa-IR')) +
    kpi('receipt', 'درآمد', toman(r.totalPaid)) +
    kpi('x', 'لغوشده', r.cancelled.toLocaleString('fa-IR')) +
    kpi('ban', 'عدم حضور', r.noShow.toLocaleString('fa-IR'));
}

/* ---------- init ---------- */
async function init() {
  renderMenu();
  try {
    const { admin } = await api('/api/admin/me');
    state.admin = admin;
    el('adminInfo').textContent = `${admin.name} · ${ROLE_FA[admin.role] || admin.role}`;
  } catch {
    location.href = '/admin-login.html';
    return;
  }
  el('mDate').value = new Date().toISOString().slice(0, 10);
  renderDurationChips();
  await loadTables();
  await Promise.all([loadDashboard(), loadReservations(), loadHours(), loadClosures(), loadSettings(), loadReports()]);
}

init();
