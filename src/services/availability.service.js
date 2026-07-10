import { prisma } from '../lib/prisma.js';
import { addDays, addMinutes, combineDateAndTime, makeTimeSlots, overlapWithBuffer, timeToMinutes } from '../lib/time.js';
import { getSettings, numberSetting } from './settings.service.js';

const BLOCKING_STATUSES = ['HOLD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'CHANGE_PENDING'];

export async function expireOldHolds() {
  await prisma.reservation.updateMany({
    where: {
      status: { in: ['HOLD', 'PAYMENT_PENDING'] },
      holdExpiresAt: { lt: new Date() }
    },
    data: { status: 'EXPIRED' }
  });
}

export async function getPublicConfig() {
  const settings = await getSettings();
  const windowDays = numberSetting(settings, 'reservationWindowDays', 14);
  const dates = [];
  const today = new Date();
  for (let i = 0; i < windowDays; i++) {
    const d = addDays(today, i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return {
    settings: {
      reservationWindowDays: windowDays,
      minLeadMinutes: numberSetting(settings, 'minLeadMinutes', 120),
      minDurationMinutes: numberSetting(settings, 'minDurationMinutes', 60),
      maxDurationMinutes: numberSetting(settings, 'maxDurationMinutes', 240),
      slotIntervalMinutes: numberSetting(settings, 'slotIntervalMinutes', 15),
      cleaningBufferMinutes: numberSetting(settings, 'cleaningBufferMinutes', 15),
      holdMinutes: numberSetting(settings, 'holdMinutes', 10),
      pricePerGuest: numberSetting(settings, 'pricePerGuest', 100000),
      currencyLabel: settings.currencyLabel || 'تومان'
    },
    dates
  };
}

export async function getTablesWithConnections() {
  const tables = await prisma.cafeTable.findMany({ orderBy: [{ zone: 'asc' }, { code: 'asc' }] });
  const connections = await prisma.tableConnection.findMany();
  const byId = Object.fromEntries(tables.map((t) => [t.id, { ...t, connectableTableIds: [] }]));
  for (const c of connections) {
    if (byId[c.tableAId] && byId[c.tableBId]) {
      byId[c.tableAId].connectableTableIds.push(c.tableBId);
      byId[c.tableBId].connectableTableIds.push(c.tableAId);
    }
  }
  return Object.values(byId);
}

function reservationBlocksTable(reservation, tableId, startAt, endAt, bufferMinutes) {
  const isActiveHold = reservation.status === 'HOLD' || reservation.status === 'PAYMENT_PENDING';
  if (isActiveHold && reservation.holdExpiresAt && reservation.holdExpiresAt < new Date()) return false;
  const hasTable = reservation.tables.some((rt) => rt.tableId === tableId);
  if (!hasTable) return false;
  return overlapWithBuffer(startAt, endAt, reservation.startAt, reservation.endAt, bufferMinutes);
}

async function isTableClosed(table, dateString, startTime, endTime) {
  const date = combineDateAndTime(dateString, '00:00');
  const closures = await prisma.closure.findMany({
    where: {
      date,
      OR: [
        { tableId: null, zone: null },
        { tableId: table.id },
        { zone: table.zone }
      ]
    }
  });

  if (!closures.length) return false;
  const requestedStart = timeToMinutes(startTime);
  const requestedEnd = timeToMinutes(endTime);
  return closures.some((closure) => {
    if (!closure.startTime || !closure.endTime) return true;
    return requestedStart < timeToMinutes(closure.endTime) && requestedEnd > timeToMinutes(closure.startTime);
  });
}

async function validateTimeWindow({ date, startTime, durationMinutes }) {
  const settings = await getSettings();
  const minLeadMinutes = numberSetting(settings, 'minLeadMinutes', 120);
  const windowDays = numberSetting(settings, 'reservationWindowDays', 14);
  const minDuration = numberSetting(settings, 'minDurationMinutes', 60);
  const maxDuration = numberSetting(settings, 'maxDurationMinutes', 240);

  if (durationMinutes < minDuration || durationMinutes > maxDuration) {
    return { ok: false, reason: `مدت رزرو باید بین ${minDuration / 60} تا ${maxDuration / 60} ساعت باشد.` };
  }

  const startAt = combineDateAndTime(date, startTime);
  const endAt = addMinutes(startAt, durationMinutes);
  const now = new Date();
  if (startAt < addMinutes(now, minLeadMinutes)) {
    return { ok: false, reason: 'رزرو باید حداقل ۲ ساعت قبل از شروع ثبت شود.' };
  }

  const maxDate = addDays(new Date(), windowDays);
  if (startAt > maxDate) {
    return { ok: false, reason: 'رزرو فقط تا ۱۴ روز آینده ممکن است.' };
  }

  const day = startAt.getDay();
  const workingHour = await prisma.workingHour.findUnique({ where: { dayOfWeek: day } });
  if (!workingHour || workingHour.isClosed) return { ok: false, reason: 'کافه در این روز بسته است.' };

  const endTime = `${String(endAt.getHours()).padStart(2, '0')}:${String(endAt.getMinutes()).padStart(2, '0')}`;
  if (timeToMinutes(startTime) < timeToMinutes(workingHour.opensAt) || timeToMinutes(endTime) > timeToMinutes(workingHour.closesAt)) {
    return { ok: false, reason: `بازه باید داخل ساعات کاری ${workingHour.opensAt} تا ${workingHour.closesAt} باشد.` };
  }

  return { ok: true, startAt, endAt, endTime, settings, workingHour };
}

async function tableAvailabilityForStart({ table, date, startTime, durationMinutes, guestCount, reservations, settings }) {
  const check = await validateTimeWindow({ date, startTime, durationMinutes });
  if (!check.ok) return { tableId: table.id, code: table.code, available: false, reason: check.reason };
  if (!table.isActive) return { tableId: table.id, code: table.code, available: false, reason: 'این میز موقتاً غیرفعال است.' };
  if (guestCount < table.minGuests) return { tableId: table.id, code: table.code, available: false, reason: 'تعداد نفرات برای این میز کم است.' };
  if (guestCount > table.maxGuests) return { tableId: table.id, code: table.code, available: false, reason: 'ظرفیت این میز کافی نیست.' };
  const closed = await isTableClosed(table, date, startTime, check.endTime);
  if (closed) return { tableId: table.id, code: table.code, available: false, reason: 'این میز/بخش در این بازه بسته است.' };

  const bufferMinutes = numberSetting(settings, 'cleaningBufferMinutes', 15);
  const blocked = reservations.some((reservation) => reservationBlocksTable(reservation, table.id, check.startAt, check.endAt, bufferMinutes));
  if (blocked) return { tableId: table.id, code: table.code, available: false, reason: 'این میز در این زمان رزرو شده است.' };

  return {
    tableId: table.id,
    code: table.code,
    displayNumber: table.displayNumber,
    available: true,
    matchType: guestCount === table.capacity ? 'perfect' : 'soft',
    startTime,
    endTime: check.endTime,
    maxReservableMinutes: durationMinutes,
    message: guestCount === table.capacity ? 'انتخاب ایده‌آل برای تعداد شما' : 'ظرفیت میز بیشتر از تعداد نفرات شماست'
  };
}

async function comboAvailabilityForStart({ tables, date, startTime, durationMinutes, guestCount, reservations, settings }) {
  const [a, b] = tables;
  const check = await validateTimeWindow({ date, startTime, durationMinutes });
  if (!check.ok) return null;
  if (!a.isActive || !b.isActive) return null;

  const combinedMax = a.maxGuests + b.maxGuests;
  const combinedCapacity = a.capacity + b.capacity;
  const combinedMin = Math.max(a.minGuests, b.minGuests);
  const largestSingle = Math.max(a.maxGuests, b.maxGuests);
  if (guestCount <= largestSingle) return null;
  if (guestCount < combinedMin || guestCount > combinedMax) return null;

  const closedA = await isTableClosed(a, date, startTime, check.endTime);
  const closedB = await isTableClosed(b, date, startTime, check.endTime);
  if (closedA || closedB) return null;

  const bufferMinutes = numberSetting(settings, 'cleaningBufferMinutes', 15);
  const blocked = reservations.some((reservation) =>
    [a.id, b.id].some((tableId) => reservationBlocksTable(reservation, tableId, check.startAt, check.endAt, bufferMinutes))
  );
  if (blocked) return null;

  return {
    comboId: `${a.id}+${b.id}`,
    tableIds: [a.id, b.id],
    codes: [a.code, b.code],
    displayNumbers: [a.displayNumber, b.displayNumber],
    available: true,
    matchType: guestCount === combinedCapacity ? 'perfect-combo' : 'soft-combo',
    startTime,
    endTime: check.endTime,
    capacity: combinedCapacity,
    message: `پیشنهاد ترکیبی: میزهای ${a.displayNumber} و ${b.displayNumber}`
  };
}

export async function getAvailability({ date, guestCount, durationMinutes, startTime, rangeStart, rangeEnd }) {
  await expireOldHolds();
  const settings = await getSettings();
  const interval = numberSetting(settings, 'slotIntervalMinutes', 15);
  const tables = await getTablesWithConnections();
  const dayStart = combineDateAndTime(date, '00:00');
  const dayEnd = addMinutes(dayStart, 24 * 60);
  const reservations = await prisma.reservation.findMany({
    where: { status: { in: BLOCKING_STATUSES }, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
    include: { tables: true }
  });

  let starts = [];
  if (startTime) {
    starts = [startTime];
  } else if (rangeStart && rangeEnd) {
    const possible = makeTimeSlots(rangeStart, rangeEnd, interval);
    starts = possible.filter((slot) => timeToMinutes(slot) + durationMinutes <= timeToMinutes(rangeEnd));
  } else {
    throw new Error('زمان شروع یا بازه زمانی لازم است.');
  }

  const tableResults = [];
  for (const table of tables) {
    let best = null;
    for (const slot of starts) {
      const result = await tableAvailabilityForStart({ table, date, startTime: slot, durationMinutes, guestCount, reservations, settings });
      if (result.available) {
        best = result;
        break;
      }
      if (!best) best = result;
    }
    tableResults.push({ ...table, availability: best });
  }

  const connectionRows = await prisma.tableConnection.findMany();
  const combos = [];
  const byId = Object.fromEntries(tables.map((t) => [t.id, t]));
  for (const connection of connectionRows) {
    const a = byId[connection.tableAId];
    const b = byId[connection.tableBId];
    if (!a || !b) continue;
    for (const slot of starts) {
      const combo = await comboAvailabilityForStart({ tables: [a, b], date, startTime: slot, durationMinutes, guestCount, reservations, settings });
      if (combo) {
        combos.push(combo);
        break;
      }
    }
  }

  const hasPerfect = tableResults.some((t) => t.availability?.available && t.availability.matchType === 'perfect');
  const hasSoft = tableResults.some((t) => t.availability?.available && t.availability.matchType === 'soft');
  const exactMissingMessage = !hasPerfect && hasSoft ? 'میز دقیق برای تعداد شما موجود نیست؛ نزدیک‌ترین میزهای قابل رزرو با سبز کمرنگ نمایش داده شده‌اند.' : null;

  return { date, guestCount, durationMinutes, tables: tableResults, combos, exactMissingMessage };
}

export async function assertTablesAvailable({ tableIds, date, startTime, durationMinutes, guestCount }) {
  const availability = await getAvailability({ date, startTime, durationMinutes, guestCount });
  if (tableIds.length === 1) {
    const table = availability.tables.find((t) => t.id === tableIds[0]);
    if (!table?.availability?.available) throw new Error(table?.availability?.reason || 'میز در این زمان قابل رزرو نیست.');
  } else if (tableIds.length === 2) {
    const combo = availability.combos.find((c) => tableIds.every((id) => c.tableIds.includes(id)));
    if (!combo) throw new Error('این ترکیب میز در این زمان قابل رزرو نیست.');
  } else {
    throw new Error('حداکثر ترکیب دو میز مجاز است.');
  }
}
