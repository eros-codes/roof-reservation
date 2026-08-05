import express from 'express';
import { getAvailability, getPublicConfig, getTablesWithConnections } from '../services/availability.service.js';

export const publicRouter = express.Router();

publicRouter.get('/config', async (_req, res, next) => {
	try {
		res.json(await getPublicConfig());
	} catch (error) {
		next(error);
	}
});

publicRouter.get('/tables', async (_req, res, next) => {
	try {
		const { tables } = await getTablesWithConnections();
		res.json({ tables });
	} catch (error) {
		next(error);
	}
});

publicRouter.get('/availability', async (req, res, next) => {
	try {
		const guestCount = Number(req.query.guests);
		const durationMinutes = Number(req.query.durationMinutes);
		if (!req.query.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
			return res.status(400).json({ message: 'تاریخ نامعتبر است.' });
		}
		if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 50) {
			return res.status(400).json({ message: 'تعداد نفرات نامعتبر است.' });
		}
		if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
			return res.status(400).json({ message: 'مدت رزرو نامعتبر است.' });
		}
		const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
		for (const key of ['startTime', 'rangeStart', 'rangeEnd']) {
			if (req.query[key] && !TIME_PATTERN.test(String(req.query[key]))) {
				return res.status(400).json({ message: 'فرمت ساعت نامعتبر است.' });
			}
		}
		if (req.query.rangeStart && req.query.rangeEnd && req.query.rangeStart >= req.query.rangeEnd) {
			return res.status(400).json({ message: 'ساعت پایان بازه باید بعد از ساعت شروع باشد.' });
		}
		const data = await getAvailability({
			date: req.query.date,
			guestCount,
			durationMinutes,
			startTime: req.query.startTime || undefined,
			rangeStart: req.query.rangeStart || undefined,
			rangeEnd: req.query.rangeEnd || undefined,
		});
		res.json(data);
	} catch (error) {
		next(error);
	}
});
