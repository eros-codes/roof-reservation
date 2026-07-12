import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll } from './ui.js';
import { mountAdminMapEditor } from './admin-map-editor.js';

initHeaderScroll();

const state = {
  admin: null,
  tables: [],
  connections: [],
  manualSelected: [],
  manualDuration: 60,
  mapEditor: null
};

const el = (id) => document.getElementById(id);
const q = (selector) => document.querySelector(selector);

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
const ZONE_FA = { WINDOW: 'سالن پنجره', CENTER: 'سالن وسط', ROOF: 'روف گاردن' };
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

function canManageTables() {
  return ['OWNER', 'MANAGER'].includes(state.admin?.role);
}

/* ---------- menu / sections ---------- */
function renderMenu() {
  const nav = el('adminMenu');
  nav.innerHTML = SECTIONS.map((section, index) => (
    `<button data-section="${section.key}" class="${index === 0 ? 'active' : ''}">${ICONS[section.icon]}<span>${section.label}</span></button>`
  )).join('');
  nav.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => switchSection(button.dataset.section));
  });
}

function switchSection(name) {
  document.querySelectorAll('.admin-menu button').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === name);
  });
  document.querySelectorAll('.admin-section').forEach((section) => {
    section.classList.toggle('active', section.id === name);
  });
}

el('adminLogout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  location.href = '/admin-login.html';
});

function kpi(icon, label, value) {
  return `<div class="kpi"><div class="kpi-icon">${ICONS[icon]}</div><span>${label}</span><strong>${value}</strong></div>`;
}

function skeletonKpis(count) {
  return Array.from({ length: count }).map(() => (
    '<div class="kpi"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px"></div><div class="skeleton" style="height:22px;width:40%"></div></div>'
  )).join('');
}

/* ---------- dashboard ---------- */
async function loadDashboard() {
  el('dashboardBox').innerHTML = skeletonKpis(4);
  const dashboard = await api('/api/admin/dashboard');
  el('dashboardBox').innerHTML =
    kpi('calendar', 'رزرو امروز', dashboard.todayReservations.toLocaleString('fa-IR'))
    + kpi('clock', 'پرداخت‌های معلق', dashboard.pendingPayments.toLocaleString('fa-IR'))
    + kpi('ban', 'عدم حضور (No-show)', dashboard.noShows.toLocaleString('fa-IR'))
    + kpi('receipt', 'درآمد کل', toman(dashboard.totalRevenue));
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
  el('reservationBox').innerHTML = '<div class="skeleton" style="height:180px"></div>';
  const { reservations } = await api('/api/admin/reservations');
  if (!reservations.length) {
    el('reservationBox').innerHTML = `<div class="empty-state">${ICONS.empty}<strong>هنوز رزروی ثبت نشده</strong><p>رزروهای جدید همین‌جا ظاهر می‌شن.</p></div>`;
    return;
  }

  el('reservationBox').innerHTML = `<div class="table-scroll"><table class="table-list"><thead><tr><th>کد</th><th>مشتری</th><th>زمان</th><th>میز</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${reservations.map((reservation) => `
    <tr>
      <td>${reservation.trackingCode}</td>
      <td>${reservation.customerName}<br><small style="color:var(--deep-taupe)">${reservation.customerPhone}</small></td>
      <td>${faDateTime(reservation.startAt)}</td>
      <td>${reservation.tables.map((item) => item.table.displayNumber).join(' و ')}</td>
      <td>${toman(reservation.totalAmount)}</td>
      <td><span class="status ${reservation.status}">${statusFa(reservation.status)}</span></td>
      <td><select data-status="${reservation.id}">${statusOptions()}</select></td>
    </tr>`).join('')}</tbody></table></div>`;

  document.querySelectorAll('[data-status]').forEach((select) => {
    select.addEventListener('change', async () => {
      if (!select.value) return;
      await api(`/api/admin/reservations/${select.dataset.status}/status`, { method: 'PATCH', body: { status: select.value } });
      await Promise.all([loadReservations(), loadDashboard()]);
    });
  });
}

/* ---------- manual booking ---------- */
function renderDurationChips() {
  const row = el('mDurationRow');
  row.innerHTML = '';
  for (let minutes = 60; minutes <= 240; minutes += 30) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chip${minutes === state.manualDuration ? ' active' : ''}`;
    button.textContent = `${(minutes / 60).toLocaleString('fa-IR')} ساعت`;
    button.addEventListener('click', () => {
      state.manualDuration = minutes;
      renderDurationChips();
    });
    row.appendChild(button);
  }
}

document.querySelectorAll('[data-mstep]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = el('mGuests');
    input.value = Math.max(1, Number(input.value || 1) + Number(button.dataset.mstep));
  });
});

function renderTablePicker() {
  const wrap = el('mTables');
  wrap.innerHTML = '';
  state.tables.filter((table) => table.isActive).forEach((table) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chip${state.manualSelected.includes(table.id) ? ' active' : ''}`;
    button.textContent = `میز ${table.displayNumber} · ${ZONE_FA[table.zone] || table.zone} · ${table.capacity} نفره`;
    button.addEventListener('click', () => {
      const index = state.manualSelected.indexOf(table.id);
      if (index === -1) state.manualSelected.push(table.id);
      else state.manualSelected.splice(index, 1);
      renderTablePicker();
    });
    wrap.appendChild(button);
  });
}

