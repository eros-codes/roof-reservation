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
    res.json({ tables: await getTablesWithConnections() });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/availability', async (req, res, next) => {
  try {
    const data = await getAvailability({
      date: req.query.date,
      guestCount: Number(req.query.guests),
      durationMinutes: Number(req.query.durationMinutes),
      startTime: req.query.startTime || undefined,
      rangeStart: req.query.rangeStart || undefined,
      rangeEnd: req.query.rangeEnd || undefined
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});
