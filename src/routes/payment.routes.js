import express from 'express';
import { prisma } from '../lib/prisma.js';
import { requestZarinpalPayment, verifyZarinpalPayment } from '../lib/payment.js';
import { confirmationMessage, notConfirmedMessage, sendMockSms } from '../lib/sms.js';
import { getReservationFull } from '../services/reservation.service.js';
import { config } from '../config.js';

export const paymentRouter = express.Router();

function isPayable(reservation) {
  if (['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(reservation.status)) return false;
  if (reservation.holdExpiresAt && reservation.holdExpiresAt < new Date()) return false;
  return true;
}

async function confirmPaid(reservation, refId, rawResponse) {
  await prisma.payment.updateMany({
    where: { reservationId: reservation.id, status: { in: ['PENDING', 'FAILED', 'REVIEW'] } },
    data: { status: 'PAID', refId, verifiedAt: new Date(), rawResponse }
  });
  const updated = await prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: 'CONFIRMED', paidAmount: reservation.totalAmount, holdExpiresAt: null }
  });
  if (reservation.originalReservationId) {
    await prisma.reservation.update({ where: { id: reservation.originalReservationId }, data: { status: 'CANCELLED', notes: 'با رزرو جدید جایگزین شد.' } });
  }
  await sendMockSms({ phone: reservation.customerPhone, type: 'CONFIRMATION', message: confirmationMessage(reservation) });
  return updated;
}

// مرحله ۱: شروع پرداخت - کاربر رو به درگاه زرین‌پال می‌فرسته
paymentRouter.post('/:reservationId/request', async (req, res, next) => {
  try {
    const reservation = await getReservationFull(req.params.reservationId);
    if (!reservation) return res.status(404).json({ message: 'رزرو پیدا نشد.' });
    if (!isPayable(reservation)) {
      if (reservation.holdExpiresAt && reservation.holdExpiresAt < new Date() && reservation.status !== 'CONFIRMED') {
        await prisma.reservation.update({ where: { id: reservation.id }, data: { status: 'EXPIRED' } });
      }
      return res.status(400).json({ message: 'این رزرو دیگر قابل پرداخت نیست.' });
    }

    const { authority, paymentUrl } = await requestZarinpalPayment({
      amount: reservation.totalAmount,
      description: `رزرو Roof · کد پیگیری ${reservation.trackingCode}`,
      callbackUrl: `${config.appUrl}/api/payments/callback`,
      mobile: reservation.customerPhone
    });

    await prisma.payment.updateMany({
      where: { reservationId: reservation.id, status: { in: ['PENDING', 'FAILED', 'REVIEW'] } },
      data: { authority, status: 'PENDING' }
    });

    res.json({ paymentUrl });
  } catch (error) {
    next(error);
  }
});

// مرحله ۲: زرین‌پال کاربر رو به همینجا برمی‌گردونه (GET، نه fetch از فرانت)
paymentRouter.get('/callback', async (req, res) => {
  const { Authority: authority, Status: status } = req.query;
  const redirectTo = (id, result) => res.redirect(`/payment.html?id=${id}&result=${result}`);

  try {
    const payment = await prisma.payment.findFirst({ where: { authority }, orderBy: { createdAt: 'desc' } });
    if (!payment) return res.redirect('/payment.html?result=fail');

    const reservation = await getReservationFull(payment.reservationId);
    if (!reservation) return res.redirect('/payment.html?result=fail');

    // idempotent: اگه قبلاً confirmed شده (مثلاً زرین‌پال دوبار callback داد)، دوباره verify نمی‌کنیم
    if (reservation.status === 'CONFIRMED') return redirectTo(reservation.id, 'success');

    if (status !== 'OK') {
      await prisma.payment.updateMany({ where: { reservationId: reservation.id, status: { in: ['PENDING', 'REVIEW'] } }, data: { status: 'FAILED' } });
      return redirectTo(reservation.id, 'fail');
    }

    const verify = await verifyZarinpalPayment({ amount: reservation.totalAmount, authority });
    if (!verify.ok) {
      await prisma.payment.updateMany({ where: { reservationId: reservation.id, status: { in: ['PENDING', 'REVIEW'] } }, data: { status: 'FAILED', rawResponse: verify.raw } });
      await sendMockSms({ phone: reservation.customerPhone, type: 'NOT_CONFIRMED', message: notConfirmedMessage(reservation) });
      return redirectTo(reservation.id, 'fail');
    }

    await confirmPaid(reservation, verify.refId, verify.raw);
    return redirectTo(reservation.id, 'success');
  } catch (error) {
    console.error('Zarinpal callback error:', error);
    return res.redirect('/payment.html?result=fail');
  }
});
