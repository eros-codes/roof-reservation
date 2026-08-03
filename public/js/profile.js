import { api, faDateTime, statusFa, toman } from './api.js';
import { ICONS, initHeaderScroll, escapeHtml, tablesText } from './ui.js';

import { mountOtpWidget } from './otp-widget.js';

initHeaderScroll();

const q = (id) => document.getElementById(id);

function dateBlock(iso) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return `<div class="timeline-date"><strong>—</strong><span>—</span></div>`;
	return `<div class="timeline-date"><strong>${d.toLocaleDateString('fa-IR', { day: 'numeric' })}</strong><span>${d.toLocaleDateString('fa-IR', { month: 'short' })}</span></div>`;
}

function renderReservations(reservations) {
	const box = q('reservationsBox');
	box.className = '';
	box.style.height = '';
	if (!reservations.length) {
		box.innerHTML = `<div class="empty-state">${ICONS.empty}<strong>هنوز رزروی ثبت نشده</strong><p>از صفحه اصلی یک تاریخ انتخاب کن تا اولین رزروت اینجا بیفته.</p></div>`;
		return;
	}
	box.innerHTML = `<div class="timeline">${reservations
		.map(
			(r) => `
    <div class="timeline-item">
      ${dateBlock(r.startAt)}
      <div class="timeline-body">
        <strong>میز ${escapeHtml(tablesText(r))} · ${Number(r.guestCount || 0).toLocaleString('fa-IR')} نفر</strong>
        <span>${faDateTime(r.startAt)} · ${toman(r.totalAmount)}</span>
      </div>
      <div class="timeline-actions">
        <span class="status ${escapeHtml(r.status)}">${escapeHtml(statusFa(r.status))}</span>
        <a class="secondary-btn" href="/invoice.html?id=${encodeURIComponent(r.id)}">فاکتور</a>
      </div>
    </div>`,
		)
		.join('')}</div>`;
}

function showHub(user) {
	q('loginGate').hidden = true;
	q('loginGateForm').hidden = true;
	q('accountHub').hidden = false;
	q('logoutBtn').hidden = false;
	q('hubGreeting').textContent = user.name ? `سلام ${user.name}` : 'حساب من';
	q('accountName').value = user.name || '';
	q('accountPhone').value = user.phone || '';
}

function mountAuthWidget(mode) {
	document.querySelectorAll('[data-auth-mode]').forEach((btn) => btn.classList.toggle('active', btn.dataset.authMode === mode));
	if (mode === 'signup') {
		q('authEyebrow').textContent = 'ثبت‌نام';
		q('authTitle').textContent = 'ساخت حساب';
		q('authLede').textContent = 'اسم و شماره موبایلت رو وارد کن تا حسابت ساخته بشه.';
		mountOtpWidget(q('loginGateForm'), {
			purpose: 'LOGIN',
			extraFields: [{ key: 'name', label: 'نام (اگر حساب نداری لازم است)', required: false }],
			submitLabel: 'ثبت‌نام',
			onVerified: async () => {
				await load();
			},
		});
	} else {
		q('authEyebrow').textContent = 'ورود با کد یک‌بارمصرف';
		q('authTitle').textContent = 'حساب من';
		q('authLede').textContent = 'با شماره موبایلت وارد شو تا رزروهات و اطلاعات حسابت رو اینجا ببینی.';
		mountOtpWidget(q('loginGateForm'), {
			purpose: 'LOGIN',
			extraFields: [{ key: 'name', label: 'نام (اگر حساب نداری لازم است)', required: false }],
			submitLabel: 'ورود',
			onVerified: async () => {
				await load();
			},
		});
	}
}

function showLoginGate() {
	q('loginGate').hidden = false;
	q('loginGateForm').hidden = false;
	q('accountHub').hidden = true;
	q('logoutBtn').hidden = true;
	mountAuthWidget('login');
}

document.querySelectorAll('[data-auth-mode]').forEach((btn) => {
	btn.addEventListener('click', () => mountAuthWidget(btn.dataset.authMode));
});

q('hubTabs').addEventListener('click', (event) => {
	const btn = event.target.closest('[data-tab]');
	if (!btn) return;
	document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
	document.querySelectorAll('[data-tab-panel]').forEach((p) => p.classList.toggle('active', p.dataset.tabPanel === btn.dataset.tab));
});

q('logoutBtn').addEventListener('click', async () => {
	try {
		await api('/api/logout', { method: 'POST' });
	} catch (error) {
		console.warn('خروج با خطا مواجه شد:', error);
	}
	await load();
});

q('saveAccountBtn').addEventListener('click', async () => {
	const notice = q('accountNotice');
	try {
		const { user } = await api('/api/me', { method: 'PATCH', body: { name: q('accountName').value.trim() } });
		notice.className = 'notice ok';
		notice.textContent = 'ذخیره شد.';
		q('hubGreeting').textContent = user.name ? `سلام ${user.name}` : 'حساب من';
	} catch (error) {
		notice.className = 'notice danger';
		notice.textContent = error.message;
	}
});

async function load() {
	let user;
	try {
		({ user } = await api('/api/me'));
	} catch (error) {
		showLoginGate();
		const notice = q('loginGateForm').querySelector('[data-otp-notice]');
		if (notice) {
			notice.className = 'notice danger';
			notice.textContent = error.message;
		}
		return;
	}

	if (!user) {
		showLoginGate();
		return;
	}
	showHub(user);

	try {
		const { reservations } = await api('/api/reservations/profile/list');
		renderReservations(reservations || []);
	} catch (error) {
		const box = q('reservationsBox');
		box.className = '';
		box.style.height = '';
		box.innerHTML = '<div class="notice danger"></div>';
		box.querySelector('.notice').textContent = error.message;
	}
}

load();
