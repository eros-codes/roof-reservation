import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const settings = [
  ['reservationWindowDays', '14'],
  ['minLeadMinutes', '120'],
  ['minDurationMinutes', '60'],
  ['maxDurationMinutes', '240'],
  ['slotIntervalMinutes', '15'],
  ['cleaningBufferMinutes', '15'],
  ['holdMinutes', '10'],
  ['pricePerGuest', '100000'],
  ['currencyLabel', 'تومان'],
  ['reminderBeforeMinutes', '180'],
  ['cafeName', 'Roof']
];

async function main() {
  for (const [key, value] of settings) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  for (let day = 0; day <= 6; day++) {
    await prisma.workingHour.upsert({
      where: { dayOfWeek: day },
      update: { opensAt: '09:00', closesAt: '21:00', isClosed: false },
      create: { dayOfWeek: day, opensAt: '09:00', closesAt: '21:00', isClosed: false }
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@roof.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin123456';
  const name = process.env.SEED_ADMIN_NAME || 'Roof Owner';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.adminUser.upsert({
    where: { email },
    update: { name, passwordHash, role: 'OWNER', isActive: true },
    create: { email, name, passwordHash, role: 'OWNER', isActive: true }
  });

  const tableData = [
    { code: 'T1', displayNumber: '۱', zone: 'WINDOW', shape: 'ROUND', capacity: 2, minGuests: 1, maxGuests: 2, x: 150, y: 135, width: 70, height: 70, description: 'کنار پنجره، میز گرد دو نفره' },
    { code: 'T2', displayNumber: '۲', zone: 'WINDOW', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 270, y: 135, width: 76, height: 76, description: 'کنار پنجره، میز چهار نفره' },
    { code: 'T3', displayNumber: '۳', zone: 'WINDOW', shape: 'RECTANGLE', capacity: 4, minGuests: 2, maxGuests: 4, x: 395, y: 135, width: 96, height: 64, description: 'کنار پنجره، مستطیل' },
    { code: 'T4', displayNumber: '۴', zone: 'CENTER', shape: 'RECTANGLE', capacity: 6, minGuests: 4, maxGuests: 6, x: 215, y: 305, width: 118, height: 70, description: 'وسط، قابل اتصال به میز ۵' },
    { code: 'T5', displayNumber: '۵', zone: 'CENTER', shape: 'RECTANGLE', capacity: 6, minGuests: 4, maxGuests: 6, x: 370, y: 305, width: 118, height: 70, description: 'وسط، قابل اتصال به میز ۴' },
    { code: 'T6', displayNumber: '۶', zone: 'CENTER', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 535, y: 300, width: 78, height: 78, description: 'وسط سالن' },
    { code: 'T7', displayNumber: '۷', zone: 'ROOF', shape: 'ROUND', capacity: 2, minGuests: 1, maxGuests: 2, x: 210, y: 505, width: 74, height: 74, description: 'روف، دو نفره' },
    { code: 'T8', displayNumber: '۸', zone: 'ROOF', shape: 'RECTANGLE', capacity: 4, minGuests: 2, maxGuests: 4, x: 350, y: 505, width: 98, height: 66, description: 'روف، چهار نفره' },
    { code: 'T9', displayNumber: '۹', zone: 'ROOF', shape: 'RECTANGLE', capacity: 6, minGuests: 4, maxGuests: 6, x: 520, y: 505, width: 118, height: 70, description: 'روف، شش نفره، قابل اتصال به میز ۱۰' },
    { code: 'T10', displayNumber: '۱۰', zone: 'ROOF', shape: 'RECTANGLE', capacity: 6, minGuests: 4, maxGuests: 6, x: 675, y: 505, width: 118, height: 70, description: 'روف، شش نفره، قابل اتصال به میز ۹' }
  ];

  for (const table of tableData) {
    await prisma.cafeTable.upsert({
      where: { code: table.code },
      update: table,
      create: table
    });
  }

  const t4 = await prisma.cafeTable.findUnique({ where: { code: 'T4' } });
  const t5 = await prisma.cafeTable.findUnique({ where: { code: 'T5' } });
  const t9 = await prisma.cafeTable.findUnique({ where: { code: 'T9' } });
  const t10 = await prisma.cafeTable.findUnique({ where: { code: 'T10' } });

  for (const [a, b] of [[t4, t5], [t9, t10]]) {
    if (a && b) {
      const tableAId = a.id < b.id ? a.id : b.id;
      const tableBId = a.id < b.id ? b.id : a.id;
      await prisma.tableConnection.upsert({
        where: { tableAId_tableBId: { tableAId, tableBId } },
        update: {},
        create: { tableAId, tableBId }
      });
    }
  }

  console.log('Seed completed.');
  console.log(`Admin: ${email} / ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
