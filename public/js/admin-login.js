import { api } from './api.js';

const form = document.getElementById('loginForm');
const btn = document.getElementById('login');
const notice = document.getElementById('notice');
const passwordInput = document.getElementById('password');
const emailInput = document.getElementById('email');
if (!form || !btn || !notice || !passwordInput || !emailInput) {
	console.error('ساختار صفحه‌ی ورود ادمین ناقصه؛ یکی از فیلدهای لازم پیدا نشد.');
}

if (form) {
	// با <form>، کلید Enter خودکار کار می‌کنه و دیگه نیازی به هندلر دستی نیست
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const email = emailInput.value.trim();
		const password = passwordInput.value;
		if (!email || !password) {
			notice.className = 'notice danger';
			notice.textContent = 'ایمیل و رمز عبور رو وارد کن.';
			return;
		}
		btn.disabled = true;
		try {
			await api('/api/admin/login', {
				method: 'POST',
				body: { email, password },
			});
			location.href = '/admin.html';
		} catch (error) {
			notice.className = 'notice danger';
			notice.textContent = error.message;
			btn.disabled = false;
		}
	});
}
