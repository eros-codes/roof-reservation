import { prisma } from '../lib/prisma.js';

let settingsCache = null;
let settingsCachedAt = 0;
const SETTINGS_TTL_MS = 60 * 1000;

export async function getSettings({ fresh = false } = {}) {
	const now = Date.now();
	if (!fresh && settingsCache && now - settingsCachedAt < SETTINGS_TTL_MS) return settingsCache;
	const rows = await prisma.setting.findMany();
	settingsCache = Object.fromEntries(rows.map((row) => [row.key, row.value]));
	settingsCachedAt = now;
	return settingsCache;
}

export function invalidateSettingsCache() {
	settingsCache = null;
}

export function numberSetting(settings, key, fallback, { min = null } = {}) {
	const n = Number(settings[key]);
	if (!Number.isFinite(n)) return fallback;
	if (min !== null && n < min) return fallback;
	return n;
}

export async function setSetting(key, value) {
	const row = await prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
	invalidateSettingsCache();
	return row;
}
