const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  });
  return node;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rounded(value) {
  return Math.round(Number(value) * 10) / 10;
}

function normalizeViewBox(input) {
  if (Array.isArray(input)) {
    const [x, y, width, height] = input.map(Number);
    return { x, y, width, height };
  }
  return {
    x: Number(input.x),
    y: Number(input.y),
    width: Number(input.width),
    height: Number(input.height)
  };
}

function tableStateClass(table, selectedIds, editorMode) {
  if (selectedIds.includes(table.id)) return 'is-selected';
  if (editorMode) return table.isActive ? 'is-neutral' : 'is-unavailable';
  if (!table.availability?.available) return 'is-unavailable';
  return table.availability.matchType === 'perfect' ? 'is-perfect' : 'is-soft';
}

function chairPositions(table, visual) {
  const w = Number(table.width);
  const h = Number(table.height);
  const gapX = w / 2 + 22;
  const gapY = h / 2 + 22;
  const layout = visual.seatLayout || '';
  const capacity = Number(table.capacity);

  if (layout === 'sofa-bottom') {
    return [
      { x: 0, y: -gapY, rotation: 180 },
      { x: gapX, y: 0, rotation: -90 }
    ].slice(0, Number(visual.externalSeats || 2));
  }
  if (layout === 'sofa-right') {
    return [
      { x: -gapX, y: -h * .24, rotation: 90 },
      { x: -gapX, y: h * .24, rotation: 90 },
      { x: 0, y: -gapY, rotation: 180 }
    ].slice(0, Number(visual.externalSeats || 3));
  }
  if (layout === 'horizontal') return [{ x: -gapX, y: 0, rotation: 90 }, { x: gapX, y: 0, rotation: -90 }];
  if (layout === 'vertical') return [{ x: 0, y: -gapY, rotation: 180 }, { x: 0, y: gapY, rotation: 0 }];
  if (layout === 'three-sides') {
    return [
      { x: 0, y: -gapY, rotation: 180 },
      { x: -gapX, y: h * .08, rotation: 90 },
      { x: gapX, y: h * .08, rotation: -90 }
    ];
  }
  if (layout === 'rect-4-sides') {
    return [
      { x: -gapX, y: -h * .23, rotation: 90 },
      { x: -gapX, y: h * .23, rotation: 90 },
      { x: gapX, y: -h * .23, rotation: -90 },
      { x: gapX, y: h * .23, rotation: -90 }
    ];
  }
  if (layout === 'rect-6') {
    return [-.32, 0, .32].flatMap((ratio) => [
      { x: w * ratio, y: -gapY, rotation: 180 },
      { x: w * ratio, y: gapY, rotation: 0 }
    ]);
  }
  if (layout === 'cardinal' || capacity === 4) {
    return [
      { x: 0, y: -gapY, rotation: 180 },
      { x: gapX, y: 0, rotation: -90 },
      { x: 0, y: gapY, rotation: 0 },
      { x: -gapX, y: 0, rotation: 90 }
    ];
  }

  const count = clamp(capacity, 1, 8);
  const rx = gapX;
  const ry = gapY;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return {
      x: Math.cos(angle) * rx,
      y: Math.sin(angle) * ry,
      rotation: (angle * 180) / Math.PI + 90
    };
  });
}

function createChair(position, scale = 1) {
  const group = svgEl('g', {
    class: 'roof-chair',
    transform: `translate(${rounded(position.x)} ${rounded(position.y)}) rotate(${rounded(position.rotation || 0)}) scale(${scale})`
  });
  group.append(
    svgEl('ellipse', { class: 'chair-shadow', cx: 0, cy: 6, rx: 13, ry: 9 }),
    svgEl('rect', { class: 'chair-base', x: -12, y: -9, width: 24, height: 19, rx: 8 }),
    svgEl('path', { class: 'chair-back', d: 'M-11-7Q0-16 11-7L9-2Q0-9-9-2Z' }),
    svgEl('path', { class: 'chair-seam', d: 'M-7 3Q0 7 7 3' })
  );
  return group;
}

function createSharedSeatMarker(position) {
  const group = svgEl('g', {
    class: 'roof-chair roof-chair--shared',
    transform: `translate(${rounded(position.x)} ${rounded(position.y)}) rotate(${rounded(position.angle || 0)})`
  });
  const title = svgEl('title');
  title.textContent = 'صندلی مشترک با مبل — روی مبل پس‌زمینه می‌شینه';
  group.append(svgEl('circle', { class: 'shared-seat-dot', cx: 0, cy: 0, r: 6 }), title);
  return group;
}

