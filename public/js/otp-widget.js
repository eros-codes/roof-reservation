import { api } from './api.js';
import { escapeHtml } from './ui.js';

// بیرون از تابع تا با mount دوباره‌ی ویجت، تایمر قبلی هم واقعاً لغو بشه
let cooldownTimer = null;

export function mountOtpWidget(container, { purpose, extraFields = [], submitLabel = 'تایید', onVerified }) {
	clearInterval(cooldownTimer);
	container.innerHTML = `
    <div class="form-grid otp-widget">
      ${extraFields.map((f) => `<div class="field"><label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label><input data-otp-extra="${escapeHtml(f.key)}" placeholder="${escapeHtml(f.placeholder || '')}"></div>`).join('')}
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
	const SEND_LABEL = 'ارسال کد تایید';
	const COOLDOWN_SECONDS = 60;
	// زمان پایان شمارش در مرورگر ذخیره می‌شه تا با رفرش صفحه از بین نره
	const cooldownStorageKey = () => `otpCooldown:${purpose}:${q('[data-otp-phone]').value.trim()}`;

	function runCooldown(btn, endsAt) {
		clearInterval(cooldownTimer);
		const tick = () => {
			const remaining = Math.ceil((endsAt - Date.now()) / 1000);
			if (remaining <= 0) {
				clearInterval(cooldownTimer);
				cooldownTimer = null;
				btn.disabled = false;
				btn.textContent = SEND_LABEL;
				try {
					localStorage.removeItem(cooldownStorageKey());
				} catch (_) {}
				return;
			}
			btn.disabled = true;
			btn.textContent = `ارسال مجدد (${remaining.toLocaleString('fa-IR')})`;
		};
		tick();
		cooldownTimer = setInterval(tick, 1000);
	}

	function startResendCooldown(btn) {
		const endsAt = Date.now() + COOLDOWN_SECONDS * 1000;
		try {
			localStorage.setItem(cooldownStorageKey(), String(endsAt));
		} catch (_) {}
		runCooldown(btn, endsAt);
	}

	// اگر کاربر وسط شمارش صفحه را رفرش کرده باشد، شمارش از همان‌جا ادامه پیدا می‌کند
	function restoreCooldown() {
		const btn = q('[data-otp-send]');
		let stored = null;
		try {
			stored = localStorage.getItem(cooldownStorageKey());
		} catch (_) {}
		if (stored && Number(stored) > Date.now()) {
			runCooldown(btn, Number(stored));
			return;
		}
		// شماره‌ی جدید شمارش قبلی را به ارث نمی‌برد؛ وگرنه دکمه بی‌دلیل قفل می‌ماند
		clearInterval(cooldownTimer);
		cooldownTimer = null;
		btn.disabled = false;
		btn.textContent = SEND_LABEL;
	}

	q('[data-otp-send]').addEventListener('click', async () => {
		const phone = q('[data-otp-phone]').value.trim();
		if (!phone) {
			showNotice('شماره موبایل رو وارد کن.', 'danger');
			return;
		}
		const missingField = extraFields.find((f) => f.required && !q(`[data-otp-extra="${f.key}"]`).value.trim());
		if (missingField) {
			showNotice(`${missingField.label} رو وارد کن.`, 'danger');
			return;
		}
		const btn = q('[data-otp-send]');
		btn.disabled = true;
		try {
			await api('/api/otp/send', { method: 'POST', body: { phone, purpose } });
			showNotice('کد ارسال شد', 'ok');
			q('[data-otp-code-field]').hidden = false;
			q('[data-otp-verify]').hidden = false;
			q('[data-otp-code]').focus();
			// وضعیت disabled را خودِ شمارش معکوس مدیریت می‌کند، نه finally —
			// وگرنه دکمه قبل از اولین تیک تایمر دوباره فعال می‌شود
			startResendCooldown(btn);
		} catch (error) {
			showNotice(error.message, 'danger');
			btn.disabled = false;
		}
	});

	q('[data-otp-verify]').addEventListener('click', async () => {
		const phone = q('[data-otp-phone]').value.trim();
		const code = q('[data-otp-code]').value.trim();
		if (!code) {
			showNotice('کد تایید رو وارد کن.', 'danger');
			return;
		}
		const btn = q('[data-otp-verify]');
		btn.disabled = true;
		try {
			// فیلدهای اضافی اول قرار می‌گیرند تا نتوانند phone/code/purpose را بازنویسی کنند
			const data = await api('/api/otp/verify', { method: 'POST', body: { ...extraPayload(), phone, code, purpose } });
			showNotice('تایید شد.', 'ok');
			onVerified?.(data);
		} catch (error) {
			showNotice(error.message, 'danger');
		} finally {
			btn.disabled = false;
		}
	});

	// شماره ممکنه از قبل پر شده باشه؛ با هر تغییرش وضعیت شمارش دوباره بررسی می‌شه
	q('[data-otp-phone]').addEventListener('input', restoreCooldown);

	// Enter در فیلد کد یعنی تایید، و در فیلد شماره یعنی ارسال کد
	q('[data-otp-code]').addEventListener('keydown', (event) => {
		if (event.key === 'Enter') q('[data-otp-verify]').click();
	});
	q('[data-otp-phone]').addEventListener('keydown', (event) => {
		if (event.key === 'Enter') q('[data-otp-send]').click();
	});

	restoreCooldown();
}
