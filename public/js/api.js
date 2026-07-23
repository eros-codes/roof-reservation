export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const data = await res.json().catch((err) => {
    console.warn('پاسخ سرور JSON معتبر نبود:', err);
    return {};
  });
  if (!res.ok) throw new Error(data.message || 'خطا در ارتباط با سرور');
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
  DRAFT: 'پیش‌نویس', HOLD: 'رزرو موقت', PAYMENT_PENDING: 'در انتظار پرداخت', PAYMENT_REVIEW: 'بررسی پرداخت',
  CONFIRMED: 'تایید شده', CHANGE_PENDING: 'در انتظار تغییر', CANCELLED: 'لغو شده', COMPLETED: 'انجام شده',
  NO_SHOW: 'عدم حضور', EXPIRED: 'منقضی شده'
};

export function statusFa(status) {
  return STATUS_FA[status] || status;
}
