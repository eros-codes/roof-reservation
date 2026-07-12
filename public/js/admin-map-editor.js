import { api } from './api.js';
import { RoofMap } from './map-renderer.js';

const ZONE_FA = { WINDOW: 'سالن پنجره', CENTER: 'سالن وسط', ROOF: 'روف گاردن' };
const SHAPE_FA = { ROUND: 'گرد', SQUARE: 'مربع', RECTANGLE: 'مستطیل' };

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function numberValue(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

export async function mountAdminMapEditor({ container, tables = [], connections = [], canEdit = true, onReload }) {
  if (!container) throw new Error('محل ویرایشگر نقشه پیدا نشد.');

  container.innerHTML = `
    <div class="admin-map-grid">
      <section class="admin-map-canvas">
        <div class="map-zone-tabs" data-editor-zone-tabs></div>
        <div class="map-wrap admin-map-wrap" data-editor-map-wrap>
          <svg data-editor-map viewBox="0 0 1800 900" role="img" aria-label="ویرایش نقشه میزهای کافه"></svg>
          <div class="map-loading" data-editor-loading><span></span><b>در حال آماده‌سازی ویرایشگر...</b></div>
          <div class="map-controls">
            <button type="button" data-map-action="zoom-in" aria-label="بزرگ‌نمایی">+</button>
            <button type="button" data-map-action="zoom-out" aria-label="کوچک‌نمایی">−</button>
            <button type="button" data-map-action="reset" aria-label="نمایش کامل نقشه">⌂</button>
          </div>
        </div>
        <p class="editor-help">${canEdit ? 'برای جابه‌جایی، میز رو بگیر و روی نقشه بکش. تغییرات تا زمان زدن دکمه ذخیره وارد دیتابیس نمی‌شن.' : 'نقشه فقط در حالت مشاهده است؛ نقش پذیرش اجازه تغییر میزها رو نداره.'}</p>
      </section>

      <aside class="table-editor-panel" data-editor-panel>
        <div class="table-editor-empty" data-editor-empty>
          <strong>یک میز انتخاب کن</strong>
          <p>روی میز داخل نقشه یا دکمه «ویرایش» در فهرست پایین کلیک کن.</p>
        </div>
        <form class="form-grid" data-editor-form hidden>
          <div class="table-editor-title">
            <span data-table-code></span>
            <strong data-table-title></strong>
          </div>
          <div class="row">
            <div class="field"><label>شماره نمایشی</label><input data-field="displayNumber"></div>
            <div class="field"><label>فعال</label><select data-field="isActive"><option value="true">فعال</option><option value="false">غیرفعال</option></select></div>
          </div>
          <div class="row">
            <div class="field"><label>سالن</label><select data-field="zone"><option value="WINDOW">سالن پنجره</option><option value="CENTER">سالن وسط</option><option value="ROOF">روف گاردن</option></select></div>
            <div class="field"><label>شکل میز</label><select data-field="shape"><option value="ROUND">گرد</option><option value="SQUARE">مربع</option><option value="RECTANGLE">مستطیل</option></select></div>
          </div>
          <div class="row three-col">
            <div class="field"><label>ظرفیت</label><input data-field="capacity" type="number" min="1" max="20"></div>
            <div class="field"><label>حداقل نفر</label><input data-field="minGuests" type="number" min="1" max="20"></div>
            <div class="field"><label>حداکثر نفر</label><input data-field="maxGuests" type="number" min="1" max="20"></div>
          </div>
          <div class="row three-col">
            <div class="field"><label>X</label><input data-field="x" type="number" step="0.1"></div>
            <div class="field"><label>Y</label><input data-field="y" type="number" step="0.1"></div>
            <div class="field"><label>چرخش</label><input data-field="rotation" type="number" step="1"></div>
          </div>
          <div class="row">
            <div class="field"><label>عرض</label><input data-field="width" type="number" min="30" max="220" step="1"></div>
            <div class="field"><label>ارتفاع</label><input data-field="height" type="number" min="30" max="220" step="1"></div>
          </div>
          <div class="field"><label>توضیح</label><textarea data-field="description" rows="3"></textarea></div>
          <div class="editor-actions">
            <button type="button" class="secondary-btn" data-reset-geometry>بازنشانی جای میز</button>
            <button type="submit" class="primary-btn" data-save-table>ذخیره میز</button>
          </div>
          <div data-editor-notice></div>
          <section class="connection-editor">
            <h5>میزهای قابل اتصال</h5>
            <div data-connection-list class="connection-list"></div>
            <div class="connection-add">
              <select data-connection-select></select>
              <button type="button" class="secondary-btn" data-add-connection>افزودن اتصال</button>
            </div>
          </section>
        </form>
      </aside>
    </div>
  `;

  const query = (selector) => container.querySelector(selector);
  const form = query('[data-editor-form]');
  const empty = query('[data-editor-empty]');
  const notice = query('[data-editor-notice]');
  let selectedId = null;
  let currentTables = [...tables];
  let currentConnections = [...connections];

  const map = new RoofMap({
    svg: query('[data-editor-map]'),
    wrap: query('[data-editor-map-wrap]'),
    zoneTabs: query('[data-editor-zone-tabs]'),
    editable: canEdit,
    onTableClick: (table) => selectTable(table.id),
    onTableMove: (table) => {
      if (table.id !== selectedId) return;
      query('[data-field="x"]').value = table.x;
      query('[data-field="y"]').value = table.y;
      markDirty();
    }
  });

  await map.init();
  query('[data-editor-loading]').hidden = true;

  function showNotice(message, type = '') {
    notice.className = type ? `notice ${type}` : 'notice';
    notice.textContent = message;
  }

  function markDirty() {
    if (!canEdit) return;
    showNotice('تغییرات ذخیره‌نشده داری.', 'warn');
  }

  function selectedTable() {
    return currentTables.find((table) => table.id === selectedId) || null;
  }

  function field(name) {
    return query(`[data-field="${name}"]`);
  }

  function fillForm(table) {
    query('[data-table-code]').textContent = table.code;
    query('[data-table-title]').textContent = `میز ${table.displayNumber}`;
    ['displayNumber', 'zone', 'shape', 'capacity', 'minGuests', 'maxGuests', 'x', 'y', 'width', 'height', 'rotation', 'description'].forEach((name) => {
      field(name).value = table[name] ?? '';
    });
    field('isActive').value = String(Boolean(table.isActive));
    renderConnections();
    notice.className = '';
    notice.textContent = '';
  }

  function renderConnections() {
    const table = selectedTable();
    if (!table) return;
    const related = currentConnections.filter((connection) => connection.tableAId === table.id || connection.tableBId === table.id);
    const list = query('[data-connection-list]');
    list.innerHTML = related.length ? related.map((connection) => {
      const otherId = connection.tableAId === table.id ? connection.tableBId : connection.tableAId;
      const other = currentTables.find((item) => item.id === otherId);
      return `<span class="connection-chip">میز ${escapeHtml(other?.displayNumber || '?')}<button type="button" data-remove-connection="${connection.id}" ${canEdit ? '' : 'disabled'}>×</button></span>`;
    }).join('') : '<small>برای این میز اتصال تعریف نشده.</small>';

    list.querySelectorAll('[data-remove-connection]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!canEdit) return;
        await api(`/api/admin/table-connections/${button.dataset.removeConnection}`, { method: 'DELETE' });
        showNotice('اتصال حذف شد.', 'ok');
        await onReload?.({ keepSelectedId: selectedId });
      });
    });

    const connectedIds = new Set(related.flatMap((connection) => [connection.tableAId, connection.tableBId]));
    const options = currentTables.filter((item) => item.id !== table.id && !connectedIds.has(item.id));
    query('[data-connection-select]').innerHTML = options.length
      ? options.map((item) => `<option value="${item.id}">${item.code} · میز ${escapeHtml(item.displayNumber)} · ${ZONE_FA[item.zone] || item.zone}</option>`).join('')
      : '<option value="">میز دیگری باقی نمانده</option>';
  }

  function selectTable(tableId) {
    const table = currentTables.find((item) => item.id === tableId);
    if (!table) return;
    selectedId = tableId;
    empty.hidden = true;
    form.hidden = false;
    map.setSelected([tableId]);
    fillForm(table);
  }

  query('[data-add-connection]').addEventListener('click', async () => {
    if (!canEdit || !selectedId) return;
    const otherId = query('[data-connection-select]').value;
    if (!otherId) return;
    await api('/api/admin/table-connections', {
      method: 'POST',
      body: { tableAId: selectedId, tableBId: otherId }
    });
    showNotice('اتصال میزها ثبت شد.', 'ok');
    await onReload?.({ keepSelectedId: selectedId });
  });

  query('[data-reset-geometry]').addEventListener('click', () => {
    if (!canEdit || !selectedId) return;
    const table = selectedTable();
    const seed = map.config.seedGeometry?.[table.code];
    if (!seed) {
      showNotice('هندسه اولیه برای این میز پیدا نشد.', 'danger');
      return;
    }
    Object.entries(seed).forEach(([key, value]) => {
      table[key] = value;
      field(key).value = value;
    });
    map.updateTableGeometry(table.id, seed);
    markDirty();
  });

  form.addEventListener('input', (event) => {
    if (!canEdit || !selectedId) return;
    const name = event.target.dataset.field;
    if (!name) return;
    const table = selectedTable();
    if (['x', 'y', 'width', 'height', 'rotation'].includes(name)) {
      table[name] = numberValue(event.target, table[name]);
      map.render();
      map.setSelected([table.id]);
    }
    markDirty();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canEdit || !selectedId) return;
    const capacity = numberValue(field('capacity'), 1);
    const minGuests = numberValue(field('minGuests'), 1);
    const maxGuests = numberValue(field('maxGuests'), capacity);
    if (minGuests > maxGuests || maxGuests > capacity) {
      showNotice('باید حداقل نفر ≤ حداکثر نفر ≤ ظرفیت باشه.', 'danger');
      return;
    }

    const body = {
      displayNumber: field('displayNumber').value.trim(),
      isActive: field('isActive').value === 'true',
      zone: field('zone').value,
      shape: field('shape').value,
      capacity,
      minGuests,
      maxGuests,
      x: numberValue(field('x')),
      y: numberValue(field('y')),
      width: numberValue(field('width'), 60),
      height: numberValue(field('height'), 60),
      rotation: numberValue(field('rotation')),
      description: field('description').value.trim() || null
    };

    try {
      query('[data-save-table]').disabled = true;
      await api(`/api/admin/tables/${selectedId}`, { method: 'PATCH', body });
      showNotice('مشخصات میز ذخیره شد.', 'ok');
      await onReload?.({ keepSelectedId: selectedId });
    } catch (error) {
      showNotice(error.message, 'danger');
    } finally {
      query('[data-save-table]').disabled = false;
    }
  });

  if (!canEdit) {
    form.querySelectorAll('input, select, textarea, button').forEach((element) => { element.disabled = true; });
  }

  function update(nextTables, nextConnections, { keepSelectedId = selectedId } = {}) {
    currentTables = [...nextTables];
    currentConnections = [...nextConnections];
    map.setTables(currentTables, { selectedTableIds: keepSelectedId ? [keepSelectedId] : [] });
    if (keepSelectedId && currentTables.some((table) => table.id === keepSelectedId)) {
      selectTable(keepSelectedId);
    } else {
      selectedId = null;
      form.hidden = true;
      empty.hidden = false;
    }
  }

  update(currentTables, currentConnections);

  return {
    update,
    selectTable,
    focusZone: (zone) => map.focusZone(zone),
    getSelectedId: () => selectedId
  };
}
