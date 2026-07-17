import { api } from './api.js';

/**
 * یه فرم OTP قابل‌استفاده هم برای ورود کاربر (purpose=LOGIN) هم دسترسی مهمان
 * (purpose=GUEST_ACCESS). به‌جای اینکه هر صفحه پیاده‌سازی جدا داشته باشه،
 * همه از همینجا استفاده می‌کنن.
 *
 * extraFields: فیلدهای اضافه قبل از شماره موبایل (مثلاً کد پیگیری برای مهمان)
 * onVerified(data): بعد از تایید موفق صدا زده می‌شه؛ data همون پاسخ /api/otp/verify‌ه
 */
export function mountOtpWidget(container, { purpose, extraFields = [], submitLabel = 'تایید', onVerified }) {
  container.innerHTML = `
    <div class="form-grid otp-widget">
      ${extraFields.map((f) => `<div class="field"><label>${f.label}</label><input data-otp-extra="${f.key}" placeholder="${f.placeholder || ''}"></div>`).join('')}
      <div class="field"><label>شماره موبایل</label><input data-otp-phone placeholder="09..." inputmode="tel"></div>
      <button type="button" class="secondary-btn" data-otp-send>ارسال کد تایید</button>
      <div class="field" data-otp-code-field hidden><label>کد تایید</label><input data-otp-code inputmode="numeric" maxlength="6"></div>
      <button type="button" class="primary-btn" data-otp-verify hidden>${submitLabel}</button>
      <div data-otp-notice></div>
    </div>
  `;

  const q = (selector) => container.querySelector(selector);
  const notice = q('[data-otp-notice]');

  function showNotice(message, type = '') {
    notice.className = type ? `notice ${type}` : '';
    notice.textContent = message;
  }

  function extraPayload() {
    return Object.fromEntries(extraFields.map((f) => [f.key, q(`[data-otp-extra="${f.key}"]`).value.trim()]));
  }

  q('[data-otp-send]').addEventListener('click', async () => {
    const phone = q('[data-otp-phone]').value.trim();
    if (!phone) { showNotice('شماره موبایل رو وارد کن.', 'danger'); return; }
    const btn = q('[data-otp-send]');
    btn.disabled = true;
    try {
      const data = await api('/api/otp/send', { method: 'POST', body: { phone, purpose } });
      showNotice(`کد ارسال شد${data.devCode ? ` — کد آزمایشی: ${data.devCode}` : ''}`, 'ok');
      q('[data-otp-code-field]').hidden = false;
      q('[data-otp-verify]').hidden = false;
      q('[data-otp-code]').focus();
    } catch (error) {
      showNotice(error.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  });

  q('[data-otp-verify]').addEventListener('click', async () => {
    const phone = q('[data-otp-phone]').value.trim();
    const code = q('[data-otp-code]').value.trim();
    if (!code) { showNotice('کد تایید رو وارد کن.', 'danger'); return; }
    const btn = q('[data-otp-verify]');
    btn.disabled = true;
    try {
      const data = await api('/api/otp/verify', { method: 'POST', body: { phone, code, purpose, ...extraPayload() } });
      showNotice('تایید شد.', 'ok');
      onVerified?.(data);
    } catch (error) {
      showNotice(error.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  });
}
