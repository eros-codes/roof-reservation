export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'خطا در ارتباط با سرور');
  return data;
}

export function toman(amount) {
  return Number(amount || 0).toLocaleString('fa-IR') + ' تومان';
}

export function faDateTime(value) {
  return new Date(value).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function statusFa(status) {
  return {
    DRAFT: 'پیش‌نویس', HOLD: 'رزرو موقت', PAYMENT_PENDING: 'در انتظار پرداخت', PAYMENT_REVIEW: 'بررسی پرداخت',
    CONFIRMED: 'تایید شده', CHANGE_PENDING: 'در انتظار تغییر', CANCELLED: 'لغو شده', COMPLETED: 'انجام شده',
    NO_SHOW: 'عدم حضور', EXPIRED: 'منقضی شده'
  }[status] || status;
}