function createSofaModule({ x, y, width, rotation = 0, double = false }) {
  const group = svgEl('g', { class: 'roof-sofa-module', transform: `translate(${x} ${y}) rotate(${rotation})` });
  const w = double ? width * 1.65 : width;
  group.append(
    svgEl('rect', { class: 'sofa-shadow', x: -w / 2, y: -13, width: w, height: 29, rx: 10 }),
    svgEl('rect', { class: 'sofa-seat', x: -w / 2, y: -17, width: w, height: 25, rx: 9 }),
    svgEl('path', { class: 'sofa-back', d: `M${-w / 2 + 3}-13Q0-24 ${w / 2 - 3}-13L${w / 2 - 5}-7Q0-16 ${-w / 2 + 5}-7Z` })
  );
  if (double) group.append(svgEl('path', { class: 'chair-seam', d: 'M0-14V5' }));
  return group;
}

function createTableBody(table, visual) {
  const group = svgEl('g', { class: 'roof-table-body' });
  const w = Number(table.width);
  const h = Number(table.height);
  const isRound = table.shape === 'ROUND';
  const radius = table.shape === 'SQUARE' ? 6 : 11;

  if (isRound) {
    group.append(
      svgEl('ellipse', { class: 'table-shadow', cx: 0, cy: 12, rx: w / 2 + 5, ry: h / 2 + 4 }),
      svgEl('ellipse', { class: 'table-side', cx: 0, cy: 8, rx: w / 2, ry: h / 2 }),
      svgEl('ellipse', { class: 'table-top', cx: 0, cy: 0, rx: w / 2, ry: h / 2 }),
      svgEl('ellipse', { class: 'table-highlight', cx: -w * .08, cy: -h * .08, rx: w * .31, ry: h * .2 })
    );
  } else {
    group.append(
      svgEl('rect', { class: 'table-shadow', x: -w / 2 - 5, y: -h / 2 + 8, width: w + 10, height: h + 10, rx: radius + 4 }),
      svgEl('rect', { class: 'table-side', x: -w / 2, y: -h / 2 + 8, width: w, height: h, rx: radius }),
      svgEl('rect', { class: 'table-top', x: -w / 2, y: -h / 2, width: w, height: h, rx: radius }),
      svgEl('path', { class: 'table-highlight', d: `M${-w / 2 + 9} ${-h / 2 + 9}H${w / 2 - 9}` })
    );
  }

  if (visual.seatLayout === 'sofa-bottom') {
    group.append(svgEl('rect', { class: 'sofa-capacity', x: -w * .34, y: h / 2 + 8, width: w * .68, height: 8, rx: 4 }));
  }
  if (visual.seatLayout === 'sofa-right') {
    group.append(svgEl('rect', { class: 'sofa-capacity', x: w / 2 + 8, y: -h * .32, width: 8, height: h * .64, rx: 4 }));
  }
  return group;
}

