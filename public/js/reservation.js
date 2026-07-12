import { api, toman } from './api.js';
import { ICONS, createSheetController, initHeaderScroll } from './ui.js';
import { RoofMap } from './map-renderer.js';

const ZONE_FA = { WINDOW: 'سالن پنجره', CENTER: 'سالن وسط', ROOF: 'روف گاردن' };

const state = {
  config: null,
  selectedDate: null,
  mode: 'exact',
  duration: 60,
  availability: null,
  selectedTableIds: [],
  selectedLabel: '',
  map: null
};

const el = (id) => document.getElementById(id);
const sheet = createSheetController(el('sidePanel'));
initHeaderScroll();

function renderMap() {
  if (!state.map) return;
  state.map.setTables(state.availability?.tables || [], {
    selectedTableIds: state.selectedTableIds,
    mode: state.mode
  });
}

function clearSelection() {
  state.selectedTableIds = [];
  state.selectedLabel = '';
  state.map?.setSelected([]);
}

/* ---------- guest stepper ---------- */
document.querySelectorAll('.stepper [data-step]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input');
    const next = Math.min(20, Math.max(1, Number(input.value || 1) + Number(button.dataset.step)));
    input.value = next;
  });
});

/* ---------- duration chips ---------- */
function renderDurationChips() {
  const row = el('durationRow');
  row.innerHTML = '';
  for (let minutes = 60; minutes <= 240; minutes += 30) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chip${minutes === state.duration ? ' active' : ''}`;
    button.textContent = `${(minutes / 60).toLocaleString('fa-IR')} ساعت`;
    button.addEventListener('click', () => {
      state.duration = minutes;
      row.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'));
      button.classList.add('active');
    });
    row.appendChild(button);
  }
}

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
      clearSelection();
    });
    row.appendChild(button);
  });
  state.selectedDate = state.config.dates[0];
}

/* ---------- exact / range mode ---------- */
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-tabs button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
  el('exactBox').hidden = mode !== 'exact';
  el('rangeBox').hidden = mode !== 'range';
  clearSelection();
  renderMap();
}

document.querySelectorAll('.mode-tabs button').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

/* ---------- selection + detail panel ---------- */
function detailCard(title, lines, showAction = false) {
  return `
    <h4>${title}</h4>
    ${lines.map((line) => `<p>${line}</p>`).join('')}
    ${showAction ? `<button class="primary-btn" id="openReserve" style="margin-top:10px">${ICONS.check}<span>ادامه رزرو</span></button>` : ''}
  `;
}

function bindReserveAction() {
  const button = el('openReserve');
  if (button) button.addEventListener('click', openReserveModal);
}

function selectSingleTable(table) {
  if (!table.availability?.available) {
    el('selectedDetail').innerHTML = detailCard(
      `میز ${table.displayNumber}`,
      [ZONE_FA[table.zone] || table.zone, table.availability?.reason || 'این میز در حال حاضر قابل رزرو نیست.']
    );
    sheet.open();
    return;
  }

  state.selectedTableIds = [table.id];
  state.selectedLabel = `میز ${table.displayNumber}`;
  state.map.setSelected(state.selectedTableIds);
  el('selectedDetail').innerHTML = detailCard(state.selectedLabel, [
    `${ZONE_FA[table.zone] || table.zone} · ظرفیت ${Number(table.capacity).toLocaleString('fa-IR')} نفر`,
    table.availability.message,
    `قابل رزرو از ${table.availability.startTime} تا ${table.availability.endTime}`
  ], true);
  bindReserveAction();
  sheet.open();
}

function selectCombo(combo) {
  state.selectedTableIds = [...combo.tableIds];
  state.selectedLabel = `میزهای ${combo.displayNumbers.join(' و ')}`;
  state.map.setSelected(state.selectedTableIds);
  el('selectedDetail').innerHTML = detailCard(state.selectedLabel, [
    combo.message,
    `ظرفیت مجموع: ${Number(combo.capacity).toLocaleString('fa-IR')} نفر`,
    `قابل رزرو از ${combo.startTime} تا ${combo.endTime}`
  ], true);
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
      <span><b>میزهای ${combo.displayNumbers.join(' و ')}</b><small>${combo.startTime} تا ${combo.endTime} · ظرفیت ${Number(combo.capacity).toLocaleString('fa-IR')} نفر</small></span>
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
  el('modalSummary').innerHTML = `${state.selectedLabel}<br>تعداد نفرات: ${guests.toLocaleString('fa-IR')}<br>مبلغ: ${toman(price)}`;
  el('reserveModal').classList.add('open');
}

el('closeModal').addEventListener('click', () => el('reserveModal').classList.remove('open'));
el('reserveModal').addEventListener('click', (event) => {
  if (event.target === el('reserveModal')) el('reserveModal').classList.remove('open');
});

/* ---------- search + hold ---------- */
function buildAvailabilityParams() {
  const params = new URLSearchParams({
    date: state.selectedDate,
    guests: el('guestCount').value,
    durationMinutes: String(state.duration)
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
  const selectedCombo = state.availability?.combos?.find((combo) => (
    combo.tableIds.length === state.selectedTableIds.length
    && combo.tableIds.every((id) => state.selectedTableIds.includes(id))
  ));
  if (selectedCombo) return selectedCombo.startTime;
  return state.availability?.tables?.find((table) => state.selectedTableIds.includes(table.id))?.availability?.startTime;
}

el('searchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearSelection();
  try {
    el('searchNotice').className = 'notice';
    el('searchNotice').textContent = 'در حال بررسی میزها...';
    state.availability = await api(`/api/availability?${buildAvailabilityParams()}`);
    renderMap();
    renderCombos();

    const availableCount = state.availability.tables.filter((table) => table.availability?.available).length;
    if (availableCount || state.availability.combos.length) {
      el('searchNotice').className = 'notice ok';
      el('searchNotice').textContent = state.availability.exactMissingMessage
        || `${availableCount.toLocaleString('fa-IR')} میز مناسب روی نقشه روشن شد.`;
      el('selectedDetail').innerHTML = '<h4>میزی انتخاب نشده</h4><p>روی یک میز روشن ضربه بزن تا جزئیاتش رو ببینی.</p>';
    } else {
      el('searchNotice').className = 'notice warn';
      el('searchNotice').textContent = 'برای این ترکیب زمان و تعداد نفرات، میز آزادی پیدا نشد. زمان یا تاریخ نزدیک دیگری رو امتحان کن.';
      el('selectedDetail').innerHTML = '<h4>گزینه‌ای پیدا نشد</h4><p>زمان، تاریخ یا مدت رزرو رو تغییر بده تا نقشه دوباره بررسی بشه.</p>';
    }
  } catch (error) {
    el('searchNotice').className = 'notice danger';
    el('searchNotice').textContent = error.message;
  }
});

el('reserveForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = event.target.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const body = {
      tableIds: state.selectedTableIds,
      date: state.selectedDate,
      startTime: selectedStartTime(),
      durationMinutes: state.duration,
      guestCount: Number(el('guestCount').value),
      customerName: el('customerName').value,
      customerPhone: el('customerPhone').value
    };
    const { reservation } = await api('/api/reservations/hold', { method: 'POST', body });
    window.location.href = `/payment.html?id=${reservation.id}`;
  } catch (error) {
    submitButton.disabled = false;
    el('modalSummary').className = 'notice danger';
    el('modalSummary').textContent = error.message;
  }
});

/* ---------- init ---------- */
async function init() {
  el('selectedDetail').innerHTML = '<div class="skeleton" style="height:15px;width:55%;margin-bottom:10px"></div><div class="skeleton" style="height:11px;width:85%"></div>';

  state.map = new RoofMap({
    svg: el('floorMap'),
    wrap: el('mapWrap'),
    zoneTabs: el('zoneTabs'),
    onTableClick: selectSingleTable
  });

  await state.map.init();
  el('mapLoading').hidden = true;

  state.config = await api('/api/config');
  renderDurationChips();
  renderDates();

  try {
    state.availability = await api(`/api/availability?${buildAvailabilityParams()}`);
  } catch {
    state.availability = { tables: [], combos: [] };
  }

  renderMap();
  renderCombos();
  el('selectedDetail').innerHTML = '<h4>میزی انتخاب نشده</h4><p>بعد از بررسی زمان، روی یکی از میزهای روشن ضربه بزن.</p>';
}

init().catch((error) => {
  el('mapLoading').hidden = true;
  el('searchNotice').className = 'notice danger';
  el('searchNotice').textContent = error.message;
});
