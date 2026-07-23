import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.JWT_SECRET || !process.env.ADMIN_JWT_SECRET)) {
  throw new Error('JWT_SECRET و ADMIN_JWT_SECRET باید در production تنظیم شوند؛ اجرا با مقدار پیش‌فرض مجاز نیست.');
}
if (isProd && !process.env.ZARINPAL_MERCHANT_ID) {
  throw new Error('ZARINPAL_MERCHANT_ID باید در production تنظیم شود.');
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'dev-user-secret-change-me',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || 'dev-admin-secret-change-me',
  smsMode: process.env.SMS_MODE || 'console',
  paymentMode: process.env.PAYMENT_MODE === 'live' ? 'live' : 'sandbox',
  zarinpalMerchantId: process.env.ZARINPAL_MERCHANT_ID || '',
  isProd
};