function createTableLabel(table) {
  // چون این بج بیرون از لایه‌ی چرخان (roof-table-spin) اضافه می‌شه، خودش
  // هیچ‌وقت نمی‌چرخه؛ نیازی به چرخش معکوس نیست.
  const group = svgEl('g', { class: 'table-number-badge' });
  group.append(
    svgEl('circle', { class: 'table-number-bg', cx: 0, cy: 0, r: 15 }),
    svgEl('text', { class: 'table-number', x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle' })
  );
  group.querySelector('text').textContent = table.displayNumber;
  return group;
}

function createTimeBubble(text, table) {
  const w = Math.max(70, text.length * 8 + 20);
  const y = -(Number(table.height) / 2 + 58);
  const group = svgEl('g', { class: 'map-time-bubble', transform: `translate(0 ${y})` });
  group.append(
    svgEl('rect', { x: -w / 2, y: -16, width: w, height: 32, rx: 5 }),
    svgEl('path', { d: 'M-7 15L0 25L7 15Z' }),
    svgEl('text', { x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle' })
  );
  group.querySelector('text').textContent = text;
  return group;
}

function createLounge(table) {
  const group = svgEl('g', { class: 'roof-lounge' });
  const w = Number(table.width);
  const h = Number(table.height);
  group.append(
    createSofaModule({ x: -w * .78, y: 0, width: 31, rotation: 90 }),
    createSofaModule({ x: 0, y: -h * .9, width: 31, rotation: 180 }),
    createSofaModule({ x: w * .82, y: 0, width: 31, rotation: -90, double: true })
  );
  return group;
}

export class RoofMap {
  constructor({
    svg,
    wrap,
    zoneTabs = null,
    onTableClick = null,
    onTableMove = null,
    editable = false,
    baseUrl = '/assets/maps/roof-base.svg',
    configUrl = '/assets/maps/roof-map.json'
  }) {
    if (!svg) throw new Error('عنصر SVG نقشه پیدا نشد.');
    this.svg = svg;
    this.wrap = wrap || svg.parentElement;
    this.zoneTabs = zoneTabs;
    this.onTableClick = onTableClick;
    this.onTableMove = onTableMove;
    this.editable = editable;
    this.baseUrl = baseUrl;
    this.configUrl = configUrl;
    this.tables = [];
    this.selectedIds = [];
    this.mode = 'exact';
    this.activeZone = 'ALL';
    this.config = null;
    this.defaultView = null;
    this.currentView = null;
    this.tableNodes = new Map();
    this.drag = null;
    this.pan = null;
    this.animationFrame = null;
  }

  async init() {
    const [svgText, config] = await Promise.all([
      fetch(this.baseUrl, { cache: 'no-cache' }).then((response) => {
        if (!response.ok) throw new Error('فایل پایه نقشه بارگذاری نشد.');
        return response.text();
      }),
      fetch(this.configUrl, { cache: 'no-cache' }).then((response) => {
        if (!response.ok) throw new Error('تنظیمات نقشه بارگذاری نشد.');
        return response.json();
      })
    ]);

    const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const source = parsed.documentElement;
    if (source.nodeName.toLowerCase() === 'parsererror' || parsed.querySelector('parsererror')) {
      throw new Error('ساختار فایل SVG نقشه معتبر نیست.');
    }

    this.config = config;
    this.defaultView = normalizeViewBox(config.defaultView || config.viewBox);
    this.currentView = { ...this.defaultView };
    this.svg.innerHTML = source.innerHTML;
    this.svg.setAttribute('viewBox', Object.values(this.defaultView).join(' '));
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.classList.add('roof-floor-map');
    this.tableLayer = this.svg.querySelector('#table-layer') || this.svg.appendChild(svgEl('g', { id: 'table-layer' }));
    this.comboLayer = this.svg.querySelector('#combo-layer') || this.svg.insertBefore(svgEl('g', { id: 'combo-layer' }), this.tableLayer);
    this.editorLayer = this.svg.querySelector('#editor-layer') || this.svg.appendChild(svgEl('g', { id: 'editor-layer' }));

    this.renderZoneTabs();
    this.bindNavigation();
    this.applyViewBox(this.defaultView);
    return this;
  }

  renderZoneTabs() {
    if (!this.zoneTabs) return;
    const entries = Object.entries(this.config.zones || {});
    this.zoneTabs.innerHTML = entries.map(([key, zone]) => (
      `<button type="button" data-map-zone="${key}" class="${key === 'ALL' ? 'active' : ''}">${zone.label}</button>`
    )).join('');
    this.zoneTabs.querySelectorAll('[data-map-zone]').forEach((button) => {
      button.addEventListener('click', () => this.focusZone(button.dataset.mapZone));
    });
  }

  bindNavigation() {
    this.wrap?.querySelectorAll('[data-map-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.mapAction;
        if (action === 'zoom-in') this.zoomBy(1.22);
        if (action === 'zoom-out') this.zoomBy(1 / 1.22);
        if (action === 'reset') this.focusZone('ALL');
      });
    });

    this.svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
      this.zoomBy(factor, this.clientToSvg(event.clientX, event.clientY));
    }, { passive: false });

    this.svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.roof-table-anchor')) return;
      this.pan = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        view: { ...this.currentView }
      };
      this.svg.setPointerCapture(event.pointerId);
      this.svg.classList.add('is-panning');
    });

    this.svg.addEventListener('pointermove', (event) => {
      if (!this.pan || this.pan.pointerId !== event.pointerId) return;
      const rect = this.svg.getBoundingClientRect();
      const dx = ((event.clientX - this.pan.x) / rect.width) * this.pan.view.width;
      const dy = ((event.clientY - this.pan.y) / rect.height) * this.pan.view.height;
      this.applyViewBox({ ...this.pan.view, x: this.pan.view.x - dx, y: this.pan.view.y - dy }, true);
    });

    const finishPan = (event) => {
      if (!this.pan || this.pan.pointerId !== event.pointerId) return;
      this.pan = null;
      this.svg.classList.remove('is-panning');
      if (this.svg.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
    };
    this.svg.addEventListener('pointerup', finishPan);
    this.svg.addEventListener('pointercancel', finishPan);
  }

  clientToSvg(clientX, clientY) {
    const point = this.svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = this.svg.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : { x: 0, y: 0 };
  }

  applyViewBox(view, clampToMap = true) {
    const next = normalizeViewBox(view);
    if (clampToMap) {
      const base = this.defaultView;
      next.width = clamp(next.width, base.width / (this.config.limits?.maxZoom || 3.2), base.width);
      next.height = next.width * (base.height / base.width);
      next.x = clamp(next.x, base.x, base.x + base.width - next.width);
      next.y = clamp(next.y, base.y, base.y + base.height - next.height);
    }
    this.currentView = next;
    this.svg.setAttribute('viewBox', `${rounded(next.x)} ${rounded(next.y)} ${rounded(next.width)} ${rounded(next.height)}`);
  }

  animateViewBox(target) {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    const from = { ...this.currentView };
    const to = normalizeViewBox(target);
    const started = performance.now();
    const duration = 430;
    const tick = (now) => {
      const progress = clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.applyViewBox({
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased,
        width: from.width + (to.width - from.width) * eased,
        height: from.height + (to.height - from.height) * eased
      }, false);
      if (progress < 1) this.animationFrame = requestAnimationFrame(tick);
    };
    this.animationFrame = requestAnimationFrame(tick);
  }

  focusZone(zoneKey) {
    const zone = this.config.zones?.[zoneKey] || this.config.zones?.ALL;
    if (!zone) return;
    this.activeZone = zoneKey;
    this.zoneTabs?.querySelectorAll('[data-map-zone]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mapZone === zoneKey);
    });
    this.animateViewBox(zone.bounds);
  }

  zoomBy(factor, center = null) {
    const base = this.defaultView;
    const maxZoom = this.config.limits?.maxZoom || 3.2;
    const currentZoom = base.width / this.currentView.width;
    const newZoom = clamp(currentZoom * factor, 1, maxZoom);
    const width = base.width / newZoom;
    const height = base.height / newZoom;
    const focus = center || {
      x: this.currentView.x + this.currentView.width / 2,
      y: this.currentView.y + this.currentView.height / 2
    };
    const rx = (focus.x - this.currentView.x) / this.currentView.width;
    const ry = (focus.y - this.currentView.y) / this.currentView.height;
    this.applyViewBox({ x: focus.x - width * rx, y: focus.y - height * ry, width, height }, true);
  }

  setTables(tables, { selectedTableIds = [], mode = 'exact' } = {}) {
    this.tables = (tables || []).filter((table) => !this.config.ignoredTableCodes?.includes(table.code));
    this.selectedIds = [...selectedTableIds];
    this.mode = mode;
    this.render();
  }

  setSelected(tableIds = []) {
    this.selectedIds = [...tableIds];
    this.render();
  }

  updateTableGeometry(tableId, geometry) {
    const table = this.tables.find((item) => item.id === tableId);
    if (!table) return;
    Object.assign(table, geometry);
    const node = this.tableNodes.get(tableId);
    if (node) node.setAttribute('transform', `translate(${rounded(table.x)} ${rounded(table.y)})`);
    this.drawComboConnector();
  }

  render() {
    this.tableLayer.innerHTML = '';
    this.comboLayer.innerHTML = '';
    this.tableNodes.clear();

    this.tables.forEach((table, index) => {
      const visual = this.config.tableVisuals?.[table.code] || {};
      const stateClass = tableStateClass(table, this.selectedIds, this.editable);
      const anchor = svgEl('g', {
        class: `roof-table-anchor ${stateClass}`,
        transform: `translate(${rounded(table.x)} ${rounded(table.y)})`,
        'data-table-id': table.id,
        'data-table-code': table.code,
        tabindex: 0,
        role: 'button',
        'aria-label': `میز ${table.displayNumber}، ظرفیت ${table.capacity} نفر`
      });
      anchor.style.setProperty('--table-delay', `${Math.min(index * 18, 420)}ms`);
      // lift فقط جابه‌جایی/سایه/هاوره - عمداً چرخش نداره، وگرنه سایه و جهت
      // بالا-رفتن هاور هم با میز می‌چرخید.
      const lift = svgEl('g', { class: 'roof-table-lift' });
      // spin فقط چرخش داره؛ فقط شکل میز و صندلی‌ها اینجان تا واقعاً بچرخن.
      const spin = svgEl('g', { class: 'roof-table-spin', transform: `rotate(${rounded(table.rotation || 0)})` });

      if (Array.isArray(table.chairs) && table.chairs.length) {
        table.chairs.forEach((chair) => {
          if (chair.type === 'shared') spin.append(createSharedSeatMarker(chair));
          else spin.append(createChair({ x: chair.x, y: chair.y, rotation: chair.angle || 0 }, chair.scale || 1));
        });
      } else if (visual.seatLayout === 'lounge') {
        spin.append(createLounge(table));
      } else {
        chairPositions(table, visual).forEach((position) => spin.append(createChair(position, visual.chairScale || 1)));
      }
      spin.append(createTableBody(table, visual));
      lift.append(spin, createTableLabel(table));

      if (this.mode === 'range' && table.availability?.available && table.availability.startTime) {
        lift.append(createTimeBubble(`از ${table.availability.startTime}`, table));
      }

      anchor.append(lift);
      this.bindTableEvents(anchor, table);
      this.tableLayer.append(anchor);
      this.tableNodes.set(table.id, anchor);
    });

    this.drawComboConnector();
  }

  bindTableEvents(anchor, table) {
    let moved = false;
    anchor.addEventListener('click', (event) => {
      if (moved) {
        moved = false;
        return;
      }
      event.stopPropagation();
      this.onTableClick?.(table);
    });
    anchor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.onTableClick?.(table);
      }
    });

    if (!this.editable) return;
    anchor.classList.add('is-editable');
    anchor.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      moved = false;
      const start = this.clientToSvg(event.clientX, event.clientY);
      this.drag = {
        pointerId: event.pointerId,
        table,
        anchor,
        start,
        original: { x: Number(table.x), y: Number(table.y) }
      };
      anchor.setPointerCapture(event.pointerId);
      anchor.classList.add('is-dragging');
      this.onTableClick?.(table);
    });
    anchor.addEventListener('pointermove', (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const point = this.clientToSvg(event.clientX, event.clientY);
      const dx = point.x - this.drag.start.x;
      const dy = point.y - this.drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 1.5) moved = true;
      table.x = rounded(this.drag.original.x + dx);
      table.y = rounded(this.drag.original.y + dy);
      anchor.setAttribute('transform', `translate(${table.x} ${table.y}) rotate(${rounded(table.rotation || 0)})`);
      this.onTableMove?.(table, { live: true });
      this.drawComboConnector();
    });
    const finish = (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      anchor.classList.remove('is-dragging');
      if (anchor.hasPointerCapture(event.pointerId)) anchor.releasePointerCapture(event.pointerId);
      const changed = table.x !== this.drag.original.x || table.y !== this.drag.original.y;
      this.drag = null;
      if (changed) this.onTableMove?.(table, { live: false });
    };
    anchor.addEventListener('pointerup', finish);
    anchor.addEventListener('pointercancel', finish);
  }

  drawComboConnector() {
    this.comboLayer.innerHTML = '';
    if (this.selectedIds.length !== 2) return;
    const [a, b] = this.selectedIds.map((id) => this.tables.find((table) => table.id === id));
    if (!a || !b) return;
    const midX = (Number(a.x) + Number(b.x)) / 2;
    const midY = Math.min(Number(a.y), Number(b.y)) - 45;
    const path = svgEl('path', {
      class: 'combo-connector',
      d: `M${a.x} ${a.y}Q${midX} ${midY} ${b.x} ${b.y}`
    });
    const badge = svgEl('g', { class: 'combo-badge', transform: `translate(${midX} ${midY - 3})` });
    badge.append(
      svgEl('circle', { r: 16 }),
      svgEl('text', { x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle' })
    );
    badge.querySelector('text').textContent = '+';
    this.comboLayer.append(path, badge);
  }
}
