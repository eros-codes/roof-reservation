import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'dev-user-secret-change-me',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || 'dev-admin-secret-change-me',
  smsMode: process.env.SMS_MODE || 'console',
  paymentMode: process.env.PAYMENT_MODE || 'mock',
  isProd: process.env.NODE_ENV === 'production'
};
