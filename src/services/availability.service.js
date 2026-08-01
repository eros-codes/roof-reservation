import { prisma } from '../lib/prisma.js';
import { addDays, addMinutes, combineDateAndTime, makeTimeSlots, overlapWithBuffer, timeToMinutes } from '../lib/time.js';
import { getSettings, numberSetting } from './settings.service.js';

const BLOCKING_STATUSES = ['HOLD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'CHANGE_PENDING'];

export async function expireOldHolds(client = prisma) {
	await client.reservation.updateMany({
		where: {
			status: { in: ['HOLD', 'PAYMENT_PENDING'] },
			holdExpiresAt: { lt: new Date() },
		},
		data: { status: 'EXPIRED' },
	});
}

export async function getPublicConfig() {
	const settings = await getSettings();
	const windowDays = numberSetting(settings, 'reservationWindowDays', 14);
	const dates = [];
	const today = new Date();
	for (let i = 0; i < windowDays; i++) {
		const d = addDays(today, i);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		dates.push(`${y}-${m}-${day}`);
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
			currencyLabel: settings.currencyLabel || 'تومان',
		},
		dates,
	};
}

export async function getTablesWithConnections(client = prisma) {
	const [tables, connections] = await Promise.all([
		client.cafeTable.findMany({ orderBy: [{ zone: 'asc' }, { code: 'asc' }] }),
		client.tableConnection.findMany(),
	]);
	const byId = Object.fromEntries(tables.map((t) => [t.id, { ...t, connectableTableIds: [] }]));
	for (const c of connections) {
		if (byId[c.tableAId] && byId[c.tableBId]) {
			byId[c.tableAId].connectableTableIds.push(c.tableBId);
			byId[c.tableBId].connectableTableIds.push(c.tableAId);
		}
	}
	return { tables: Object.values(byId), connections };
}

function reservationBlocksTable(reservation, tableId, startAt, endAt, bufferMinutes) {
	const isActiveHold = reservation.status === 'HOLD' || reservation.status === 'PAYMENT_PENDING';
	if (isActiveHold && reservation.holdExpiresAt && reservation.holdExpiresAt < new Date()) return false;
	const hasTable = reservation.tables.some((rt) => rt.tableId === tableId);
	if (!hasTable) return false;
	return overlapWithBuffer(startAt, endAt, reservation.startAt, reservation.endAt, bufferMinutes);
}

function isTableClosed(table, dayClosures, startTime, endTime) {
	const relevant = dayClosures.filter((c) => (!c.tableId && !c.zone) || c.tableId === table.id || c.zone === table.zone);
	if (!relevant.length) return false;
	const requestedStart = timeToMinutes(startTime);
	const requestedEnd = timeToMinutes(endTime);
	return relevant.some((closure) => {
		if (!closure.startTime || !closure.endTime) return true;
		return requestedStart < timeToMinutes(closure.endTime) && requestedEnd > timeToMinutes(closure.startTime);
	});
}

function validateTimeWindow({ date, startTime, durationMinutes, settings, workingHoursByDay }) {
	const minLeadMinutes = numberSetting(settings, 'minLeadMinutes', 120);
	const windowDays = numberSetting(settings, 'reservationWindowDays', 14);
	const minDuration = numberSetting(settings, 'minDurationMinutes', 60);
	const maxDuration = numberSetting(settings, 'maxDurationMinutes', 240);
	if (durationMinutes < minDuration || durationMinutes > maxDuration) {
		return {
			ok: false,
			reason: `مدت رزرو باید بین ${minDuration / 60} تا ${maxDuration / 60} ساعت باشد.`,
		};
	}
	const startAt = combineDateAndTime(date, startTime);
	const endAt = addMinutes(startAt, durationMinutes);
	const now = new Date();
	if (startAt < addMinutes(now, minLeadMinutes)) {
		return {
			ok: false,
			reason: `رزرو باید حداقل ${Math.round(minLeadMinutes / 60)} ساعت قبل از شروع ثبت شود.`,
		};
	}
	const maxDate = addDays(new Date(), windowDays);
	maxDate.setHours(23, 59, 59, 999);
	if (startAt > maxDate) {
		return { ok: false, reason: `رزرو فقط تا ${windowDays} روز آینده ممکن است.` };
	}
	const workingHour = workingHoursByDay[startAt.getDay()];
	if (!workingHour || workingHour.isClosed) return { ok: false, reason: 'کافه در این روز بسته است.' };
	const endTime = `${String(endAt.getHours()).padStart(2, '0')}:${String(endAt.getMinutes()).padStart(2, '0')}`;
	const endMinutesFromStartDay = timeToMinutes(startTime) + durationMinutes;
	if (timeToMinutes(startTime) < timeToMinutes(workingHour.opensAt) || endMinutesFromStartDay > timeToMinutes(workingHour.closesAt)) {
		return {
			ok: false,
			reason: `بازه باید داخل ساعات کاری ${workingHour.opensAt} تا ${workingHour.closesAt} باشد.`,
		};
	}
	return { ok: true, startAt, endAt, endTime };
}