async function createManual() {
  const notice = el('manualNotice');
  try {
    if (!state.manualSelected.length) throw new Error('حداقل یک میز رو انتخاب کن.');
    const { reservation } = await api('/api/admin/reservations/manual', {
      method: 'POST',
      body: {
        tableIds: state.manualSelected,
        date: el('mDate').value,
        startTime: el('mTime').value,
        durationMinutes: state.manualDuration,
        guestCount: Number(el('mGuests').value),
        customerName: el('mName').value,
        customerPhone: el('mPhone').value
      }
    });
    notice.className = 'notice ok';
    notice.textContent = `رزرو دستی ثبت شد: ${reservation.trackingCode}`;
    state.manualSelected = [];
    renderTablePicker();
    await Promise.all([loadReservations(), loadDashboard()]);
  } catch (error) {
    notice.className = 'notice danger';
    notice.textContent = error.message;
  }
}

el('createManual').addEventListener('click', createManual);

/* ---------- tables + map management ---------- */
function renderTableList() {
  el('tableCount').textContent = `${state.tables.length.toLocaleString('fa-IR')} میز`;
  el('tableBox').innerHTML = `<div class="table-scroll"><table class="table-list"><thead><tr><th>کد</th><th>شماره</th><th>سالن</th><th>شکل</th><th>ظرفیت</th><th>حداقل/حداکثر</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${state.tables.map((table) => `
    <tr>
      <td>${table.code}</td>
      <td>${table.displayNumber}</td>
      <td>${ZONE_FA[table.zone] || table.zone}</td>
      <td>${SHAPE_FA[table.shape] || table.shape}</td>
      <td>${Number(table.capacity).toLocaleString('fa-IR')}</td>
      <td>${Number(table.minGuests).toLocaleString('fa-IR')} / ${Number(table.maxGuests).toLocaleString('fa-IR')}</td>
      <td><span class="status ${table.isActive ? 'CONFIRMED' : 'CANCELLED'}">${table.isActive ? 'فعال' : 'غیرفعال'}</span></td>
      <td class="table-actions-cell">
        <button type="button" class="secondary-btn" data-edit-table="${table.id}">ویرایش</button>
        ${canManageTables() ? `<button type="button" class="secondary-btn" data-toggle-table="${table.id}">${table.isActive ? 'غیرفعال' : 'فعال'}</button>` : ''}
      </td>
    </tr>`).join('')}</tbody></table></div>`;

  document.querySelectorAll('[data-edit-table]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mapEditor?.selectTable(button.dataset.editTable);
      el('adminMapEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('[data-toggle-table]').forEach((button) => {
    button.addEventListener('click', async () => {
      const table = state.tables.find((item) => item.id === button.dataset.toggleTable);
      await api(`/api/admin/tables/${table.id}`, { method: 'PATCH', body: { isActive: !table.isActive } });
      await loadTables({ keepSelectedId: table.id });
    });
  });
}

async function loadTables(options = {}) {
  const { tables, connections } = await api('/api/admin/tables');
  state.tables = tables;
  state.connections = connections;
  state.manualSelected = state.manualSelected.filter((id) => tables.some((table) => table.id === id && table.isActive));
  renderTablePicker();
  renderTableList();

  if (!state.mapEditor) {
    state.mapEditor = await mountAdminMapEditor({
      container: el('adminMapEditor'),
      tables: state.tables,
      connections: state.connections,
      canEdit: canManageTables(),
      onReload: (reloadOptions) => loadTables(reloadOptions)
    });
  } else {
    state.mapEditor.update(state.tables, state.connections, options);
  }
}

