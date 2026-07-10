import express from 'express';
import { prisma } from '../lib/prisma.js';
import { createMockRefId } from '../lib/payment.js';
import { confirmationMessage, notConfirmedMessage, sendMockSms } from '../lib/sms.js';
import { getReservationFull } from '../services/reservation.service.js';

export const paymentRouter = express.Router();

paymentRouter.post('/:reservationId/mock', async (req, res, next) => {
  try {
    const { result } = req.body;
    const reservation = await getReservationFull(req.params.reservationId);
    if (!reservation) return res.status(404).json({ message: 'رزرو پیدا نشد.' });
    if (['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(reservation.status)) {
      return res.status(400).json({ message: 'وضعیت رزرو قابل پرداخت نیست.' });
    }
    if (reservation.holdExpiresAt && reservation.holdExpiresAt < new Date()) {
      await prisma.reservation.update({ where: { id: reservation.id }, data: { status: 'EXPIRED' } });
      return res.status(400).json({ message: 'زمان نگهداری میز تمام شده است.' });
    }

    if (result === 'success') {
      const refId = createMockRefId();
      await prisma.payment.updateMany({ where: { reservationId: reservation.id, status: { in: ['PENDING', 'FAILED', 'REVIEW'] } }, data: { status: 'PAID', refId, verifiedAt: new Date() } });
      const updated = await prisma.reservation.update({ where: { id: reservation.id }, data: { status: 'CONFIRMED', paidAmount: reservation.totalAmount, holdExpiresAt: null } });
      if (reservation.originalReservationId) {
        await prisma.reservation.update({ where: { id: reservation.originalReservationId }, data: { status: 'CANCELLED', notes: 'با رزرو جدید جایگزین شد.' } });
      }
      await sendMockSms({ phone: reservation.customerPhone, type: 'CONFIRMATION', message: confirmationMessage(reservation) });
      return res.json({ reservation: updated, refId, message: 'پرداخت موفق بود و رزرو تایید شد.' });
    }

    if (result === 'review') {
      await prisma.payment.updateMany({ where: { reservationId: reservation.id, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'REVIEW', rawResponse: { reason: 'mock ambiguous callback' } } });
      const updated = await prisma.reservation.update({ where: { id: reservation.id }, data: { status: 'PAYMENT_REVIEW' } });
      await sendMockSms({ phone: reservation.customerPhone, type: 'NOT_CONFIRMED', message: notConfirmedMessage(reservation) });
      return res.json({ reservation: updated, message: 'پرداخت نیازمند بررسی است. رزرو تایید نشد، لطفاً با مجموعه تماس بگیرید.' });
    }

    await prisma.payment.updateMany({ where: { reservationId: reservation.id, status: { in: ['PENDING', 'REVIEW'] } }, data: { status: 'FAILED' } });
    const updated = await prisma.reservation.update({ where: { id: reservation.id }, data: { status: 'PAYMENT_PENDING' } });
    return res.json({ reservation: updated, message: 'پرداخت ناموفق بود. تا پایان مهلت نگهداری می‌توانید دوباره تلاش کنید.' });
  } catch (error) {
    next(error);
  }
});