function tableAvailabilityForStart({
	table,
	date,
	startTime,
	durationMinutes,
	guestCount,
	reservations,
	settings,
	workingHoursByDay,
	dayClosures,
	check: precomputedCheck = null,
	bufferMinutes: precomputedBuffer = null,
}) {
	const check =
		precomputedCheck ||
		validateTimeWindow({
			date,
			startTime,
			durationMinutes,
			settings,
			workingHoursByDay,
		});
	if (!check.ok)
		return {
			tableId: table.id,
			code: table.code,
			available: false,
			reason: check.reason,
		};
	if (!table.isActive)
		return {
			tableId: table.id,
			code: table.code,
			available: false,
			reason: 'این میز موقتاً غیرفعال است.',
		};
	if (guestCount < table.minGuests)
		return {
			tableId: table.id,
			code: table.code,
			available: false,
			reason: 'تعداد نفرات برای این میز کم است.',
		};
	if (guestCount > table.maxGuests)
		return {
			tableId: table.id,
			code: table.code,
			available: false,
			reason: 'ظرفیت این میز کافی نیست.',
		};
	const closed = isTableClosed(table, dayClosures, startTime, check.endTime);
	if (closed)
		return {
			tableId: table.id,
			code: table.code,
			available: false,
			reason: 'این میز/بخش در این بازه بسته است.',
		};
	const bufferMinutes = precomputedBuffer ?? numberSetting(settings, 'cleaningBufferMinutes', 15);
	const blocked = reservations.some((reservation) =>
		reservationBlocksTable(reservation, table.id, check.startAt, check.endAt, bufferMinutes),
	);
	if (blocked)
		return {
			tableId: table.id,
			code: table.code,
			available: false,
			reason: 'این میز در این زمان رزرو شده است.',
		};

	return {
		tableId: table.id,
		code: table.code,
		displayNumber: table.displayNumber,
		available: true,
		matchType: guestCount === table.capacity ? 'perfect' : 'soft',
		startTime,
		endTime: check.endTime,
		maxReservableMinutes: durationMinutes,
		message: guestCount === table.capacity ? 'انتخاب ایده‌آل برای تعداد شما' : 'ظرفیت میز بیشتر از تعداد نفرات شماست',
	};
}

// همه‌ی گروه‌های همبندِ میزها رو پیدا می‌کنه (اندازه‌ی ۲ به بالا).
// «همبند» یعنی گروه از طریق اتصال‌های واقعی به هم وصله؛ مثلاً اگر ۸ و ۱۰ فقط
// از راه ۹ به هم می‌رسن، {۸,۱۰} گروه معتبری نیست ولی {۸,۹,۱۰} هست.
function enumerateConnectedGroups({ tables, connectionRows, guestCount, maxTables = 4, maxGroups = 60 }) {
	const byId = new Map(tables.map((t) => [t.id, t]));
	const neighbors = new Map(tables.map((t) => [t.id, new Set()]));
	for (const c of connectionRows) {
		if (!neighbors.has(c.tableAId) || !neighbors.has(c.tableBId)) continue;
		neighbors.get(c.tableAId).add(c.tableBId);
		neighbors.get(c.tableBId).add(c.tableAId);
	}

	const sumMin = (ids) => ids.reduce((s, id) => s + (byId.get(id).minGuests || 1), 0);
	const sumMax = (ids) => ids.reduce((s, id) => s + (byId.get(id).maxGuests || 0), 0);

	const groups = [];
	const seen = new Set();
	// چون اضافه‌کردن هر میز، جمعِ حداقل‌ها رو بالا می‌بره، گروهی که حداقلش
	// به تعداد نفرات رسیده دیگه جا برای بزرگ‌تر شدن نداره و شاخه‌اش بسته می‌شه
	let frontier = [...byId.keys()].map((id) => [id]).filter((g) => sumMin(g) < guestCount);

	while (frontier.length && groups.length < maxGroups) {
		const next = [];
		for (const group of frontier) {
			if (group.length >= maxTables) continue;
			const candidates = new Set();
			for (const id of group) {
				for (const n of neighbors.get(id)) if (!group.includes(n)) candidates.add(n);
			}
			for (const n of candidates) {
				const grown = [...group, n];
				const key = [...grown].sort().join('|');
				if (seen.has(key)) continue;
				seen.add(key);
				const min = sumMin(grown);
				if (guestCount >= min && guestCount <= sumMax(grown)) {
					groups.push(grown.map((id) => byId.get(id)));
					if (groups.length >= maxGroups) return groups;
				}
				if (min < guestCount) next.push(grown);
			}
		}
		frontier = next;
	}
	return groups;
}

