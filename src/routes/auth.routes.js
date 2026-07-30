import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { clearCookie, setCookie, signAdminToken, signGuestToken, signUserToken, verifyUserToken } from '../lib/auth.js';
import { normalizePhone } from '../lib/time.js';
import { otpMessage, sendMockSms } from '../lib/sms.js';
import { config } from '../config.js';
import { randomInt } from 'crypto';
import { optionalUser, requireUser } from '../middleware/auth.js';

export const authRouter = express.Router();

function makeOtpCode() {
	return String(randomInt(100000, 1000000));
}

// برای ارسال، کلید فقط شماره است؛ وگرنه با تعویض IP می‌شود یک شماره را بمباران کرد
const otpSendKey = (req) => normalizePhone(req.body?.phone) || req.ip;
const otpKey = (req) => `${req.ip}:${normalizePhone(req.body?.phone)}`;
const otpSendLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	max: 5,
	keyGenerator: otpSendKey,
	message: {
		message: 'تعداد درخواست بیش از حد مجاز است؛ کمی بعد دوباره تلاش کن.',
	},
});
const otpVerifyLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	max: 10,
	keyGenerator: otpKey,
	message: {
		message: 'تعداد تلاش بیش از حد مجاز است؛ کمی بعد دوباره تلاش کن.',
	},
});
const adminLoginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 8,
	message: {
		message: 'تعداد تلاش بیش از حد مجاز است؛ کمی بعد دوباره تلاش کن.',
	},
});

authRouter.post('/otp/send', otpSendLimiter, async (req, res, next) => {
	try {
		const phone = normalizePhone(req.body.phone);
		const purpose = req.body.purpose || 'LOGIN';
		if (!phone) return res.status(400).json({ message: 'شماره موبایل نامعتبر است.' });
		const code = makeOtpCode();
		const codeHash = await bcrypt.hash(code, 10);
		const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
		await prisma.otpCode.create({
			data: { phone, purpose, codeHash, expiresAt },
		});
		// پاک‌سازی کدهای منقضی/مصرف‌شده‌ی همین شماره تا جدول بی‌نهایت بزرگ نشود
		prisma.otpCode
			.deleteMany({
				where: {
					phone,
					OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }],
				},
			})
			.catch((error) => console.error('پاک‌سازی کدهای قدیمی ناموفق بود:', error));
		await sendMockSms({ phone, type: 'OTP', message: otpMessage(code) });
		res.json({
			message: 'کد تایید ارسال شد.',
		});
	} catch (error) {
		next(error);
	}
});

authRouter.post('/otp/verify', otpVerifyLimiter, async (req, res, next) => {
	try {
		const phone = normalizePhone(req.body.phone);
		const { code, name, purpose = 'LOGIN', trackingCode } = req.body;
		if (!phone) return res.status(400).json({ message: 'شماره موبایل نامعتبر است.' });

		const otp = await prisma.otpCode.findFirst({
			where: {
				phone,
				purpose,
				consumedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: 'desc' },
		});
		if (!otp || otp.attempts >= 5) return res.status(400).json({ message: 'کد تایید اشتباه یا منقضی است.' });

		const match = await bcrypt.compare(String(code || ''), otp.codeHash);
		if (!match) {
			await prisma.otpCode.update({
				where: { id: otp.id },
				data: { attempts: { increment: 1 } },
			});
			return res.status(400).json({ message: 'کد تایید اشتباه یا منقضی است.' });
		}
		await prisma.otpCode.update({
			where: { id: otp.id },
			data: { consumedAt: new Date() },
		});

		if (purpose === 'GUEST_ACCESS') {
			const reservation = await prisma.reservation.findFirst({
				where: {
					trackingCode: String(trackingCode || '')
						.trim()
						.toUpperCase(),
					customerPhone: phone,
				},
			});
			if (!reservation)
				return res.status(404).json({
					message: 'رزرو با این شماره و کد پیگیری پیدا نشد.',
				});
			const token = signGuestToken({
				phone,
				reservationId: reservation.id,
				trackingCode,
			});
			setCookie(res, 'guestToken', token);
			return res.json({
				message: 'دسترسی مهمان تایید شد.',
				reservationId: reservation.id,
			});
		}

		const safeName = name ? String(name).trim().slice(0, 80) : null;
		const user = await prisma.user.upsert({
			where: { phone },
			update: { name: safeName || undefined },
			create: { phone, name: safeName },
		});
		setCookie(res, 'userToken', signUserToken(user));
		res.json({ message: 'ورود انجام شد.', user });
	} catch (error) {
		next(error);
	}
});

authRouter.get('/me', optionalUser, (req, res) => {
	res.json({ user: req.user || null });
});

authRouter.patch('/me', requireUser, async (req, res, next) => {
	try {
		const safeName = req.body?.name ? String(req.body.name).trim().slice(0, 80) : null;
		const user = await prisma.user.update({
			where: { id: req.user.id },
			data: { name: safeName },
		});
		res.json({ user });
	} catch (error) {
		next(error);
	}
});

authRouter.post('/logout', optionalUser, async (req, res) => {
	// بالا بردن tokenVersion باعث می‌شود توکن‌های صادرشده‌ی قبلی دیگر پذیرفته نشوند
	if (req.user) {
		await prisma.user
			.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } })
			.catch((error) => console.error('باطل‌کردن توکن هنگام خروج ناموفق بود:', error));
	}
	clearCookie(res, 'userToken');
	clearCookie(res, 'guestToken');
	res.json({ message: 'خروج انجام شد.' });
});

authRouter.post('/admin/login', adminLoginLimiter, async (req, res, next) => {
	try {
		const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
		const password = typeof req.body?.password === 'string' ? req.body.password : '';
		if (!email || !password) return res.status(400).json({ message: 'ایمیل و رمز عبور لازم است.' });

		const admin = await prisma.adminUser.findUnique({ where: { email } });
		// حتی وقتی ادمین وجود ندارد یک مقایسه‌ی ساختگی انجام می‌شود تا زمان پاسخ
		// در هر دو حالت یکسان بماند و ایمیل‌های معتبر از روی زمان لو نروند
		// هش معتبر bcrypt از یک رشته‌ی تصادفی؛ باید معتبر باشد وگرنه compare
		// بدون محاسبه فوراً false برمی‌گرداند و اختلاف زمانی باقی می‌ماند
		const hashToCompare = admin?.passwordHash || '$2b$10$aSeBTOggmRzaYYKHqHDz2eQPrC5Eacr6fNxBub.SHZAKJ3gq1ahba';
		const ok = await bcrypt.compare(password, hashToCompare);
		if (!admin || !admin.isActive || !ok) return res.status(401).json({ message: 'اطلاعات ورود اشتباه است.' });
		setCookie(res, 'adminToken', signAdminToken(admin));
		res.json({
			message: 'ورود ادمین انجام شد.',
			admin: {
				id: admin.id,
				email: admin.email,
				name: admin.name,
				role: admin.role,
			},
		});
	} catch (error) {
		next(error);
	}
});

authRouter.post('/admin/logout', (_req, res) => {
	clearCookie(res, 'adminToken');
	res.json({ message: 'خروج ادمین انجام شد.' });
});
