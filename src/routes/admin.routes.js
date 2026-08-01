import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import { createManualReservation } from '../services/reservation.service.js';
import { getSettings, setSetting } from '../services/settings.service.js';
import { combineDateAndTime, normalizePhone } from '../lib/time.js';
import { sendMockSms } from '../lib/sms.js';

export const adminRouter = express.Router();

adminRouter.use(requireAdmin);

adminRouter.get('/me', (req, res) => {
	res.json({ admin: { id: req.admin.id, email: req.admin.email, name: req.admin.name, role: req.admin.role } });
});

adminRouter.get('/dashboard', async (_req, res, next) => {
	try {
		const now = new Date();
		const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

		const [actionNeeded, upcoming, revenue] = await Promise.all([
			// ساعتشون گذشته ولی هنوز تکمیل/عدم‌حضور/لغو نشدن
			prisma.reservation.count({ where: { status: 'CONFIRMED', startAt: { lt: now } } }),
			// رزروهای امروز که هنوز ساعتشون نرسیده
			prisma.reservation.findMany({
				where: { status: 'CONFIRMED', startAt: { gte: now, lt: dayEnd } },
				orderBy: { startAt: 'asc' },
				take: 20,
				include: { tables: { include: { table: true } } },
			}),
			prisma.payment.aggregate({
				where: { status: 'PAID', reservation: { status: { not: 'CANCELLED' } } },
				_sum: { amount: true },
			}),
		]);

		res.json({ actionNeeded, upcoming, totalRevenue: revenue._sum.amount || 0 });
	} catch (error) {
		next(error);
	}
});

const RESERVATION_FILTERS = ['action', 'all', 'today', 'confirmed', 'completed', 'noshow', 'cancelled'];

function reservationFilterWhere(filter, now) {
	const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	switch (filter) {
		// ساعتش گذشته ولی وضعیت نهایی نگرفته → منتظر تصمیم ادمین
		case 'action':
			return { status: 'CONFIRMED', startAt: { lt: now } };
		case 'today':
			return { startAt: { gte: dayStart, lt: dayEnd } };
		// رزرو شده ولی هنوز ساعتش نرسیده
		case 'confirmed':
			return { status: 'CONFIRMED', startAt: { gte: now } };
		case 'completed':
			return { status: 'COMPLETED' };
		case 'noshow':
			return { status: 'NO_SHOW' };
		case 'cancelled':
			return { status: 'CANCELLED' };
		default:
			return {};
	}
}

adminRouter.get('/reservations/counts', async (_req, res, next) => {
	try {
		const now = new Date();
		const entries = await Promise.all(
			RESERVATION_FILTERS.map(async (key) => [key, await prisma.reservation.count({ where: reservationFilterWhere(key, now) })]),
		);
		res.json({ counts: Object.fromEntries(entries) });
	} catch (error) {
		next(error);
	}
});

adminRouter.get('/reservations', async (req, res, next) => {
	try {
		const VALID_STATUSES = [
			'DRAFT',
			'HOLD',
			'PAYMENT_PENDING',
			'PAYMENT_REVIEW',
			'CONFIRMED',
			'CHANGE_PENDING',
			'CANCELLED',
			'COMPLETED',
			'NO_SHOW',
			'EXPIRED',
		];
		if (req.query.filter && !RESERVATION_FILTERS.includes(req.query.filter)) {
			return res.status(400).json({ message: 'فیلتر نامعتبر است.' });
		}
		const where = { ...reservationFilterWhere(req.query.filter, new Date()) };
		if (req.query.status) {
			if (!VALID_STATUSES.includes(req.query.status)) {
				return res.status(400).json({ message: 'وضعیت نامعتبر است.' });
			}
			where.status = req.query.status;
		}
		if (req.query.from || req.query.to) {
			where.startAt = {};
			for (const [param, op] of [
				['from', 'gte'],
				['to', 'lte'],
			]) {
				if (!req.query[param]) continue;
				const parsed = new Date(req.query[param]);
				if (Number.isNaN(parsed.getTime())) {
					return res.status(400).json({ message: 'بازه‌ی تاریخ نامعتبر است.' });
				}
				where.startAt[op] = parsed;
			}
		}
		const take = Math.min(Number(req.query.limit) || 100, 200);
		const skip = Math.max(Number(req.query.offset) || 0, 0);
		const [reservations, total] = await Promise.all([
			prisma.reservation.findMany({
				where,
				orderBy: { startAt: 'desc' },
				take,
				skip,
				include: { tables: { include: { table: true } }, payments: { orderBy: { createdAt: 'desc' } }, invoice: true, user: true },
			}),
			prisma.reservation.count({ where }),
		]);
		res.json({ reservations, total, limit: take, offset: skip });
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
			userId: null,
		});
		await sendMockSms({
			phone: reservation.customerPhone,
			type: 'CONFIRMATION',
			message: `رزرو دستی شما در Roof تایید شد. کد پیگیری: ${reservation.trackingCode}`,
		}).catch((error) => console.error('SMS رزرو دستی ارسال نشد:', error));
		res.status(201).json({ reservation });
	} catch (error) {
		next(error);
	}
});

