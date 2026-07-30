import { config } from '../config.js';

const HOST = config.paymentMode === 'live' ? 'payment.zarinpal.com' : 'sandbox.zarinpal.com';
const REQUEST_URL = `https://${HOST}/pg/v4/payment/request.json`;
const VERIFY_URL = `https://${HOST}/pg/v4/payment/verify.json`;
const STARTPAY_URL = `https://${HOST}/pg/StartPay`;

async function fetchZarinpal(url, body) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10000);
	let response;
	let text;
	// مرحله‌ی شبکه: فقط خطاهای اتصال/timeout اینجا مدیریت می‌شن
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		text = await response.text();
	} catch (error) {
		if (error.name === 'AbortError') throw new Error('درگاه پرداخت زرین‌پال به‌موقع پاسخ نداد.');
		throw new Error('اتصال به درگاه پرداخت زرین‌پال برقرار نشد.');
	} finally {
		clearTimeout(timeout);
	}
	// مرحله‌ی پارس: جدا نگه داشته می‌شه تا پیامش توسط catch بالا بلعیده نشه
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`پاسخ نامعتبر از درگاه پرداخت (کد ${response.status}).`);
	}
}

export async function requestZarinpalPayment({ amount, description, callbackUrl, mobile }) {
	if (!config.zarinpalMerchantId) throw new Error('ZARINPAL_MERCHANT_ID تنظیم نشده است.');
	const data = await fetchZarinpal(REQUEST_URL, {
		merchant_id: config.zarinpalMerchantId,
		amount,
		currency: 'IRT',
		description,
		callback_url: callbackUrl,
		metadata: mobile ? { mobile } : undefined,
	});
	if (data?.data?.code !== 100 || !data.data.authority) {
		throw new Error(data?.errors?.message || 'اتصال به درگاه پرداخت زرین‌پال ناموفق بود.');
	}
	return {
		authority: data.data.authority,
		paymentUrl: `${STARTPAY_URL}/${data.data.authority}`,
		raw: data,
	};
}

/**
 * بعد از برگشت از درگاه، پرداخت رو نزد زرین‌پال verify می‌کنه.
 * code=100 یعنی همین الان تایید شد؛ code=101 یعنی قبلاً تایید شده بود
 * (idempotency - اگه callback دوبار بیاد، بار دوم فقط همینو می‌گیریم،
 * دوباره confirmed نمی‌کنیم رزرو رو).
 */
export async function verifyZarinpalPayment({ amount, authority }) {
	if (!config.zarinpalMerchantId) throw new Error('ZARINPAL_MERCHANT_ID تنظیم نشده است.');
	const data = await fetchZarinpal(VERIFY_URL, {
		merchant_id: config.zarinpalMerchantId,
		amount,
		currency: 'IRT',
		authority,
	});
	const code = data?.data?.code;
	return {
		ok: code === 100 || code === 101,
		alreadyVerified: code === 101,
		refId: data?.data?.ref_id ? String(data.data.ref_id) : null,
		code,
		raw: data,
	};
}
