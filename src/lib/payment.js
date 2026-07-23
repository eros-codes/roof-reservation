import { config } from '../config.js';

const HOST = config.paymentMode === 'live' ? 'payment.zarinpal.com' : 'sandbox.zarinpal.com';
const REQUEST_URL = `https://${HOST}/pg/v4/payment/request.json`;
const VERIFY_URL = `https://${HOST}/pg/v4/payment/verify.json`;
const STARTPAY_URL = `https://${HOST}/pg/StartPay`;

/**
 * پرداخت رو نزد زرین‌پال شروع می‌کنه و آدرس درگاه رو برمی‌گردونه.
 * amount دقیقاً همون تومانیه که تو دیتابیس داریم؛ با currency:'IRT' صریح
 * می‌گیم واحدش تومانه، نیازی به ضربدر ۱۰ (تبدیل به ریال) نیست.
 */
export async function requestZarinpalPayment({ amount, description, callbackUrl, mobile }) {
  if (!config.zarinpalMerchantId) throw new Error('ZARINPAL_MERCHANT_ID تنظیم نشده است.');
  const response = await fetch(REQUEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      merchant_id: config.zarinpalMerchantId,
      amount,
      currency: 'IRT',
      description,
      callback_url: callbackUrl,
      metadata: mobile ? { mobile } : undefined
    })
  });
  const data = await response.json();
  if (data?.data?.code !== 100 || !data.data.authority) {
    const message = data?.errors?.message || 'اتصال به درگاه پرداخت زرین‌پال ناموفق بود.';
    throw new Error(message);
  }
  return { authority: data.data.authority, paymentUrl: `${STARTPAY_URL}/${data.data.authority}`, raw: data };
}

/**
 * بعد از برگشت از درگاه، پرداخت رو نزد زرین‌پال verify می‌کنه.
 * code=100 یعنی همین الان تایید شد؛ code=101 یعنی قبلاً تایید شده بود
 * (idempotency - اگه callback دوبار بیاد، بار دوم فقط همینو می‌گیریم،
 * دوباره confirmed نمی‌کنیم رزرو رو).
 */
export async function verifyZarinpalPayment({ amount, authority }) {
  const response = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ merchant_id: config.zarinpalMerchantId, amount, currency: 'IRT', authority })
  });
  const data = await response.json();
  const code = data?.data?.code;
  return {
    ok: code === 100 || code === 101,
    alreadyVerified: code === 101,
    refId: data?.data?.ref_id ? String(data.data.ref_id) : null,
    code,
    raw: data
  };
}