function comboAvailabilityForStart({
	tables: groupTables,
	date,
	startTime,
	durationMinutes,
	guestCount,
	reservations,
	settings,
	workingHoursByDay,
	dayClosures,
	bufferMinutes: precomputedBuffer = null,
	check: precomputedCheck = null,
}) {
	if (!Array.isArray(groupTables) || groupTables.length < 2) return null;
	// نتیجه‌ی این بررسی به میزها بستگی ندارد؛ اگر از بیرون داده شده باشد دوباره حساب نمی‌شود
	const check =
		precomputedCheck ||
		validateTimeWindow({
			date,
			startTime,
			durationMinutes,
			settings,
			workingHoursByDay,
		});
	if (!check.ok) return null;
	if (groupTables.some((t) => !t.isActive)) return null;

	// حداقل و حداکثرِ گروه = جمع حداقل‌ها و جمع حداکثرهای همه‌ی میزها
	const combinedMin = groupTables.reduce((s, t) => s + (t.minGuests || 1), 0);
	const combinedMax = groupTables.reduce((s, t) => s + (t.maxGuests || 0), 0);
	const combinedCapacity = groupTables.reduce((s, t) => s + (t.capacity || 0), 0);
	if (guestCount < combinedMin || guestCount > combinedMax) return null;

	if (groupTables.some((t) => isTableClosed(t, dayClosures, startTime, check.endTime))) return null;

	const bufferMinutes = precomputedBuffer ?? numberSetting(settings, 'cleaningBufferMinutes', 15);
	const blocked = reservations.some((reservation) =>
		groupTables.some((t) => reservationBlocksTable(reservation, t.id, check.startAt, check.endAt, bufferMinutes)),
	);
	if (blocked) return null;

	const displayNumbers = groupTables.map((t) => t.displayNumber);
	return {
		comboId: groupTables.map((t) => t.id).join('+'),
		tableIds: groupTables.map((t) => t.id),
		codes: groupTables.map((t) => t.code),
		displayNumbers,
		available: true,
		matchType: guestCount === combinedCapacity ? 'perfect-combo' : 'soft-combo',
		startTime,
		endTime: check.endTime,
		capacity: combinedCapacity,
		message: `پیشنهاد ترکیبی: میزهای ${displayNumbers.join(' و ')}`,
	};
}

