process.env.TZ = 'Asia/Tehran';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { authRouter } from './routes/auth.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { reservationRouter } from './routes/reservation.routes.js';
import { paymentRouter } from './routes/payment.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { expireOldHolds } from './services/availability.service.js';
import rateLimit from 'express-rate-limit';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
// پشت nginx/Cloudflare بدون این خط، req.ip برای همه یکسان می‌شه
if (config.isProd) app.set('trust proxy', 1);

app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				// اسکریپت‌ها فقط از خود سایت؛ همین جلوی اجرای کد تزریق‌شده رو می‌گیره
				scriptSrc: ["'self'"],
				// 'unsafe-inline' فقط برای style لازمه چون کد از style="..." درون‌خطی استفاده می‌کنه
				styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
				fontSrc: ["'self'", 'data:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
				imgSrc: ["'self'", 'data:'],
				connectSrc: ["'self'"],
				objectSrc: ["'none'"],
				frameAncestors: ["'none'"],
			},
		},
	}),
);
app.use(morgan(config.isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(
	'/api',
	rateLimit({
		windowMs: 60 * 1000,
		max: 120,
		standardHeaders: true,
		legacyHeaders: false,
		message: { message: 'تعداد درخواست‌ها زیاد بود؛ کمی بعد دوباره تلاش کن.' },
	}),
);
app.use(
	express.static(path.join(__dirname, '..', 'public'), {
		maxAge: config.isProd ? '1d' : 0,
		setHeaders: (res, filePath) => {
			// فایل‌های HTML نباید کش بشن، وگرنه بعد از دیپلوی نسخه‌ی قدیمی نشون داده می‌شه
			if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
		},
	}),
);
app.get('/health', (_req, res) => res.json({ ok: true, service: 'roof-reservation' }));
app.use('/api', authRouter);
app.use('/api', publicRouter);
app.use('/api/reservations', reservationRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/admin', adminRouter);
app.use((req, res) => {
	if (req.path.startsWith('/api')) return res.status(404).json({ message: 'مسیر API پیدا نشد.' });
	res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use((error, _req, res, _next) => {
	console.error(error);
	const status = error.status || 500;
	const safeMessage =
		status < 500 ? error.message || 'خطای داخلی سرور' : config.isProd ? 'خطای داخلی سرور؛ کمی بعد دوباره تلاش کن.' : error.message;
	res.status(status).json({ message: safeMessage });
});

const holdCleanup = setInterval(() => {
	expireOldHolds().catch((error) => console.error('پاک‌سازی نگه‌داری‌های منقضی ناموفق بود:', error));
}, 60 * 1000);
holdCleanup.unref();

const server = app.listen(config.port, () => {
	console.log(`Roof Reservation running on ${config.appUrl}`);
	console.log(`NODE_ENV=${config.nodeEnv} → کوکی‌ها secure=${config.isProd} (روی http فقط با secure=false کار می‌کنن)`);
});

let shuttingDown = false;

async function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	clearInterval(holdCleanup);
	console.log(`${signal} دریافت شد؛ در حال بستن امنِ سرور...`);
	server.close(async () => {
		await prisma.$disconnect();
		process.exit(0);
	});
	// اگه تا ۱۰ ثانیه درخواست‌ها تموم نشدن، به‌زور ببند
	setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
