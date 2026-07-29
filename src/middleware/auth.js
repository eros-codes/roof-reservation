import { prisma } from '../lib/prisma.js';
import { verifyAdminToken, verifyUserToken } from '../lib/auth.js';

export async function optionalUser(req, _res, next) {
	const token = req.cookies?.userToken;
	if (!token) return next();

	let payload;
	try {
		payload = verifyUserToken(token);
	} catch (_) {
		return next(); // توکن نامعتبر یا منقضی: کاربر مهمان در نظر گرفته می‌شه
	}

	try {
		const user = await prisma.user.findUnique({ where: { id: payload.sub } });
		if (user && user.isActive !== false && (payload.ver ?? 0) === (user.tokenVersion ?? 0)) {
			req.user = user;
		}
	} catch (error) {
		// خطای دیتابیس نباید بی‌صدا به «مهمان» ترجمه بشه
		console.error('optionalUser: خواندن کاربر از دیتابیس ناموفق بود', error);
	}
	next();
}

export async function requireUser(req, res, next) {
	try {
		const token = req.cookies?.userToken;
		if (!token) return res.status(401).json({ message: 'لطفاً وارد حساب شوید.' });
		const payload = verifyUserToken(token);
		const user = await prisma.user.findUnique({ where: { id: payload.sub } });
		if (!user) return res.status(401).json({ message: 'کاربر پیدا نشد.' });
		if (user.isActive === false) return res.status(403).json({ message: 'حساب کاربری غیرفعال شده است.' });
		if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) return res.status(401).json({ message: 'نشست منقضی شده؛ دوباره وارد شو.' });
		req.user = user;
		next();
	} catch (error) {
		res.status(401).json({ message: 'نشست کاربری نامعتبر است.' });
	}
}

export async function requireAdmin(req, res, next) {
	try {
		const token = req.cookies?.adminToken;
		if (!token) return res.status(401).json({ message: 'ورود ادمین لازم است.' });
		const payload = verifyAdminToken(token);
		const admin = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
		if (!admin || !admin.isActive) return res.status(401).json({ message: 'ادمین فعال نیست.' });
		req.admin = admin;
		next();
	} catch (error) {
		res.status(401).json({ message: 'نشست ادمین نامعتبر است.' });
	}
}

export function requireRole(...roles) {
	return (req, res, next) => {
		if (!req.admin) return res.status(401).json({ message: 'ورود ادمین لازم است.' });
		if (!roles.includes(req.admin.role)) return res.status(403).json({ message: 'سطح دسترسی کافی نیست.' });
		next();
	};
}
