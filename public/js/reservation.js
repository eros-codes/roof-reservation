import { api, toman } from './api.js';
import { ICONS, createSheetController, initHeaderScroll } from './ui.js';

const state = {
  config: null,
  selectedDate: null,
  mode: 'exact',
  duration: 60,
  availability: null,
  selectedTableIds: [],
  selectedLabel: ''
};

const el = (id) => document.getElementById(id);
const floorMap = el('floorMap');
const bubbleLayer = el('bubbleLayer');
const sheet = createSheetController(el('sidePanel'));
initHeaderScroll();

/* ---------- guest stepper ---------- */
document.querySelectorAll('.stepper [data-step]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const next = Math.min(20, Math.max(1, Number(input.value || 1) + Number(btn.dataset.step)));
    input.value = next;
  });
});

/* ---------- duration chips ---------- */
function renderDurationChips() {
  const row = el('durationRow');
  row.innerHTML = '';
  for (let m = 60; m <= 240; m += 30) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (m === state.duration ? ' active' : '');
    btn.textContent = `${(m / 60).toLocaleString('fa-IR')} ساعت`;
    btn.addEventListener('click', () => {
      state.duration = m;
      row.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
    });
    row.appendChild(btn);
  }
}

/* ---------- date strip ---------- */
function renderDates() {
  const row = el('dateRow');
  row.innerHTML = '';
  state.config.dates.forEach((date, index) => {
    const d = new Date(date + 'T12:00:00');
    const label = index === 0 ? 'امروز' : index === 1 ? 'فردا' : d.toLocaleDateString('fa-IR', { weekday: 'short' });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'date-chip' + (index === 0 ? ' active' : '');
    btn.innerHTML = `<strong>${label}</strong><small>${d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })}</small>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.date-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedDate = date;
    });
    row.appendChild(btn);
  });
  state.selectedDate = state.config.dates[0];
}

/* ---------- exact / range mode ---------- */
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  el('exactBox').style.display = mode === 'exact' ? '' : 'none';
  el('rangeBox').style.display = mode === 'range' ? '' : 'none';
}
document.querySelectorAll('.mode-tabs button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

/* ---------- floor map (mock — verified clear of the real seeded tables;
   swapped for the real plan later without touching this logic) ---------- */
function tableColor(table) {
  const a = table.availability;
  if (state.selectedTableIds.includes(table.id)) return '#422E2F';
  if (!a?.available) return 'rgba(66,46,47,.3)';
  if (a.matchType === 'perfect') return '#6E8151';
  return '#A9B98C';
}

function drawBase() {
  floorMap.innerHTML = `
    <polygon points="90,68 840,68 890,560 50,560" fill="rgba(255,255,255,.22)" stroke="rgba(66,46,47,.14)" stroke-width="1.5"/>
    <polygon points="105,82 825,82 840,205 95,205" fill="rgba(255,255,255,.16)" stroke="rgba(66,46,47,.08)"/>
    <text x="790" y="125" text-anchor="middle" fill="#6D5F54" font-size="17">کنار پنجره</text>
    <polygon points="95,220 842,220 862,410 78,410" fill="rgba(197,188,173,.22)" stroke="rgba(66,46,47,.08)"/>
    <text x="785" y="260" text-anchor="middle" fill="#6D5F54" font-size="17">وسط</text>
    <polygon points="78,426 865,426 882,548 60,548" fill="rgba(255,255,255,.16)" stroke="rgba(66,46,47,.08)"/>
    <text x="795" y="468" text-anchor="middle" fill="#6D5F54" font-size="17">روف</text>

    <rect x="44" y="225" width="42" height="95" rx="4" fill="#6D5F54" opacity=".3"/>
    <text x="65" y="335" text-anchor="middle" fill="#422E2F" font-size="13">در</text>

    <rect x="855" y="380" width="46" height="110" rx="4" fill="none" stroke="#422E2F" stroke-opacity=".4"/>
    <path d="M855 400h46M855 420h46M855 440h46M855 460h46M855 480h46" stroke="#422E2F" stroke-opacity=".3"/>
    <text x="878" y="504" text-anchor="middle" fill="#422E2F" font-size="13">پله</text>

    <circle cx="880" cy="95" r="22" fill="rgba(66,46,47,.14)"/>
    <circle cx="880" cy="95" r="13" fill="rgba(66,46,47,.22)"/>
    <text x="880" y="132" text-anchor="middle" fill="#6D5F54" font-size="12">گلدون</text>

    <rect x="200" y="70" width="360" height="10" rx="2" fill="rgba(255,255,255,.35)" stroke="rgba(66,46,47,.1)"/>
  `;
}

function addTable(table) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.classList.add('map-table');
  if (!table.availability?.available) g.classList.add('disabled');
  if (state.selectedTableIds.includes(table.id)) g.classList.add('selected');
  g.style.setProperty('--tx', table.x);
  g.style.setProperty('--ty', table.y);
  g.style.setProperty('--rot', `${table.rotation || 0}deg`);

  const color = tableColor(table);
  const selected = state.selectedTableIds.includes(table.id);
  const shape = document.createElementNS('http://www.w3.org/2000/svg', table.shape === 'ROUND' ? 'ellipse' : 'rect');
  if (table.shape === 'ROUND') {
    shape.setAttribute('cx', 0); shape.setAttribute('cy', 0); shape.setAttribute('rx', table.width / 2); shape.setAttribute('ry', table.height / 2);
  } else {
    shape.setAttribute('x', -table.width / 2); shape.setAttribute('y', -table.height / 2);
    shape.setAttribute('width', table.width); shape.setAttribute('height', table.height);
    shape.setAttribute('rx', table.shape === 'SQUARE' ? 6 : 8);
  }
  shape.setAttribute('fill', color);
  shape.setAttribute('stroke', selected ? '#EFEAE4' : 'rgba(66,46,47,.16)');
  shape.setAttribute('stroke-width', selected ? '3' : '1.2');

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dominant-baseline', 'middle');
  label.setAttribute('fill', selected ? '#EFEAE4' : '#1F1516');
  label.setAttribute('font-weight', '700');
  label.setAttribute('font-size', '17');
  label.textContent = table.displayNumber;

  g.appendChild(shape);
  g.appendChild(label);
  g.addEventListener('click', () => selectSingleTable(table));
  floorMap.appendChild(g);

  if (table.availability?.available && table.availability.startTime && state.mode === 'range') {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = `از ${table.availability.startTime}`;
    bubble.style.right = `${100 - (table.x / 940) * 100}%`;
    bubble.style.top = `${(table.y / 610) * 100 - 3}%`;
    bubbleLayer.appendChild(bubble);
  }
}

function drawMap() {
  drawBase();
  bubbleLayer.innerHTML = '';
  const tables = state.availability?.tables || [];
  tables.forEach(addTable);
}

/* ---------- selection + detail panel ---------- */
function detailCard(title, lines, showAction) {
  return `
    <h4>${title}</h4>
    ${lines.map((l) => `<p>${l}</p>`).join('')}
    ${showAction ? `<button class="primary-btn" id="openReserve" style="margin-top:10px">${ICONS.check}<span>ادامه رزرو</span></button>` : ''}
  `;
}

function selectSingleTable(table) {
  if (!table.availability?.available) {
    el('selectedDetail').innerHTML = detailCard(`میز ${table.displayNumber}`, [table.availability?.reason || 'قابل رزرو نیست.']);
    sheet.open();
    return;
  }
  state.selectedTableIds = [table.id];
  state.selectedLabel = `میز ${table.displayNumber}`;
  drawMap();
  el('selectedDetail').innerHTML = detailCard(state.selectedLabel, [
    table.availability.message,
    `قابل رزرو از ${table.availability.startTime} تا ${table.availability.endTime}`
  ], true);
  el('openReserve').addEventListener('click', openReserveModal);
  sheet.open();
}

function selectCombo(combo) {
  state.selectedTableIds = combo.tableIds;
  state.selectedLabel = `میزهای ${combo.displayNumbers.join(' و ')}`;
  drawMap();
  el('selectedDetail').innerHTML = detailCard(state.selectedLabel, [
    combo.message,
    `قابل رزرو از ${combo.startTime} تا ${combo.endTime}`
  ], true);
  el('openReserve').addEventListener('click', openReserveModal);
  sheet.open();
}

function renderCombos() {
  const panel = el('comboPanel');
  const list = el('comboList');
  list.innerHTML = '';
  const combos = state.availability?.combos || [];
  panel.style.display = combos.length ? '' : 'none';
  combos.forEach((combo) => {
    const item = document.createElement('div');
    item.className = 'combo-item';
    item.innerHTML = `<span>${combo.message}</span><button class="secondary-btn">انتخاب</button>`;
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

/* ---------- search + hold ---------- */
el('searchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.selectedTableIds = [];
  const params = new URLSearchParams({
    date: state.selectedDate,
    guests: el('guestCount').value,
    durationMinutes: state.duration
  });
  if (state.mode === 'exact') params.set('startTime', el('startTime').value);
  else { params.set('rangeStart', el('rangeStart').value); params.set('rangeEnd', el('rangeEnd').value); }
  try {
    el('searchNotice').className = 'notice';
    el('searchNotice').textContent = 'در حال بررسی...';
    state.availability = await api(`/api/availability?${params}`);
    drawMap();
    renderCombos();
    el('searchNotice').className = 'notice ok';
    el('searchNotice').textContent = state.availability.exactMissingMessage || 'میزهای قابل رزرو روی نقشه روشن شدند.';
    el('selectedDetail').innerHTML = `<h4>میزی انتخاب نشده</h4><p>روی یک میز سبز روی نقشه ضربه بزن.</p>`;
  } catch (error) {
    el('searchNotice').className = 'notice danger';
    el('searchNotice').textContent = error.message;
  }
});

el('reserveForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitBtn = event.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  try {
    const body = {
      tableIds: state.selectedTableIds,
      date: state.selectedDate,
      startTime: state.mode === 'exact'
        ? el('startTime').value
        : (state.availability.combos.find((c) => c.tableIds.every((id) => state.selectedTableIds.includes(id)))?.startTime
          || state.availability.tables.find((t) => state.selectedTableIds.includes(t.id))?.availability?.startTime),
      durationMinutes: state.duration,
      guestCount: Number(el('guestCount').value),
      customerName: el('customerName').value,
      customerPhone: el('customerPhone').value
    };
    const { reservation } = await api('/api/reservations/hold', { method: 'POST', body });
    window.location.href = `/payment.html?id=${reservation.id}`;
  } catch (error) {
    submitBtn.disabled = false;
    el('modalSummary').outerHTML = `<div id="modalSummary" class="notice danger">${error.message}</div>`;
  }
});

/* ---------- init ---------- */
async function init() {
  el('selectedDetail').innerHTML = `<div class="skeleton" style="height:15px;width:55%;margin-bottom:10px"></div><div class="skeleton" style="height:11px;width:85%"></div>`;
  state.config = await api('/api/config');
  renderDurationChips();
  renderDates();
  state.availability = await api(`/api/availability?date=${state.selectedDate}&guests=${el('guestCount').value}&durationMinutes=${state.duration}&startTime=${el('startTime').value}`).catch(() => ({ tables: [], combos: [] }));
  drawMap();
  renderCombos();
  el('selectedDetail').innerHTML = `<h4>میزی انتخاب نشده</h4><p>روی یک میز سبز روی نقشه ضربه بزن.</p>`;
}

init().catch((error) => {
  el('searchNotice').className = 'notice danger';
  el('searchNotice').textContent = error.message;
});
