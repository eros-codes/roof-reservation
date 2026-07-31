import { api, toman } from './api.js';
import { ICONS, createSheetController, initHeaderScroll, escapeHtml, renderDurationChips } from './ui.js';
import { RoofMap } from './map-renderer.js';

const ZONE_FA = { WINDOW: 'سالن پنجره', CENTER: 'سالن وسط', ROOF: 'روف گاردن' };

const state = {
	config: null,
	selectedDate: null,
	mode: 'exact',
	duration: 60,
	availability: null,
	// لیست میزها جدا نگه داشته می‌شه تا با باطل‌شدن نتایج، خود میزها از نقشه محو نشن
	knownTables: [],
	// بعد از اولین جستجو، تغییر شرایط دیگه نتایج رو پاک نمی‌کنه بلکه زنده به‌روز می‌کنه
	hasSearched: false,
	searchSeq: 0,
	selectedTableIds: [],
	selectedLabel: '',
	map: null,
	currentUser: null,
};

const el = (id) => document.getElementById(id);
const sheet = createSheetController(el('sidePanel'));
initHeaderScroll();

function renderMap() {
	if (!state.map) return;
	if (state.availability?.tables) {
		state.knownTables = state.availability.tables;
	}
	// وقتی نتایج باطل شده، میزها سر جاشون می‌مونن ولی بدون وضعیت آزاد/پر،
	// تا نه سبزِ گمراه‌کننده باشن نه ناپدید
	const tables = state.availability?.tables || state.knownTables.map((t) => ({ ...t, availability: null }));
	state.map.setTables(tables, {
		selectedTableIds: state.selectedTableIds,
		mode: state.mode,
	});
}

function clearSelection() {
	state.selectedTableIds = [];
	state.selectedLabel = '';
	state.map?.setSelected([]);
}
let liveSearchTimer = null;

// نتیجه‌ی جستجو رو روی صفحه می‌نشونه (هم برای جستجوی دستی، هم زنده)
function applyAvailabilityResult() {
	renderMap();
	renderCombos();
	const tables = state.availability?.tables || [];
	const combos = state.availability?.combos || [];
	const availableCount = tables.filter((t) => t.availability?.available).length;
	if (availableCount || combos.length) {
		el('searchNotice').className = 'notice ok';
		el('searchNotice').textContent =
			state.availability?.exactMissingMessage || `${availableCount.toLocaleString('fa-IR')} میز مناسب روی نقشه روشن شد.`;
		el('selectedDetail').innerHTML = '<h4>میزی انتخاب نشده</h4><p>روی یک میز روشن ضربه بزن تا جزئیاتش رو ببینی.</p>';
	} else {
		el('searchNotice').className = 'notice warn';
		el('searchNotice').textContent = 'برای این ترکیب زمان و تعداد نفرات، میز آزادی پیدا نشد. زمان یا تاریخ نزدیک دیگری رو امتحان کن.';
		el('selectedDetail').innerHTML = '<h4>گزینه‌ای پیدا نشد</h4><p>زمان، تاریخ یا مدت رزرو رو تغییر بده تا نقشه دوباره بررسی بشه.</p>';
	}
}

async function runAvailabilitySearch() {
	// شماره‌ی درخواست: اگه پاسخ قدیمی‌تر دیرتر برسه، نادیده گرفته می‌شه
	const seq = ++state.searchSeq;
	try {
		const data = await api(`/api/availability?${buildAvailabilityParams()}`);
		if (seq !== state.searchSeq) return;
		state.availability = data;
		state.hasSearched = true;
		applyAvailabilityResult();
	} catch (error) {
		if (seq !== state.searchSeq) return;
		el('searchNotice').className = 'notice danger';
		el('searchNotice').textContent = error.message;
	}
}

function invalidateAvailability() {
	clearSelection();

	// بعد از اولین جستجو، تغییر شرایط باعث به‌روزرسانی زنده می‌شه نه پاک‌شدن نتایج.
	// تأخیر کوتاه لازمه وگرنه هر کلیک روی +/− یه درخواست جدا می‌فرسته.
	if (state.hasSearched) {
		el('searchNotice').className = 'notice';
		el('searchNotice').textContent = 'در حال به‌روزرسانی...';
		clearTimeout(liveSearchTimer);
		liveSearchTimer = setTimeout(runAvailabilitySearch, 400);
		return;
	}

	state.availability = null;
	renderMap();
	renderCombos();
	el('searchNotice').className = 'notice warn';
	el('searchNotice').textContent = 'شرایط جستجو رو انتخاب کن و دکمه‌ی بررسی میزها رو بزن.';
	el('selectedDetail').innerHTML = '<h4>هنوز جستجو نشده</h4><p>برای دیدن میزهای آزاد، دکمه‌ی بررسی میزها رو بزن.</p>';
}

/* ---------- guest stepper ---------- */
document.querySelectorAll('.stepper [data-step]').forEach((button) => {
	button.addEventListener('click', () => {
		const input = button.parentElement.querySelector('input');
		const min = Number(input.min) || 1;
		const max = Number(input.max) || 20;
		const next = Math.min(max, Math.max(min, Number(input.value || min) + Number(button.dataset.step)));
		input.value = next;
		invalidateAvailability();
	});
});