const ADMIN_SETTABLE_STATUSES = ['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];

adminRouter.patch('/reservations/:id/status', async (req, res, next) => {
	try {
		const allowedForReception = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];
		if (req.admin.role === 'RECEPTION' && !allowedForReception.includes(req.body.status)) {
			return res.status(403).json({
				message: 'پذیرش فقط می‌تواند completed، no_show یا cancelled ثبت کند.',
			});
		}
		if (!ADMIN_SETTABLE_STATUSES.includes(req.body.status)) {
			return res.status(400).json({ message: 'این وضعیت از پنل ادمین قابل تنظیم نیست.' });
		}
		const existing = await prisma.reservation.findUnique({
			where: { id: req.params.id },
			include: { payments: { where: { status: 'PAID', isMock: false } } },
		});
		if (!existing) return res.status(404).json({ message: 'رزرو پیدا نشد.' });

		// اگر مشتری واقعاً پولی پرداخت کرده، لغو باید بدهی بازگشت وجه را ثبت کند
		const owesRefund = req.body.status === 'CANCELLED' && existing.payments.length > 0;

		const reservation = await prisma.reservation.update({
			where: { id: req.params.id },
			data: {
				status: req.body.status,
				notes: req.body.notes || undefined,
				...(owesRefund ? { refundStatus: 'PENDING' } : {}),
			},
		});
		if (owesRefund) {
			await prisma.payment.updateMany({
				where: { reservationId: reservation.id, status: 'PAID', isMock: false },
				data: { status: 'REFUND_PENDING' },
			});
		}
		if (req.body.status === 'CANCELLED') {
			await sendMockSms({
				phone: reservation.customerPhone,
				type: 'CANCELLATION',
				message: owesRefund
					? `رزرو ${reservation.trackingCode} لغو شد. برای بازگشت وجه با مجموعه تماس بگیرید.`
					: `رزرو ${reservation.trackingCode} لغو شد.`,
			}).catch((e) => console.error('SMS لغو ارسال نشد:', e));
		}
		res.json({ reservation });
	} catch (error) {
		if (error.code === 'P2025') return res.status(404).json({ message: 'رزرو پیدا نشد.' });
		next(error);
	}
});

adminRouter.get('/tables', async (_req, res, next) => {
	try {
		const [tables, connections] = await Promise.all([
			prisma.cafeTable.findMany({ orderBy: { code: 'asc' } }),
			prisma.tableConnection.findMany(),
		]);
		res.json({ tables, connections });
	} catch (error) {
		next(error);
	}
});

const ZONE_PREFIX = { WINDOW: 'W', CENTER: 'M', ROOF: 'R' };

async function uniqueTableCode(zone) {
	const prefix = ZONE_PREFIX[zone] || 'T';
	for (let i = 0; i < 10; i++) {
		const c = `${prefix}${Math.floor(100 + Math.random() * 900)}`;
		if (!(await prisma.cafeTable.findUnique({ where: { code: c } }))) return c;
	}
	throw new Error('ساخت کد میز ناموفق بود.');
}

const TABLE_FIELDS = [
	'code',
	'displayNumber',
	'zone',
	'shape',
	'x',
	'y',
	'width',
	'height',
	'rotation',
	'capacity',
	'minGuests',
	'maxGuests',
	'description',
	'isActive',
	'chairs',
	'image',
];

