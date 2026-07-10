import { prisma } from '../lib/prisma.js';
import { verifyAdminToken, verifyUserToken } from '../lib/auth.js';

export async function optionalUser(req, _res, next) {
  try {
    const token = req.cookies?.userToken;
    if (token) {
      const payload = verifyUserToken(token);
      if (payload.type === 'user') {
        req.user = await prisma.user.findUnique({ where: { id: payload.sub } });
      }
    }
  } catch (_) {}
  next();
}

export async function requireUser(req, res, next) {
  try {
    const token = req.cookies?.userToken;
    if (!token) return res.status(401).json({ message: 'لطفاً وارد حساب شوید.' });
    const payload = verifyUserToken(token);
    if (payload.type !== 'user') return res.status(401).json({ message: 'دسترسی نامعتبر است.' });
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ message: 'کاربر پیدا نشد.' });
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
    if (payload.type !== 'admin') return res.status(401).json({ message: 'دسترسی ادمین نامعتبر است.' });
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
