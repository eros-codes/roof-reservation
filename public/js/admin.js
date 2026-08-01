import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll, escapeHtml, renderDurationChips } from './ui.js';
import { mountAdminMapEditor } from './admin-map-editor.js';

initHeaderScroll();

const state = {
	admin: null,
	tables: [],
	connections: [],
	manualSelected: [],
	manualDuration: 60,
	mapEditor: null,
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
	{ key: 'reports', label: 'گزارش‌ها', icon: 'chart' },
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
	['reminderBeforeMinutes', 'یادآوری پیامکی قبل از رزرو (دقیقه)'],
];

function canManageTables() {
	return ['OWNER', 'MANAGER'].includes(state.admin?.role);
}

/* ---------- menu / sections ---------- */
function renderMenu() {
	const nav = el('adminMenu');
	nav.innerHTML = SECTIONS.map(
		(section, index) =>
			`<button data-section="${section.key}" class="${index === 0 ? 'active' : ''}">${ICONS[section.icon]}<span>${section.label}</span></button>`,
	).join('');
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
	try {
		await api('/api/admin/logout', { method: 'POST' });
	} catch (error) {
		console.warn('خروج با خطا مواجه شد:', error);
	}
	location.href = '/admin-login.html';
});

function kpi(icon, label, value) {
	return `<div class="kpi"><div class="kpi-icon">${ICONS[icon]}</div><span>${label}</span><strong>${value}</strong></div>`;
}

function skeletonKpis(count) {
	return Array.from({ length: count })
		.map(
			() =>
				'<div class="kpi"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px"></div><div class="skeleton" style="height:22px;width:40%"></div></div>',
		)
		.join('');
}

