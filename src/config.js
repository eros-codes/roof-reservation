import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.JWT_SECRET || !process.env.ADMIN_JWT_SECRET)) {
	throw new Error('JWT_SECRET و ADMIN_JWT_SECRET باید در production تنظیم شوند؛ اجرا با مقدار پیش‌فرض مجاز نیست.');
}
if (isProd && !process.env.ZARINPAL_MERCHANT_ID) {
	throw new Error('ZARINPAL_MERCHANT_ID باید در production تنظیم شود.');
}
if (isProd && process.env.PAYMENT_MODE !== 'live') {
	throw new Error('در production باید PAYMENT_MODE="live" تنظیم شود؛ وگرنه پرداخت‌ها به درگاه آزمایشی می‌روند و پولی دریافت نمی‌شود.');
}
if (isProd && process.env.SMS_MODE === 'console') {
	throw new Error('در production نباید SMS_MODE="console" باشد؛ در این حالت هیچ پیامکی ارسال نمی‌شود.');
}
if (isProd && !process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL باید در production تنظیم شود.');
}
// حتی خارج از production هم اگه از کلید پیش‌فرض استفاده می‌شه، باید واضح دیده بشه
if (!process.env.JWT_SECRET || !process.env.ADMIN_JWT_SECRET) {
	console.warn('⚠️  هشدار: کلیدهای JWT پیش‌فرض در حال استفاده‌اند. این حالت فقط برای توسعه‌ی محلی امنه.');
}
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
	console.warn('⚠️  هشدار: JWT_SECRET کوتاه‌تر از ۳۲ کاراکتره و به‌راحتی قابل حدس زدنه.');
}

export const config = {
		port: Number.isInteger(Number(process.env.PORT)) && Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000,
	nodeEnv: process.env.NODE_ENV || 'development',
	appUrl: process.env.APP_URL || 'http://localhost:3000',
	jwtSecret: process.env.JWT_SECRET || 'dev-user-secret-change-me',
	adminJwtSecret: process.env.ADMIN_JWT_SECRET || 'dev-admin-secret-change-me',
	smsMode: process.env.SMS_MODE || 'console',
	paymentMode: process.env.PAYMENT_MODE === 'live' ? 'live' : 'sandbox',
	zarinpalMerchantId: process.env.ZARINPAL_MERCHANT_ID || '',
	isProd,
};
