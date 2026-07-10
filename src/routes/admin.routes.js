import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import { createManualReservation } from '../services/reservation.service.js';
import { getSettings, setSetting } from '../services/settings.service.js';
import { normalizePhone } from '../lib/time.js';
import { sendMockSms } from '../lib/sms.js';

export const adminRouter = express.Router();

adminRouter.use(requireAdmin);

adminRouter.get('/me', (req, res) => {
  res.json({ admin: { id: req.admin.id, email: req.admin.email, name: req.admin.name, role: req.admin.role } });
});

adminRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const [todayReservations, pendingPayments, noShows, revenue] = await Promise.all([
      prisma.reservation.count({ where: { startAt: { gte: start, lt: end }, status: { in: ['CONFIRMED', 'COMPLETED'] } } }),
      prisma.reservation.count({ where: { status: { in: ['HOLD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW'] } } }),
      prisma.reservation.count({ where: { status: 'NO_SHOW' } }),
      prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } })
    ]);
    res.json({ todayReservations, pendingPayments, noShows, totalRevenue: revenue._sum.amount || 0 });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/reservations', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.from || req.query.to) {
      where.startAt = {};
      if (req.query.from) where.startAt.gte = new Date(req.query.from);
      if (req.query.to) where.startAt.lte = new Date(req.query.to);
    }
    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: { startAt: 'desc' },
      include: { tables: { include: { table: true } }, payments: { orderBy: { createdAt: 'desc' } }, invoice: true, user: true }
    });
    res.json({ reservations });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/reservations/manual', async (req, res, next) => {
  try {
    const reservation = await createManualReservation({
      tableIds: req.body.tableIds,
      date: req.body.date,
      startTime: req.body.startTime,
      durationMinutes: Number(req.body.durationMinutes),
      guestCount: Number(req.body.guestCount),
      customerName: req.body.customerName,
      customerPhone: normalizePhone(req.body.customerPhone),
      userId: null
    });
    await sendMockSms({ phone: reservation.customerPhone, type: 'CONFIRMATION', message: `رزرو دستی شما در Roof تایید شد. کد پیگیری: ${reservation.trackingCode}` });
    res.status(201).json({ reservation });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/reservations/:id/status', async (req, res, next) => {
  try {
    const allowedForReception = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];
    if (req.admin.role === 'RECEPTION' && !allowedForReception.includes(req.body.status)) {
      return res.status(403).json({ message: 'پذیرش فقط می‌تواند completed، no_show یا cancelled ثبت کند.' });
    }
    const reservation = await prisma.reservation.update({ where: { id: req.params.id }, data: { status: req.body.status, notes: req.body.notes || undefined } });
    res.json({ reservation });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/tables', async (_req, res, next) => {
  try {
    const tables = await prisma.cafeTable.findMany({ orderBy: { code: 'asc' } });
    const connections = await prisma.tableConnection.findMany();
    res.json({ tables, connections });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/tables', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const table = await prisma.cafeTable.create({ data: req.body });
    res.status(201).json({ table });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/tables/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const data = { ...req.body };
    for (const key of ['capacity', 'minGuests', 'maxGuests']) if (data[key] !== undefined) data[key] = Number(data[key]);
    for (const key of ['x', 'y', 'width', 'height', 'rotation']) if (data[key] !== undefined) data[key] = Number(data[key]);
    const table = await prisma.cafeTable.update({ where: { id: req.params.id }, data });
    res.json({ table });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/table-connections', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const [a, b] = [req.body.tableAId, req.body.tableBId].sort();
    const connection = await prisma.tableConnection.upsert({
      where: { tableAId_tableBId: { tableAId: a, tableBId: b } },
      update: {},
      create: { tableAId: a, tableBId: b }
    });
    res.status(201).json({ connection });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/table-connections/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    await prisma.tableConnection.delete({ where: { id: req.params.id } });
    res.json({ message: 'اتصال حذف شد.' });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/settings', async (_req, res, next) => {
  try {
    res.json({ settings: await getSettings() });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/settings', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const updates = Object.entries(req.body || {});
    for (const [key, value] of updates) await setSetting(key, value);
    res.json({ settings: await getSettings() });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/working-hours', async (_req, res, next) => {
  try {
    const workingHours = await prisma.workingHour.findMany({ orderBy: { dayOfWeek: 'asc' } });
    res.json({ workingHours });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/working-hours/:dayOfWeek', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const dayOfWeek = Number(req.params.dayOfWeek);
    const workingHour = await prisma.workingHour.upsert({
      where: { dayOfWeek },
      update: { opensAt: req.body.opensAt, closesAt: req.body.closesAt, isClosed: Boolean(req.body.isClosed) },
      create: { dayOfWeek, opensAt: req.body.opensAt, closesAt: req.body.closesAt, isClosed: Boolean(req.body.isClosed) }
    });
    res.json({ workingHour });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/closures', async (_req, res, next) => {
  try {
    const closures = await prisma.closure.findMany({ orderBy: { date: 'desc' }, include: { table: true } });
    res.json({ closures });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/closures', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const closure = await prisma.closure.create({
      data: {
        title: req.body.title,
        date: new Date(req.body.date),
        startTime: req.body.startTime || null,
        endTime: req.body.endTime || null,
        zone: req.body.zone || null,
        tableId: req.body.tableId || null,
        reason: req.body.reason || null
      }
    });
    res.status(201).json({ closure });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/closures/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    await prisma.closure.delete({ where: { id: req.params.id } });
    res.json({ message: 'تعطیلی حذف شد.' });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/reports/revenue', requireRole('OWNER', 'MANAGER'), async (_req, res, next) => {
  try {
    const paid = await prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true }, _count: true });
    const cancelled = await prisma.reservation.count({ where: { status: 'CANCELLED' } });
    const noShow = await prisma.reservation.count({ where: { status: 'NO_SHOW' } });
    res.json({ totalPaid: paid._sum.amount || 0, paidCount: paid._count, cancelled, noShow });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/users', requireRole('OWNER', 'MANAGER'), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { reservations: true } } } });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admins', requireRole('OWNER'), async (_req, res, next) => {
  try {
    const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } });
    res.json({ admins });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admins', requireRole('OWNER'), async (req, res, next) => {
  try {
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const admin = await prisma.adminUser.create({ data: { email: req.body.email, name: req.body.name, role: req.body.role, passwordHash } });
    res.status(201).json({ admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
  } catch (error) {
    next(error);
  }
});
