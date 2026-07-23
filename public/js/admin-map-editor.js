import { api } from './api.js';
import { RoofMap } from './map-renderer.js';
import { mountTableEditorDialog } from './table-editor-dialog.js';

/**
 * نقشه‌ی ادمین. دیگه فرم کناری برای ویرایش نداره — دابل‌کلیک روی میز دیالوگ
 * ویرایش (شامل حذف) رو باز می‌کنه، و درگ‌کردن میز همون لحظه‌ی رهاکردن
 * ذخیره می‌شه، بدون نیاز به تایید یا دکمه‌ی جدا.
 */
export async function mountAdminMapEditor({ container, tables = [], connections = [], canEdit = true, onReload }) {
  if (!container) throw new Error('محل ویرایشگر نقشه پیدا نشد.');

  container.innerHTML = `
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
      <p class="editor-help">${canEdit ? 'روی میز دابل‌کلیک کن تا ویرایش/حذفش کنی؛ برای جابه‌جایی بگیر و بکش — همون لحظه‌ی رهاکردن ذخیره می‌شه.' : 'نقشه فقط در حالت مشاهده است؛ نقش پذیرش اجازه تغییر میزها رو نداره.'}</p>
      <div data-editor-notice></div>
    </section>
  `;

  const query = (selector) => container.querySelector(selector);
  const notice = query('[data-editor-notice]');
  let currentTables = [...tables];
  let currentConnections = [...connections];

  function showNotice(message, type = '') {
    notice.className = type ? `notice ${type}` : 'notice';
    notice.textContent = message;
    if (type !== 'danger') setTimeout(() => { if (notice.textContent === message) { notice.className = ''; notice.textContent = ''; } }, 2200);
  }

  const dialog = mountTableEditorDialog({
    getAllTables: () => currentTables,
    getConnections: () => currentConnections,
    onSaved: () => onReload?.({ keepSelectedId: null }),
    onDeleted: () => onReload?.({ keepSelectedId: null })
  });

  const map = new RoofMap({
    svg: query('[data-editor-map]'),
    wrap: query('[data-editor-map-wrap]'),
    zoneTabs: query('[data-editor-zone-tabs]'),
    editable: canEdit,
    onTableClick: (table) => { if (canEdit) dialog.openEdit(table); },
    onTableMove: async (table, { live } = {}) => {
      if (live || !canEdit) return;
      try {
        await api(`/api/admin/tables/${table.id}`, { method: 'PATCH', body: { x: table.x, y: table.y } });
        showNotice('جای میز ذخیره شد.', 'ok');
      } catch (error) {
        showNotice(error.message, 'danger');
        await onReload?.({ keepSelectedId: null });
      }
    }
  });

  try {
    await map.init();
  } catch (error) {
    query('[data-editor-loading]').innerHTML = `<span></span><b>بارگذاری نقشه با خطا مواجه شد: ${error.message}</b>`;
    throw error;
  }
  query('[data-editor-loading]').hidden = true;

  function update(nextTables, nextConnections, options = {}) {
    currentTables = [...nextTables];
    currentConnections = [...nextConnections];
    map.setTables(currentTables, { selectedTableIds: options.keepSelectedId ? [options.keepSelectedId] : [] });
  }

  update(currentTables, currentConnections);

  return {
    update,
    selectTable: (tableId) => {
      const table = currentTables.find((item) => item.id === tableId);
      if (table && canEdit) dialog.openEdit(table);
    },
    openCreateDialog: (zone) => canEdit && dialog.openCreate(zone),
    focusZone: (zone) => map.focusZone(zone)
  };
}
