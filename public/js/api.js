export async function api(path, options = {}) {
	const res = await fetch(path, {
		credentials: 'include',
		...options,
		headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
		body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
	});
	const text = await res.text();
	let data = {};
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			if (res.ok) console.warn('پاسخ سرور JSON معتبر نبود');
		}
	}
	if (!res.ok) {
		const error = new Error(data.message || 'خطا در ارتباط با سرور');
		error.status = res.status;
		// نشست ادمین منقضی شده: در هر نقطه‌ای از پنل باید به صفحه‌ی ورود برگرده.
		// مسیر خودِ login استثناست، وگرنه رمز اشتباه باعث حلقه‌ی بی‌پایان ریدایرکت می‌شود.
		if (res.status === 401 && path.startsWith('/api/admin') && !path.endsWith('/login')) {
			location.href = '/admin-login.html';
		}
		throw error;
	}
	return data;
}

export function toman(amount) {
	const n = Number(amount);
	return (Number.isFinite(n) ? n : 0).toLocaleString('fa-IR') + ' تومان';
}

export function faDateTime(value) {
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_FA = {
	DRAFT: 'پیش‌نویس',
	HOLD: 'رزرو موقت',
	PAYMENT_PENDING: 'در انتظار پرداخت',
	PAYMENT_REVIEW: 'بررسی پرداخت',
	CONFIRMED: 'تایید شده',
	CHANGE_PENDING: 'در انتظار تغییر',
	CANCELLED: 'لغو شده',
	COMPLETED: 'انجام شده',
	NO_SHOW: 'عدم حضور',
	EXPIRED: 'منقضی شده',
};

export function statusFa(status) {
	return STATUS_FA[status] || status;
}