export async function getAvailability({ date, guestCount, durationMinutes, startTime, rangeStart, rangeEnd }, client = prisma) {
	if (client === prisma) await expireOldHolds(client);
	const settings = await getSettings();
	const interval = numberSetting(settings, 'slotIntervalMinutes', 15, { min: 1 });
	const { tables, connections: connectionRows } = await getTablesWithConnections(client);
	const dayStart = combineDateAndTime(date, '00:00');
	const dayEnd = addMinutes(dayStart, 24 * 60);
	const [reservations, workingHours, dayClosures] = await Promise.all([
		client.reservation.findMany({
			where: {
				status: { in: BLOCKING_STATUSES },
				startAt: { lt: dayEnd },
				endAt: { gt: dayStart },
			},
			include: { tables: true },
		}),
		client.workingHour.findMany(),
		client.closure.findMany({ where: { date: dayStart } }),
	]);
	const workingHoursByDay = Object.fromEntries(workingHours.map((w) => [w.dayOfWeek, w]));

	let starts = [];
	if (startTime) {
		starts = [startTime];
	} else if (rangeStart && rangeEnd) {
		const possible = makeTimeSlots(rangeStart, rangeEnd, interval);
		starts = possible.filter((slot) => timeToMinutes(slot) + durationMinutes <= timeToMinutes(rangeEnd));
	} else {
		throw new Error('زمان شروع یا بازه زمانی لازم است.');
	}

	const bufferMinutes = numberSetting(settings, 'cleaningBufferMinutes', 15);
	const slotChecks = new Map(
		starts.map((slot) => [
			slot,
			validateTimeWindow({
				date,
				startTime: slot,
				durationMinutes,
				settings,
				workingHoursByDay,
			}),
		]),
	);

	const tableResults = [];
	for (const table of tables) {
		let best = null;
		for (const slot of starts) {
			const result = tableAvailabilityForStart({
				table,
				date,
				startTime: slot,
				durationMinutes,
				guestCount,
				reservations,
				settings,
				workingHoursByDay,
				dayClosures,
				check: slotChecks.get(slot),
				bufferMinutes,
			});
			if (result.available) {
				best = result;
				break;
			}
			if (!best) best = result;
		}
		tableResults.push({ ...table, availability: best });
	}

	// ترکیب‌ها همیشه محاسبه می‌شن، حتی وقتی میز تکی هم آزاده —
	// انتخاب بین «یک میز ۵ نفره» و «۲+۳ کنار هم» با خود کاربره
	const combos = [];
	const groups = enumerateConnectedGroups({
		tables,
		connectionRows,
		guestCount,
		maxTables: numberSetting(settings, 'maxComboTables', 4, { min: 2 }),
	});
	for (const group of groups) {
		for (const slot of starts) {
			const combo = comboAvailabilityForStart({
				tables: group,
				date,
				startTime: slot,
				durationMinutes,
				guestCount,
				reservations,
				settings,
				workingHoursByDay,
				dayClosures,
				bufferMinutes,
				check: slotChecks.get(slot),
			});
			if (combo) {
				combos.push(combo);
				break;
			}
		}
	}

	// ساده‌ترین گروه (کمترین میز) و نزدیک‌ترین ظرفیت اول پیشنهاد بشه
	combos.sort((x, y) => x.tableIds.length - y.tableIds.length || Math.abs(x.capacity - guestCount) - Math.abs(y.capacity - guestCount));

	const hasPerfect = tableResults.some((t) => t.availability?.available && t.availability.matchType === 'perfect');
	const hasSoft = tableResults.some((t) => t.availability?.available && t.availability.matchType === 'soft');
	const exactMissingMessage =
		!hasPerfect && hasSoft ? 'میز دقیق برای تعداد شما موجود نیست؛ نزدیک‌ترین میزهای قابل رزرو با سبز کمرنگ نمایش داده شده‌اند.' : null;

	return {
		date,
		guestCount,
		durationMinutes,
		tables: tableResults,
		combos,
		exactMissingMessage,
	};
}

export async function assertTablesAvailable({ tableIds, date, startTime, durationMinutes, guestCount }, client = prisma) {
	const availability = await getAvailability(
		{
			date,
			startTime,
			durationMinutes,
			guestCount,
		},
		client,
	);
	if (tableIds.length === 1) {
		const table = availability.tables.find((t) => t.id === tableIds[0]);
		if (!table?.availability?.available) throw new Error(table?.availability?.reason || 'میز در این زمان قابل رزرو نیست.');
	} else {
		// تطابق باید دقیق باشه نه زیرمجموعه‌ای، وگرنه انتخاب دو میز با یک ترکیبِ
		// سه‌تایی هم جور در می‌آد و رزروی ثبت می‌شه که واقعاً معتبر نیست
		const requested = [...tableIds].sort().join('|');
		const combo = availability.combos.find((c) => [...c.tableIds].sort().join('|') === requested);
		if (!combo) throw new Error('این ترکیب میز در این زمان قابل رزرو نیست.');
	}
}
