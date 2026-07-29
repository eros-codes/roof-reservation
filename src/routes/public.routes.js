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