/* ---------- date strip ---------- */
function renderDates() {
	const row = el('dateRow');
	row.innerHTML = '';
	state.config.dates.forEach((date, index) => {
		const value = new Date(`${date}T12:00:00`);
		const label = index === 0 ? 'امروز' : index === 1 ? 'فردا' : value.toLocaleDateString('fa-IR', { weekday: 'short' });
		const button = document.createElement('button');
		button.type = 'button';
		button.className = `date-chip${index === 0 ? ' active' : ''}`;
		button.innerHTML = `<strong>${label}</strong><small>${value.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })}</small>`;
		button.addEventListener('click', () => {
			document.querySelectorAll('.date-chip').forEach((item) => item.classList.remove('active'));
			button.classList.add('active');
			state.selectedDate = date;
			invalidateAvailability();
		});
		row.appendChild(button);
	});
	state.selectedDate = state.config.dates[0];
}

/* ---------- exact / range mode ---------- */
function setMode(mode) {
	// اگر همان حالت فعلی دوباره انتخاب شود، نباید نتایج جستجو دور ریخته شود
	if (state.mode === mode) return;
	state.mode = mode;
	document.querySelectorAll('.mode-tabs button').forEach((button) => {
		button.classList.toggle('active', button.dataset.mode === mode);
	});
	el('exactBox').hidden = mode !== 'exact';
	el('rangeBox').hidden = mode !== 'range';
	// تعویض حالت هم شرایط جستجو را عوض می‌کند، پس نتایج قبلی دیگر معتبر نیست
	invalidateAvailability();
}

document.querySelectorAll('.mode-tabs button').forEach((button) => {
	button.addEventListener('click', () => setMode(button.dataset.mode));
});
// تایپ مستقیم در این ورودی‌ها هم مثل دکمه‌های +/− شرایط جستجو را عوض می‌کند
['guestCount', 'startTime', 'rangeStart', 'rangeEnd'].forEach((inputId) => {
	el(inputId)?.addEventListener('change', invalidateAvailability);
});
/* ---------- selection + detail panel ---------- */
function detailCard(title, lines, showAction = false) {
	return `
    <h4>${escapeHtml(title)}</h4>
    ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
    ${showAction ? `<button class="primary-btn" id="openReserve" style="margin-top:10px">${ICONS.check}<span>ادامه رزرو</span></button>` : ''}
  `;
}

function bindReserveAction() {
	const button = el('openReserve');
	if (button) button.addEventListener('click', openReserveModal);
}

function selectSingleTable(table) {
	if (!table.availability?.available) {
		el('selectedDetail').innerHTML = detailCard(`میز ${table.displayNumber}`, [
			ZONE_FA[table.zone] || table.zone,
			table.availability
				? table.availability.reason || 'این میز در حال حاضر قابل رزرو نیست.'
				: 'برای دیدن وضعیت این میز، اول دکمه‌ی بررسی میزها رو بزن.',
		]);
		sheet.open();
		return;
	}

	state.selectedTableIds = [table.id];
	state.selectedLabel = `میز ${table.displayNumber}`;
	state.map.setSelected(state.selectedTableIds);
	el('selectedDetail').innerHTML = detailCard(
		state.selectedLabel,
		[
			`${ZONE_FA[table.zone] || table.zone} · ظرفیت ${Number(table.capacity).toLocaleString('fa-IR')} نفر`,
			table.availability.message,
			`قابل رزرو از ${table.availability.startTime} تا ${table.availability.endTime}`,
		],
		true,
	);
	bindReserveAction();
	sheet.open();
}

function selectCombo(combo) {
	state.selectedTableIds = [...combo.tableIds];
	state.selectedLabel = `میزهای ${combo.displayNumbers.join(' و ')}`;
	state.map.setSelected(state.selectedTableIds);
	el('selectedDetail').innerHTML = detailCard(
		state.selectedLabel,
		[
			combo.message,
			`ظرفیت مجموع: ${Number(combo.capacity).toLocaleString('fa-IR')} نفر`,
			`قابل رزرو از ${combo.startTime} تا ${combo.endTime}`,
		],
		true,
	);
	bindReserveAction();
	sheet.open();
}

function renderCombos() {
	const panel = el('comboPanel');
	const list = el('comboList');
	const combos = state.availability?.combos || [];
	list.innerHTML = '';
	panel.hidden = combos.length === 0;

	combos.forEach((combo) => {
		const item = document.createElement('div');
		item.className = 'combo-item';
		item.innerHTML = `
      <span><b>میزهای ${escapeHtml(combo.displayNumbers.join(' و '))}</b><small>${escapeHtml(combo.startTime)} تا ${escapeHtml(combo.endTime)} · ظرفیت ${Number(combo.capacity || 0).toLocaleString('fa-IR')} نفر</small></span>
      <button type="button" class="secondary-btn">انتخاب</button>
    `;
		item.querySelector('button').addEventListener('click', () => selectCombo(combo));
		list.appendChild(item);
	});
}