/* ---------- dashboard ---------- */
function upcomingList(rows) {
	if (!rows.length) {
		return '<div class="report-card"><h4>رزروهای پیش‌روی امروز</h4><p class="hint">رزرو دیگری برای امروز باقی نمانده.</p></div>';
	}
	const items = rows
		.map((r) => {
			const time = new Date(r.startAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
			const tables = (r.tables || []).map((t) => t.table.displayNumber).join(' و ') || '—';
			return `<div class="detail-row">
					<span><b>${escapeHtml(time)}</b> · ${escapeHtml(r.customerName)}</span>
					<span>میز ${escapeHtml(tables)} · ${Number(r.guestCount || 0).toLocaleString('fa-IR')} نفر</span>
				</div>`;
		})
		.join('');
	return `<div class="report-card"><h4>رزروهای پیش‌روی امروز</h4>${items}</div>`;
}

async function loadDashboard() {
	el('dashboardBox').innerHTML = skeletonKpis(2);
	try {
		const dashboard = await api('/api/admin/dashboard');
		el('dashboardBox').innerHTML =
			kpi('stop', 'منتظر تایید شما', dashboard.actionNeeded.toLocaleString('fa-IR')) +
			kpi('receipt', 'درآمد کل', toman(dashboard.totalRevenue)) +
			upcomingList(dashboard.upcoming || []);
	} catch (error) {
		el('dashboardBox').innerHTML = '<div class="notice danger"></div>';
		el('dashboardBox').querySelector('.notice').textContent = error.message;
	}
}

/* ---------- reservations ---------- */
function statusOptions() {
	return `<option value="">انتخاب</option>
    <option value="COMPLETED">تکمیل‌شده</option>
    <option value="NO_SHOW">عدم حضور مشتری</option>
    <option value="CANCELLED">لغو رزرو</option>
    ${state.admin?.role !== 'RECEPTION' ? '<option value="CONFIRMED">تایید</option>' : ''}`;
}

let allReservations = [];
let reservationsTotal = 0;
let reservationFilter = 'action';

// ترتیب: کلید سرور، برچسب، آیکون (آیکون اول میاد تا در RTL سمت راست بشینه)
const RESERVATION_TABS = [
	['action', 'نیاز به بررسی', 'stop'],
	['all', 'همه', 'list'],
	['today', 'امروز', 'calendar'],
	['confirmed', 'تایید‌شده', 'clock'],
	['completed', 'تکمیل‌شده', 'check'],
	['noshow', 'عدم حضور', 'ban'],
	['cancelled', 'لغو‌شده', 'x'],
];

async function renderReservationTabs() {
	let counts = {};
	try {
		({ counts } = await api('/api/admin/reservations/counts'));
	} catch (_) {
		// اگه شمارنده‌ها نیومد، تب‌ها بدون عدد نشون داده می‌شن
	}
	el('reservationTabs').innerHTML = RESERVATION_TABS.map(
		([key, label, icon]) =>
			`<button type="button" class="filter-tab${key === reservationFilter ? ' active' : ''}" data-res-filter="${key}">${ICONS[icon]}<span>${label} (${(counts[key] ?? 0).toLocaleString('fa-IR')})</span></button>`,
	).join('');
	el('reservationTabs')
		.querySelectorAll('[data-res-filter]')
		.forEach((btn) => {
			btn.addEventListener('click', () => {
				if (reservationFilter === btn.dataset.resFilter) return;
				reservationFilter = btn.dataset.resFilter;
				loadReservations();
			});
		});
}

async function loadReservations({ append = false } = {}) {
	// تعداد رزروهایی که ادمین قبلاً باز کرده بود، تا بعد از تازه‌سازی به صفحه‌ی اول پرت نشه
	const previousCount = allReservations.length;
	if (!append) {
		el('reservationBox').innerHTML = '<div class="skeleton" style="height:180px"></div>';
		allReservations = [];
		renderReservationTabs();
	}
	let reservations;
	let total;
	try {
		// سقف سمت سرور ۲۰۰ است، پس بیشتر از آن قابل بازیابی نیست
		const limit = append ? 100 : Math.min(Math.max(previousCount, 100), 200);
		({ reservations, total } = await api(
			`/api/admin/reservations?filter=${reservationFilter}&limit=${limit}&offset=${allReservations.length}`,
		));
	} catch (error) {
		el('reservationBox').innerHTML = '<div class="notice danger"></div>';
		el('reservationBox').querySelector('.notice').textContent = error.message;
		return;
	}
	allReservations = allReservations.concat(reservations || []);
	reservationsTotal = total ?? allReservations.length;
	if (!allReservations.length) {
		el('reservationBox').innerHTML =
			`<div class="empty-state">${ICONS.empty}<strong>هنوز رزروی ثبت نشده</strong><p>رزروهای جدید همین‌جا ظاهر می‌شن.</p></div>`;
		return;
	}

	el('reservationBox').innerHTML =
		`<div id="reservationsNotice"></div><div class="table-scroll"><table class="table-list"><thead><tr><th>کد</th><th>مشتری</th><th>زمان</th><th>میز</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${allReservations
			.map(
				(reservation) => `
    <tr>
      <td>${escapeHtml(reservation.trackingCode)}</td>
      <td>${escapeHtml(reservation.customerName)}<br><small style="color:var(--deep-taupe)">${escapeHtml(reservation.customerPhone)}</small></td>
      <td>${faDateTime(reservation.startAt)}</td>
      <td>${escapeHtml((reservation.tables || []).map((item) => item.table.displayNumber).join(' و '))}</td>
      <td>${toman(reservation.totalAmount)}</td>
      <td><span class="status ${escapeHtml(reservation.status)}">${escapeHtml(statusFa(reservation.status))}</span></td>
      <td><select data-status="${escapeHtml(reservation.id)}">${statusOptions()}</select></td>
    </tr>`,
			)
			.join('')}</tbody></table></div>`;

	const listNotice = el('reservationsNotice');
	if (allReservations.length < reservationsTotal) {
		listNotice.className = 'notice';
		listNotice.innerHTML = '<span></span> <button type="button" class="secondary-btn" id="loadMoreReservations">نمایش بیشتر</button>';
		listNotice.querySelector('span').textContent =
			`${allReservations.length.toLocaleString('fa-IR')} رزرو از مجموع ${reservationsTotal.toLocaleString('fa-IR')} رزرو نمایش داده شده.`;
		el('loadMoreReservations').addEventListener('click', () => loadReservations({ append: true }));
	}

	el('reservationBox')
		.querySelectorAll('[data-status]')
		.forEach((select) => {
			select.addEventListener('change', async () => {
				if (!select.value) return;
				const notice = el('reservationsNotice');
				try {
					await api(`/api/admin/reservations/${select.dataset.status}/status`, { method: 'PATCH', body: { status: select.value } });
					await Promise.all([loadReservations(), loadDashboard()]);
				} catch (error) {
					notice.className = 'notice danger';
					notice.textContent = error.message;
				}
			});
		});
}

/* ---------- manual booking ---------- */
document.querySelectorAll('[data-mstep]').forEach((button) => {
	button.addEventListener('click', () => {
		const input = el('mGuests');
		const max = Number(input.max) || 20;
		const min = Number(input.min) || 1;
		input.value = Math.min(max, Math.max(min, Number(input.value || min) + Number(button.dataset.mstep)));
	});
});

function renderTablePicker() {
	const wrap = el('mTables');
	wrap.innerHTML = '';
	state.tables
		.filter((table) => table.isActive)
		.forEach((table) => {
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
				customerName: el('mName').value.trim(),
				customerPhone: el('mPhone').value.trim(),
			},
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
el('addTableBtn').addEventListener('click', () => state.mapEditor?.openCreateDialog?.());

/* ---------- tables + map management ---------- */
function renderTableList() {
	el('tableCount').textContent = `${state.tables.length.toLocaleString('fa-IR')} میز`;
	el('tableBox').innerHTML =
		`<div id="tableListNotice"></div><div class="table-scroll"><table class="table-list"><thead><tr><th>کد</th><th>شماره</th><th>سالن</th><th>شکل</th><th>ظرفیت</th><th>حداقل/حداکثر</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${state.tables
			.map(
				(table) => `
    <tr>
      <td>${escapeHtml(table.code)}</td>
      <td>${escapeHtml(table.displayNumber)}</td>
      <td>${ZONE_FA[table.zone] || table.zone}</td>
      <td>${SHAPE_FA[table.shape] || table.shape}</td>
      <td>${Number(table.capacity).toLocaleString('fa-IR')}</td>
      <td>${Number(table.minGuests).toLocaleString('fa-IR')} / ${Number(table.maxGuests).toLocaleString('fa-IR')}</td>
      <td><span class="status ${table.isActive ? 'CONFIRMED' : 'CANCELLED'}">${table.isActive ? 'فعال' : 'غیرفعال'}</span></td>
      <td class="table-actions-cell">
        ${canManageTables() ? `<button type="button" class="secondary-btn" data-edit-table="${escapeHtml(table.id)}">ویرایش</button>` : ''}
        ${canManageTables() ? `<button type="button" class="secondary-btn" data-toggle-table="${escapeHtml(table.id)}">${table.isActive ? 'غیرفعال' : 'فعال'}</button>` : ''}
      </td>
    </tr>`,
			)
			.join('')}</tbody></table></div>`;

	el('tableBox')
		.querySelectorAll('[data-edit-table]')
		.forEach((button) => {
			button.addEventListener('click', () => {
				state.mapEditor?.selectTable(button.dataset.editTable);
				el('adminMapEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		});

	el('tableBox')
		.querySelectorAll('[data-toggle-table]')
		.forEach((button) => {
			button.addEventListener('click', async () => {
				const table = state.tables.find((item) => item.id === button.dataset.toggleTable);
				const notice = el('tableListNotice');
				if (!table) {
					notice.className = 'notice danger';
					notice.textContent = 'این میز دیگه در لیست نیست؛ صفحه رو تازه کن.';
					return;
				}
				try {
					await api(`/api/admin/tables/${table.id}`, { method: 'PATCH', body: { isActive: !table.isActive } });
					await loadTables({ keepSelectedId: table.id });
				} catch (error) {
					notice.className = 'notice danger';
					notice.textContent = error.message;
				}
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
			onReload: (reloadOptions) => loadTables(reloadOptions),
		});
	} else {
		state.mapEditor.update(state.tables, state.connections, options);
	}
}

/* ---------- working hours ---------- */
async function loadHours() {
	el('hoursBox').innerHTML = '<div class="skeleton" style="height:180px"></div>';
	let workingHours;
	try {
		({ workingHours } = await api('/api/admin/working-hours'));
	} catch (error) {
		el('hoursBox').innerHTML = '<div class="notice danger"></div>';
		el('hoursBox').querySelector('.notice').textContent = error.message;
		return;
	}
	el('hoursBox').innerHTML =
		`<div id="hoursNotice"></div><div class="table-scroll"><table class="table-list"><thead><tr><th>روز</th><th>از ساعت</th><th>تا ساعت</th><th>تعطیل</th><th></th></tr></thead><tbody>${workingHours
			.map(
				(hour) => `
    <tr>
      <td>${DAY_FA[hour.dayOfWeek]}</td>
      <td><input value="${escapeHtml(hour.opensAt)}" data-open="${hour.dayOfWeek}" style="max-width:100px"></td>
      <td><input value="${escapeHtml(hour.closesAt)}" data-close="${hour.dayOfWeek}" style="max-width:100px"></td>
      <td><input type="checkbox" ${hour.isClosed ? 'checked' : ''} data-closed="${hour.dayOfWeek}" style="width:18px;height:18px;box-shadow:none"></td>
      <td><button class="secondary-btn" data-save-hour="${hour.dayOfWeek}">ذخیره</button></td>
    </tr>`,
			)
			.join('')}</tbody></table></div>`;

	el('hoursBox')
		.querySelectorAll('[data-save-hour]')
		.forEach((button) => {
			button.addEventListener('click', async () => {
				const day = button.dataset.saveHour;
				const notice = el('hoursNotice');
				try {
					await api(`/api/admin/working-hours/${day}`, {
						method: 'PATCH',
						body: {
							opensAt: q(`[data-open="${day}"]`).value,
							closesAt: q(`[data-close="${day}"]`).value,
							isClosed: q(`[data-closed="${day}"]`).checked,
						},
					});
					await loadHours();
				} catch (error) {
					notice.className = 'notice danger';
					notice.textContent = error.message;
				}
			});
		});
}

/* ---------- closures ---------- */
async function loadClosures() {
	el('closuresBox').innerHTML = '<div class="skeleton" style="height:180px"></div>';
	let closures;
	try {
		({ closures } = await api('/api/admin/closures'));
	} catch (error) {
		el('closuresBox').innerHTML = '<div class="notice danger"></div>';
		el('closuresBox').querySelector('.notice').textContent = error.message;
		return;
	}
	el('closuresBox').innerHTML = `
    <div id="closuresNotice"></div>
    <div class="form-grid" style="margin-bottom:20px">
      <div class="row"><div class="field"><label>عنوان تعطیلی</label><input id="cTitle" placeholder="مثلاً تعطیلی رسمی"></div><div class="field"><label>تاریخ</label><input id="cDate" type="date"></div></div>
      <div class="row"><div class="field"><label>از ساعت (اختیاری)</label><input id="cStart" type="time" step="900"></div><div class="field"><label>تا ساعت (اختیاری)</label><input id="cEnd" type="time" step="900"></div></div>
      <div class="row">
        <div class="field"><label>سالن</label><select id="cZone"><option value="">کل کافه</option><option value="WINDOW">سالن پنجره</option><option value="CENTER">سالن وسط</option><option value="ROOF">روف گاردن</option></select></div>
        <div class="field"><label>میز خاص</label><select id="cTable"><option value="">بدون میز خاص</option>${state.tables.map((table) => `<option value="${escapeHtml(table.id)}">میز ${escapeHtml(table.displayNumber)}</option>`).join('')}</select></div>
      </div>
      <button id="addClosure" class="primary-btn">${ICONS.plus}<span>افزودن تعطیلی / بلاک</span></button>
    </div>
    <div class="table-scroll"><table class="table-list"><thead><tr><th>عنوان</th><th>تاریخ</th><th>بازه</th><th>سالن/میز</th><th></th></tr></thead><tbody>${
			closures
				.map(
					(closure) => `
      <tr>
        <td>${escapeHtml(closure.title)}</td><td>${new Date(closure.date).toLocaleDateString('fa-IR')}</td>
        <td>${closure.startTime ? `${escapeHtml(closure.startTime)} تا ${escapeHtml(closure.endTime || '?')}` : 'کل روز'}</td>
        <td>${ZONE_FA[closure.zone] || ''} ${closure.table ? `میز ${escapeHtml(closure.table.displayNumber)}` : ''}</td>
        <td><button class="danger-btn" data-del-closure="${closure.id}">${ICONS.trash}</button></td>
      </tr>`,
				)
				.join('') || '<tr><td colspan="5" style="text-align:center;color:var(--deep-taupe)">تعطیلی ثبت نشده</td></tr>'
		}</tbody></table></div>`;

	el('addClosure').addEventListener('click', async () => {
		try {
			await api('/api/admin/closures', {
				method: 'POST',
				body: {
					title: el('cTitle').value,
					date: el('cDate').value,
					startTime: el('cStart').value || null,
					endTime: el('cEnd').value || null,
					zone: el('cZone').value || null,
					tableId: el('cTable').value || null,
				},
			});
			await loadClosures();
		} catch (error) {
			el('closuresNotice').className = 'notice danger';
			el('closuresNotice').textContent = error.message;
		}
	});

	el('closuresBox')
		.querySelectorAll('[data-del-closure]')
		.forEach((button) => {
			button.addEventListener('click', async () => {
				try {
					await api(`/api/admin/closures/${button.dataset.delClosure}`, { method: 'DELETE' });
					await loadClosures();
				} catch (error) {
					el('closuresNotice').className = 'notice danger';
					el('closuresNotice').textContent = error.message;
				}
			});
		});
}

/* ---------- settings ---------- */
async function loadSettings() {
	el('settingsBox').innerHTML = '<div class="skeleton" style="height:140px"></div>';
	let settings;
	try {
		({ settings } = await api('/api/admin/settings'));
	} catch (error) {
		el('settingsBox').innerHTML = '<div class="notice danger"></div>';
		el('settingsBox').querySelector('.notice').textContent = error.message;
		return;
	}
	el('settingsBox').innerHTML = `<div class="form-grid">
    <div class="row">${SETTINGS_FIELDS.map(([key, label]) => `<div class="field"><label>${label}</label><input id="set-${key}" value="${escapeHtml(settings[key] ?? '')}"></div>`).join('')}</div>
    <button id="saveSettings" class="primary-btn">ذخیره تنظیمات</button>
    <div id="settingsNotice" class="notice">قیمت پیش‌فرض: ۱۰۰٬۰۰۰ تومان به ازای هر نفر.</div>
  </div>`;

	el('saveSettings').addEventListener('click', async () => {
		const body = {};
		SETTINGS_FIELDS.forEach(([key]) => {
			body[key] = el(`set-${key}`).value;
		});
		try {
			await api('/api/admin/settings', { method: 'PATCH', body });
			el('settingsNotice').className = 'notice ok';
			el('settingsNotice').textContent = 'تنظیمات ذخیره شد.';
		} catch (error) {
			el('settingsNotice').className = 'notice danger';
			el('settingsNotice').textContent = error.message;
		}
	});
}

/* ---------- reports ---------- */
function revenueChart(daily) {
	const max = Math.max(...daily.map((d) => d.amount), 1);
	const bars = daily
		.map((d) => {
			const height = Math.round((d.amount / max) * 100);
			const label = new Date(d.date).toLocaleDateString('fa-IR', { weekday: 'short' });
			return `
        <div class="chart-col">
          <div class="chart-bar" style="height:${height || 2}%" title="${escapeHtml(toman(d.amount))}"></div>
          <span class="chart-label">${escapeHtml(label)}</span>
        </div>`;
		})
		.join('');
	return `
    <div class="report-card">
      <h4>درآمد هفت روز اخیر</h4>
      <div class="chart-wrap">${bars}</div>
    </div>`;
}

function topTablesCard(rows) {
	if (!rows.length) return '';
	const items = rows
		.map(
			(t) =>
				`<div class="detail-row"><span>میز ${escapeHtml(t.displayNumber)}</span><span>${t.count.toLocaleString('fa-IR')} رزرو</span></div>`,
		)
		.join('');
	return `<div class="report-card"><h4>پرتقاضاترین میزها</h4>${items}</div>`;
}

async function loadReports() {
	el('reportsBox').innerHTML = skeletonKpis(4);
	try {
		const report = await api('/api/admin/reports/revenue');
		el('reportsBox').innerHTML =
			kpi('receipt', 'درآمد کل', toman(report.totalPaid)) +
			kpi('check', 'پرداخت موفق', report.paidCount.toLocaleString('fa-IR')) +
			kpi('chart', 'میانگین هر رزرو', toman(report.avgPerReservation)) +
			kpi('users', 'میانگین نفرات', report.avgGuests.toLocaleString('fa-IR')) +
			kpi('calendar', 'رزروهای پیش‌رو', report.upcoming.toLocaleString('fa-IR')) +
			kpi('check', 'تکمیل‌شده', report.completed.toLocaleString('fa-IR')) +
			kpi('x', 'لغوشده', report.cancelled.toLocaleString('fa-IR')) +
			kpi('ban', 'عدم حضور', report.noShow.toLocaleString('fa-IR')) +
			revenueChart(report.daily) +
			topTablesCard(report.topTables);
	} catch (error) {
		el('reportsBox').innerHTML = '<div class="notice danger"></div>';
		el('reportsBox').querySelector('.notice').textContent = error.message;
	}
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

	const now = new Date();
	const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
	el('mDate').value = localDate.toISOString().slice(0, 10);
	renderDurationChips(
		'mDurationRow',
		() => state.manualDuration,
		(value) => {
			state.manualDuration = value;
		},
	);
	await loadTables();
	await Promise.all([loadDashboard(), loadReservations()]);
	// بقیه‌ی بخش‌ها فقط وقتی واقعاً باز می‌شن بارگذاری بشن
	const lazyLoaders = { hours: loadHours, closures: loadClosures, settings: loadSettings, reports: loadReports };
	const loaded = new Set();
	el('adminMenu').addEventListener('click', (event) => {
		const key = event.target.closest('button')?.dataset.section;
		if (key && lazyLoaders[key] && !loaded.has(key)) {
			loaded.add(key);
			lazyLoaders[key]();
		}
	});
}

// هر خطای ۴۰۱ در هر زمانی یعنی نشست منقضی شده؛ کاربر باید به صفحه‌ی ورود برگردد
window.addEventListener('unhandledrejection', (event) => {
	if (event.reason?.status === 401) {
		location.href = '/admin-login.html';
	}
});

init().catch((error) => {
	console.error(error);
	if (error.status === 401) {
		location.href = '/admin-login.html';
		return;
	}
	const banner = document.createElement('div');
	banner.className = 'notice danger';
	banner.textContent = error.message;
	document.querySelector('.admin-content').prepend(banner);
});
