import { prisma } from '../lib/prisma.js';

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function numberSetting(settings, key, fallback) {
  const n = Number(settings[key]);
  return Number.isFinite(n) ? n : fallback;
}

export async function setSetting(key, value) {
  return prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
}