adminRouter.post('/tables', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
	try {
		const data = {};
		for (const key of TABLE_FIELDS) {
			if (req.body[key] !== undefined) data[key] = req.body[key];
		}
		if (!data.code) data.code = await uniqueTableCode(data.zone);
		if (!data.displayNumber) data.displayNumber = data.code.replace(/^\D+/, '') || data.code;
		if (Number(data.minGuests) > Number(data.maxGuests)) {
			return res.status(400).json({ message: 'حداقل نفر نمی‌تواند از حداکثر بیشتر باشد.' });
		}
		const table = await prisma.cafeTable.create({ data });
		res.status(201).json({ table });
	} catch (error) {
		next(error);
	}
});

adminRouter.patch('/tables/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
	try {
		const data = {};
		for (const key of TABLE_FIELDS) {
			if (req.body[key] !== undefined) data[key] = req.body[key];
		}

		// minGuests/maxGuests should be numeric before comparison,
		// otherwise string comparison makes "9" > "10" true.
		for (const key of ['x', 'y', 'width', 'height', 'rotation', 'capacity', 'minGuests', 'maxGuests']) {
			if (data[key] !== undefined) data[key] = Number(data[key]);
		}

		for (const key of ['minGuests', 'maxGuests', 'capacity']) {
			if (data[key] !== undefined && (!Number.isInteger(data[key]) || data[key] < 1)) {
				return res.status(400).json({ message: `مقدار «${key}» باید عددی صحیح و بزرگ‌تر از صفر باشد.` });
			}
		}
		if (data.minGuests !== undefined && data.maxGuests !== undefined && data.minGuests > data.maxGuests) {
			return res.status(400).json({ message: 'حداقل نفر نمی‌تواند از حداکثر بیشتر باشد.' });
		}

		const table = await prisma.cafeTable.update({
			where: { id: req.params.id },
			data,
		});

		res.json({ table });
	} catch (error) {
		next(error);
	}
});

adminRouter.delete('/tables/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
	try {
		await prisma.cafeTable.delete({ where: { id: req.params.id } });
		res.json({ message: 'میز حذف شد.' });
	} catch (error) {
		if (error.code === 'P2003') {
			return res
				.status(409)
				.json({ message: 'این میز تو رزروهای قبلی یا فعلی استفاده شده و نمی‌شه حذفش کرد؛ به‌جاش می‌تونی غیرفعالش کنی.' });
		}
		next(error);
	}
});

