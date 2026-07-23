// Shared UI helpers: icons, hold countdown ring, mobile bottom-sheet controller.

export const ICONS = {
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.8 19c.6-3.2 3-5 6.2-5s5.6 1.8 6.2 5"/><path d="M16 4.2c1.7.3 3 1.8 3 3.6s-1.3 3.3-3 3.6M21.2 19c-.4-2.4-1.6-4-3.5-4.7"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="8" rx="7" ry="3.2"/><path d="M5 8v4c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2V8M12 15.2V20M8 20h8"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.6z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l5 5L20 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.3 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.9 21 3 13.1 3 3.6c0-.6.4-1 1-1H7.6c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.3 1z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 000-3l1.9-1.5-2-3.4-2.2.9a7.6 7.6 0 00-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 00-2.6 1.5l-2.2-.9-2 3.4L4.6 10.5a7.6 7.6 0 000 3L2.7 15l2 3.4 2.2-.9c.8.7 1.6 1.2 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 002.6-1.5l2.2.9 2-3.4z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7m2 0-.7 12.4A2 2 0 0114.3 21H9.7a2 2 0 01-2-1.6L7 7"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4.5L15 3v18M15 12.2h.01"/><path d="M5 21h14"/></svg>',
  ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M6.5 6.5l11 11"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.3-4.3"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7" width="17" height="13" rx="2.5"/><path d="M8 7V5.5A2.5 2.5 0 0110.5 3h3A2.5 2.5 0 0116 5.5V7M3.5 12h17"/></svg>'
};

export function roofMonogram() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="#EFEAE4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5L12 5l8 7.5"/><path d="M6.5 10.7V19h11v-8.3"/></svg>';
}

/**
 * Mounts a countdown ring bound to an absolute expiry timestamp.
 * onExpire fires once when time runs out. Returns a stop() handle.
 */
export function mountHoldRing(container, expiresAt, { totalSeconds, onExpire, onTick } = {}) {
  const R = 30;
  const circumference = 2 * Math.PI * R;
  const total = totalSeconds || Math.max(1, Math.round((new Date(expiresAt) - Date.now()) / 1000));
  container.innerHTML = `
    <div class="hold-ring">
      <svg viewBox="0 0 74 74">
        <circle class="track" cx="37" cy="37" r="${R}"/>
        <circle class="progress" cx="37" cy="37" r="${R}" stroke-dasharray="${circumference}" stroke-dashoffset="0"/>
      </svg>
      <div class="hold-ring-num"></div>
    </div>`;
  const ring = container.querySelector('.hold-ring');
  const progress = container.querySelector('.progress');
  const num = container.querySelector('.hold-ring-num');

  let stopped = false;
  function tick() {
    if (stopped) return;
    const remainMs = new Date(expiresAt) - Date.now();
    if (!Number.isFinite(remainMs)) {
      stopped = true;
      if (onExpire) onExpire();
      return;
    }
    const remain = Math.max(0, Math.ceil(remainMs / 1000));
    const ratio = Math.max(0, Math.min(1, remain / total));
    progress.setAttribute('stroke-dashoffset', String(circumference * (1 - ratio)));
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    num.textContent = `${m}:${String(s).padStart(2, '0')}`;
    ring.classList.toggle('warn', remain <= 60);
    if (onTick) onTick(remain);
    if (remain <= 0) {
      stopped = true;
      if (onExpire) onExpire();
      return;
    }
    setTimeout(tick, 250);
  }
  tick();
  return { stop: () => { stopped = true; } };
}

/** Simple bottom-sheet controller for mobile table-detail panels. */
export function createSheetController(panelEl) {
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  document.body.appendChild(scrim);
  const handle = document.createElement('div');
  handle.className = 'sheet-handle';
  panelEl.prepend(handle);

  const mobileQuery = window.matchMedia('(max-width: 860px)');
  function isMobile() { return mobileQuery.matches; }
  function open() {
    if (!isMobile()) return;
    panelEl.classList.add('as-sheet', 'open');
    scrim.classList.add('open');
  }
  function close() {
    panelEl.classList.remove('open');
    scrim.classList.remove('open');
  }
  scrim.addEventListener('click', close);
  window.addEventListener('resize', () => { if (!isMobile()) { panelEl.classList.remove('as-sheet', 'open'); scrim.classList.remove('open'); } });
  return { open, close };
}

export function faHours(minutes) {
  const n = Number(minutes);
  return (Number.isFinite(n) ? n / 60 : 0).toLocaleString('fa-IR');
}

/** Toggles .is-scrolled on the header past 55px — same threshold as the About page. */
export function initHeaderScroll() {
  const header = document.querySelector('.topbar');
  if (!header) return;
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 55);
  window.addEventListener('scroll', update, { passive: true });
  update();
}