/* ---------- reserve modal ---------- */
function openReserveModal() {
	if (!state.selectedTableIds.length) return;
	const guests = Number(el('guestCount').value);
	const price = state.config.settings.pricePerGuest * guests;
	el('modalSummary').className = 'notice';
	el('modalSummary').innerHTML =
		`${escapeHtml(state.selectedLabel)}<br>تعداد نفرات: ${guests.toLocaleString('fa-IR')}<br>مبلغ: ${escapeHtml(toman(price))}`;
	if (state.currentUser) {
		el('customerName').value = state.currentUser.name || '';
		el('customerPhone').value = state.currentUser.phone || '';
	}
	el('reserveModal').classList.add('open');
}

el('closeModal').addEventListener('click', () => el('reserveModal').classList.remove('open'));
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape') el('reserveModal').classList.remove('open');
});
el('reserveModal').addEventListener('click', (event) => {
	if (event.target === el('reserveModal')) el('reserveModal').classList.remove('open');
});

/* ---------- search + hold ---------- */
function buildAvailabilityParams() {
	const params = new URLSearchParams({
		date: state.selectedDate,
		guests: el('guestCount').value,
		durationMinutes: String(state.duration),
	});
	if (state.mode === 'exact') {
		params.set('startTime', el('startTime').value);
	} else {
		params.set('rangeStart', el('rangeStart').value);
		params.set('rangeEnd', el('rangeEnd').value);
	}
	return params;
}

function selectedStartTime() {
	if (state.mode === 'exact') return el('startTime').value;
	const selectedCombo = state.availability?.combos?.find(
		(combo) => combo.tableIds.length === state.selectedTableIds.length && combo.tableIds.every((id) => state.selectedTableIds.includes(id)),
	);
	if (selectedCombo) return selectedCombo.startTime;
	return state.availability?.tables?.find((table) => state.selectedTableIds.includes(table.id))?.availability?.startTime;
}

el('searchForm').addEventListener('submit', async (event) => {
	event.preventDefault();
	clearSelection();
	el('searchNotice').className = 'notice';
	el('searchNotice').textContent = 'در حال بررسی میزها...';
	clearTimeout(liveSearchTimer);
	await runAvailabilitySearch();
});

el('reserveForm').addEventListener('submit', async (event) => {
	event.preventDefault();
	const submitButton = event.target.querySelector('button[type="submit"]');
	submitButton.disabled = true;
	try {
		const startTime = selectedStartTime();
		if (!startTime) throw new Error('ساعت شروع مشخص نشد؛ دوباره میز رو انتخاب کن.');
		const body = {
			tableIds: state.selectedTableIds,
			date: state.selectedDate,
			startTime,
			durationMinutes: state.duration,
			guestCount: Number(el('guestCount').value),
			customerName: el('customerName').value.trim(),
			customerPhone: el('customerPhone').value.trim(),
		};
		const { reservation } = await api('/api/reservations/hold', { method: 'POST', body });
		window.location.href = `/payment.html?id=${encodeURIComponent(reservation.id)}`;
	} catch (error) {
		submitButton.disabled = false;
		el('modalSummary').className = 'notice danger';
		el('modalSummary').textContent = error.message;
	}
});

/* ---------- init ---------- */
async function init() {
	el('selectedDetail').innerHTML =
		'<div class="skeleton" style="height:15px;width:55%;margin-bottom:10px"></div><div class="skeleton" style="height:11px;width:85%"></div>';

	state.map = new RoofMap({
		svg: el('floorMap'),
		wrap: el('mapWrap'),
		zoneTabs: el('zoneTabs'),
		onTableClick: selectSingleTable,
	});

	await state.map.init();
	el('mapLoading').hidden = true;

	state.config = await api('/api/config');
	renderDurationChips(
		'durationRow',
		() => state.duration,
		(value) => {
			state.duration = value;
			invalidateAvailability();
		},
	);
	renderDates();

	try {
		const { user } = await api('/api/me');
		state.currentUser = user;
	} catch {
		state.currentUser = null;
	}

	// در اولین لود فقط چیدمان میزها گرفته می‌شه، نه وضعیت آزاد/پر —
	// تا قبل از زدن دکمه‌ی بررسی، همه‌ی میزها نچرال بمونن
	try {
		const initial = await api(`/api/availability?${buildAvailabilityParams()}`);
		state.knownTables = initial.tables || [];
	} catch (error) {
		state.knownTables = [];
		el('searchNotice').className = 'notice warn';
		el('searchNotice').textContent = `بارگذاری چیدمان میزها انجام نشد (${error.message}).`;
	}
	state.availability = null;

	renderMap();
	renderCombos();
	el('selectedDetail').innerHTML = '<h4>هنوز جستجو نشده</h4><p>تاریخ، تعداد نفرات و ساعت رو انتخاب کن و دکمه‌ی بررسی میزها رو بزن.</p>';
}

init().catch((error) => {
	el('mapLoading').hidden = true;
	el('searchNotice').className = 'notice danger';
	el('searchNotice').textContent = error.message;
});