/* ---------- working hours ---------- */
async function loadHours() {
  const { workingHours } = await api('/api/admin/working-hours');
  el('hoursBox').innerHTML = `<div class="table-scroll"><table class="table-list"><thead><tr><th>روز</th><th>از ساعت</th><th>تا ساعت</th><th>تعطیل</th><th></th></tr></thead><tbody>${workingHours.map((hour) => `
    <tr>
      <td>${DAY_FA[hour.dayOfWeek]}</td>
      <td><input value="${hour.opensAt}" data-open="${hour.dayOfWeek}" style="max-width:100px"></td>
      <td><input value="${hour.closesAt}" data-close="${hour.dayOfWeek}" style="max-width:100px"></td>
      <td><input type="checkbox" ${hour.isClosed ? 'checked' : ''} data-closed="${hour.dayOfWeek}" style="width:18px;height:18px;box-shadow:none"></td>
      <td><button class="secondary-btn" data-save-hour="${hour.dayOfWeek}">ذخیره</button></td>
    </tr>`).join('')}</tbody></table></div>`;

  document.querySelectorAll('[data-save-hour]').forEach((button) => {
    button.addEventListener('click', async () => {
      const day = button.dataset.saveHour;
      await api(`/api/admin/working-hours/${day}`, {
        method: 'PATCH',
        body: {
          opensAt: q(`[data-open="${day}"]`).value,
          closesAt: q(`[data-close="${day}"]`).value,
          isClosed: q(`[data-closed="${day}"]`).checked
        }
      });
      await loadHours();
    });
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
        <div class="field"><label>سالن</label><select id="cZone"><option value="">کل کافه</option><option value="WINDOW">سالن پنجره</option><option value="CENTER">سالن وسط</option><option value="ROOF">روف گاردن</option></select></div>
        <div class="field"><label>میز خاص</label><select id="cTable"><option value="">بدون میز خاص</option>${state.tables.map((table) => `<option value="${table.id}">میز ${table.displayNumber}</option>`).join('')}</select></div>
      </div>
      <button id="addClosure" class="primary-btn">${ICONS.plus}<span>افزودن تعطیلی / بلاک</span></button>
    </div>
    <div class="table-scroll"><table class="table-list"><thead><tr><th>عنوان</th><th>تاریخ</th><th>بازه</th><th>سالن/میز</th><th></th></tr></thead><tbody>${closures.map((closure) => `
      <tr>
        <td>${closure.title}</td><td>${new Date(closure.date).toLocaleDateString('fa-IR')}</td>
        <td>${closure.startTime ? `${closure.startTime} تا ${closure.endTime || '?'}` : 'کل روز'}</td>
        <td>${ZONE_FA[closure.zone] || ''} ${closure.table ? `میز ${closure.table.displayNumber}` : ''}</td>
        <td><button class="danger-btn" data-del-closure="${closure.id}">${ICONS.trash}</button></td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--deep-taupe)">تعطیلی ثبت نشده</td></tr>'}</tbody></table></div>`;

  el('addClosure').addEventListener('click', async () => {
    await api('/api/admin/closures', {
      method: 'POST',
      body: {
        title: el('cTitle').value,
        date: el('cDate').value,
        startTime: el('cStart').value || null,
        endTime: el('cEnd').value || null,
        zone: el('cZone').value || null,
        tableId: el('cTable').value || null
      }
    });
    await loadClosures();
  });

  document.querySelectorAll('[data-del-closure]').forEach((button) => {
    button.addEventListener('click', async () => {
      await api(`/api/admin/closures/${button.dataset.delClosure}`, { method: 'DELETE' });
      await loadClosures();
    });
  });
}

/* ---------- settings ---------- */
async function loadSettings() {
  const { settings } = await api('/api/admin/settings');
  el('settingsBox').innerHTML = `<div class="form-grid">
    <div class="row">${SETTINGS_FIELDS.map(([key, label]) => `<div class="field"><label>${label}</label><input id="set-${key}" value="${settings[key] ?? ''}"></div>`).join('')}</div>
    <button id="saveSettings" class="primary-btn">ذخیره تنظیمات</button>
    <div id="settingsNotice" class="notice">قیمت پیش‌فرض: ۱۰۰٬۰۰۰ تومان به ازای هر نفر.</div>
  </div>`;

  el('saveSettings').addEventListener('click', async () => {
    const body = {};
    SETTINGS_FIELDS.forEach(([key]) => { body[key] = el(`set-${key}`).value; });
    await api('/api/admin/settings', { method: 'PATCH', body });
    el('settingsNotice').className = 'notice ok';
    el('settingsNotice').textContent = 'تنظیمات ذخیره شد.';
  });
}

/* ---------- reports ---------- */
async function loadReports() {
  el('reportsBox').innerHTML = skeletonKpis(4);
  const report = await api('/api/admin/reports/revenue');
  el('reportsBox').innerHTML =
    kpi('check', 'پرداخت موفق', report.paidCount.toLocaleString('fa-IR'))
    + kpi('receipt', 'درآمد', toman(report.totalPaid))
    + kpi('x', 'لغوشده', report.cancelled.toLocaleString('fa-IR'))
    + kpi('ban', 'عدم حضور', report.noShow.toLocaleString('fa-IR'));
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

init().catch((error) => {
  console.error(error);
  document.querySelector('.admin-content').insertAdjacentHTML('afterbegin', `<div class="notice danger">${error.message}</div>`);
});
