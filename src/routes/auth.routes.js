import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { clearCookie, setCookie, signAdminToken, signGuestToken, signUserToken } from '../lib/auth.js';
import { normalizePhone } from '../lib/time.js';
import { otpMessage, sendMockSms } from '../lib/sms.js';

export const authRouter = express.Router();

function makeOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

authRouter.post('/otp/send', async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const purpose = req.body.purpose || 'LOGIN';
    if (!phone) return res.status(400).json({ message: 'شماره موبایل لازم است.' });
    const code = makeOtpCode();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    await prisma.otpCode.create({ data: { phone, purpose, code, expiresAt } });
    await sendMockSms({ phone, type: 'OTP', message: otpMessage(code) });
    res.json({ message: 'کد تایید ارسال شد.', devCode: code });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/otp/verify', async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { code, name, purpose = 'LOGIN', trackingCode } = req.body;
    const otp = await prisma.otpCode.findFirst({
      where: { phone, purpose, code, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
    if (!otp) return res.status(400).json({ message: 'کد تایید اشتباه یا منقضی است.' });
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    if (purpose === 'GUEST_ACCESS') {
      const reservation = await prisma.reservation.findFirst({ where: { trackingCode, customerPhone: phone } });
      if (!reservation) return res.status(404).json({ message: 'رزرو با این شماره و کد پیگیری پیدا نشد.' });
      const token = signGuestToken({ phone, reservationId: reservation.id, trackingCode });
      setCookie(res, 'guestToken', token);
      return res.json({ message: 'دسترسی مهمان تایید شد.', reservationId: reservation.id });
    }

    const user = await prisma.user.upsert({
      where: { phone },
      update: { name: name || undefined },
      create: { phone, name: name || null }
    });
    setCookie(res, 'userToken', signUserToken(user));
    res.json({ message: 'ورود انجام شد.', user });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', async (req, res, next) => {
  try {
    const token = req.cookies?.userToken;
    if (!token) return res.json({ user: null });
    const { verifyUserToken } = await import('../lib/auth.js');
    const payload = verifyUserToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    res.json({ user });
  } catch (_) {
    res.json({ user: null });
  }
});

authRouter.post('/logout', (_req, res) => {
  clearCookie(res, 'userToken');
  clearCookie(res, 'guestToken');
  res.json({ message: 'خروج انجام شد.' });
});

authRouter.post('/admin/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.isActive) return res.status(401).json({ message: 'اطلاعات ورود اشتباه است.' });
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ message: 'اطلاعات ورود اشتباه است.' });
    setCookie(res, 'adminToken', signAdminToken(admin));
    res.json({ message: 'ورود ادمین انجام شد.', admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/admin/logout', (_req, res) => {
  clearCookie(res, 'adminToken');
  res.json({ message: 'خروج ادمین انجام شد.' });
});