adminRouter.post('/table-connections', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
	try {
		const { tableAId, tableBId } = req.body;
		if (!tableAId || !tableBId) {
			return res.status(400).json({ message: 'شناسه‌ی هر دو میز لازم است.' });
		}
		if (tableAId === tableBId) {
			return res.status(400).json({ message: 'یک میز را نمی‌توان به خودش وصل کرد.' });
		}
		const [a, b] = [tableAId, tableBId].sort();
		const connection = await prisma.tableConnection.upsert({
			where: { tableAId_tableBId: { tableAId: a, tableBId: b } },
			update: {},
			create: { tableAId: a, tableBId: b },
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
		if (error.code === 'P2025') return res.status(404).json({ message: 'موردی برای حذف پیدا نشد.' });
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

// هر تنظیم علاوه بر کف، سقف منطقی هم دارد تا یک اشتباه تایپی
// (مثلاً یک صفر اضافه) میزها را برای روزها قفل نکند
const NUMBER_SETTING_BOUNDS = {
	slotIntervalMinutes: { min: 5, max: 120 },
	minDurationMinutes: { min: 15, max: 720 },
	maxDurationMinutes: { min: 15, max: 720 },
	reservationWindowDays: { min: 1, max: 365 },
	holdMinutes: { min: 1, max: 120 },
	pricePerGuest: { min: 1, max: 100000000 },
};

adminRouter.patch('/settings', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
	try {
		const updates = Object.entries(req.body || {});
		for (const [key, value] of updates) {
			const bounds = NUMBER_SETTING_BOUNDS[key];
			if (!bounds) continue;
			const n = Number(value);
			if (!Number.isFinite(n) || n < bounds.min || n > bounds.max) {
				return res.status(400).json({ message: `مقدار «${key}» باید عددی بین ${bounds.min} و ${bounds.max} باشد.` });
			}
		}
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

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

adminRouter.patch('/working-hours/:dayOfWeek', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
	try {
		const dayOfWeek = Number(req.params.dayOfWeek);
		if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
			return res.status(400).json({ message: 'روز هفته باید عددی بین ۰ تا ۶ باشد.' });
		}
		const { opensAt, closesAt } = req.body;
		if (!TIME_PATTERN.test(String(opensAt)) || !TIME_PATTERN.test(String(closesAt))) {
			return res.status(400).json({ message: 'ساعت باید به شکل HH:MM باشد (مثلاً 09:00).' });
		}
		if (opensAt >= closesAt) {
			return res.status(400).json({ message: 'ساعت بسته شدن باید بعد از ساعت باز شدن باشد.' });
		}
		// isClosed === true تا رشته‌ی "false" اشتباهاً true تفسیر نشود
		const isClosed = req.body.isClosed === true || req.body.isClosed === 'true';
		const workingHour = await prisma.workingHour.upsert({
			where: { dayOfWeek },
			update: { opensAt, closesAt, isClosed },
			create: { dayOfWeek, opensAt, closesAt, isClosed },
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
		const title = String(req.body.title || '').trim();
		if (!title) return res.status(400).json({ message: 'عنوان تعطیلی لازم است.' });
		const date = combineDateAndTime(String(req.body.date), '00:00');
		if (Number.isNaN(date.getTime())) return res.status(400).json({ message: 'تاریخ تعطیلی نامعتبر است.' });
		if (req.body.startTime && req.body.endTime && req.body.startTime >= req.body.endTime) {
			return res.status(400).json({ message: 'ساعت پایان باید بعد از ساعت شروع باشد.' });
		}
		const closure = await prisma.closure.create({
			data: {
				title,
				date,
				startTime: req.body.startTime || null,
				endTime: req.body.endTime || null,
				zone: req.body.zone || null,
				tableId: req.body.tableId || null,
				reason: req.body.reason || null,
			},
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
		if (error.code === 'P2025') return res.status(404).json({ message: 'موردی برای حذف پیدا نشد.' });
		next(error);
	}
});

adminRouter.get('/reports/revenue', requireRole('OWNER', 'MANAGER'), async (_req, res, next) => {
	try {
		const now = new Date();
		const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

		// درآمد = هر پرداخت موفق، منهای رزروهای لغوشده
		const paidWhere = { status: 'PAID', isMock: false, reservation: { status: { not: 'CANCELLED' } } };

		const [paid, counts, guestAgg, recentPayments, topTables] = await Promise.all([
			prisma.payment.aggregate({ where: paidWhere, _sum: { amount: true }, _count: true }),
			prisma.reservation.groupBy({ by: ['status'], _count: { _all: true } }),
			prisma.reservation.aggregate({
				where: { status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] } },
				_avg: { guestCount: true },
			}),
			prisma.payment.findMany({
				where: {
					...paidWhere,
					reservation: { status: { not: 'CANCELLED' }, startAt: { gte: sevenDaysAgo } },
				},
				select: { amount: true, reservation: { select: { startAt: true } } },
			}),
			prisma.reservationTable.groupBy({
				by: ['tableId'],
				_count: { _all: true },
				orderBy: { _count: { tableId: 'desc' } },
				take: 5,
			}),
		]);

		const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

		// درآمد هفت روز اخیر، گروه‌بندی بر اساس تاریخ محلی رزرو
		const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const daily = new Map();
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			daily.set(dayKey(d), 0);
		}
		for (const p of recentPayments) {
			const key = dayKey(new Date(p.reservation.startAt));
			if (daily.has(key)) daily.set(key, daily.get(key) + p.amount);
		}

		const tableInfo = await prisma.cafeTable.findMany({
			where: { id: { in: topTables.map((t) => t.tableId) } },
			select: { id: true, displayNumber: true, zone: true },
		});
		const tableById = Object.fromEntries(tableInfo.map((t) => [t.id, t]));

		const totalPaid = paid._sum.amount || 0;
		res.json({
			totalPaid,
			paidCount: paid._count,
			avgPerReservation: paid._count ? Math.round(totalPaid / paid._count) : 0,
			avgGuests: Math.round((guestAgg._avg.guestCount || 0) * 10) / 10,
			completed: byStatus.COMPLETED || 0,
			cancelled: byStatus.CANCELLED || 0,
			noShow: byStatus.NO_SHOW || 0,
			upcoming: byStatus.CONFIRMED || 0,
			daily: [...daily].map(([date, amount]) => ({ date, amount })),
			topTables: topTables.map((t) => ({
				displayNumber: tableById[t.tableId]?.displayNumber || '؟',
				zone: tableById[t.tableId]?.zone || '',
				count: t._count._all,
			})),
		});
	} catch (error) {
		next(error);
	}
});

adminRouter.get('/users', requireRole('OWNER', 'MANAGER'), async (_req, res, next) => {
	try {
		const users = await prisma.user.findMany({
			orderBy: { createdAt: 'desc' },
			take: Math.min(Number(req.query.limit) || 100, 200),
			skip: Math.max(Number(req.query.offset) || 0, 0),
			include: { _count: { select: { reservations: true } } },
		});
		res.json({ users });
	} catch (error) {
		next(error);
	}
});

adminRouter.get('/admins', requireRole('OWNER'), async (_req, res, next) => {
	try {
		const admins = await prisma.adminUser.findMany({
			orderBy: { createdAt: 'desc' },
			select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
		});
		res.json({ admins });
	} catch (error) {
		next(error);
	}
});

adminRouter.post('/admins', requireRole('OWNER'), async (req, res, next) => {
	try {
		const email = String(req.body.email || '')
			.trim()
			.toLowerCase();
		const name = String(req.body.name || '').trim();
		const role = String(req.body.role || '');
		if (!email || !name) {
			return res.status(400).json({ message: 'ایمیل و نام لازم است.' });
		}
		if (!['OWNER', 'MANAGER', 'RECEPTION'].includes(role)) {
			return res.status(400).json({ message: 'نقش نامعتبر است.' });
		}
		if (!req.body.password || req.body.password.length < 8) {
			return res.status(400).json({ message: 'رمز عبور باید حداقل ۸ کاراکتر باشد.' });
		}
		const passwordHash = await bcrypt.hash(req.body.password, 10);
		const admin = await prisma.adminUser.create({
			data: {
				email,
				name,
				role,
				passwordHash,
			},
		});
		res.status(201).json({
			admin: {
				id: admin.id,
				email: admin.email,
				name: admin.name,
				role: admin.role,
			},
		});
	} catch (error) {
		if (error.code === 'P2002') return res.status(409).json({ message: 'ادمینی با این ایمیل از قبل وجود دارد.' });
		next(error);
	}
});

const ADMIN_ROLES = ['OWNER', 'MANAGER', 'RECEPTION'];

adminRouter.patch('/admins/:id', requireRole('OWNER'), async (req, res, next) => {
	try {
		if (req.params.id === req.admin.id && req.body.isActive === false) {
			return res.status(400).json({ message: 'نمی‌توانی حساب خودت را غیرفعال کنی.' });
		}
		const data = {};
		if (req.body.name !== undefined) data.name = String(req.body.name).trim();
		if (req.body.isActive !== undefined) data.isActive = req.body.isActive === true;
		if (req.body.role !== undefined) {
			if (!ADMIN_ROLES.includes(req.body.role)) {
				return res.status(400).json({ message: 'نقش نامعتبر است.' });
			}
			if (req.params.id === req.admin.id) {
				return res.status(400).json({ message: 'نمی‌توانی نقش خودت را عوض کنی.' });
			}
			data.role = req.body.role;
		}
		if (req.body.password !== undefined) {
			if (String(req.body.password).length < 8) {
				return res.status(400).json({ message: 'رمز عبور باید حداقل ۸ کاراکتر باشد.' });
			}
			data.passwordHash = await bcrypt.hash(String(req.body.password), 10);
		}

		const admin = await prisma.adminUser.update({ where: { id: req.params.id }, data });
		res.json({ admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, isActive: admin.isActive } });
	} catch (error) {
		if (error.code === 'P2025') return res.status(404).json({ message: 'ادمین پیدا نشد.' });
		next(error);
	}
});
