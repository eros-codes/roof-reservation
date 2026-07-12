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

  // --------------------------------------------------------------------
  // میزها: نسخه‌ی اول برگرفته از نقشه‌ی واقعی کافه (Cafe-plan + عکس‌ها).
  // کدها و displayNumber فعلاً رندومن؛ عمداً طبق خواسته‌ی خودت، تا وقتی
  // شماره‌گذاری نهایی رو دستی ندی، عوضشون نمی‌کنیم.
  // ظرفیت هر میز از رو تعداد صندلی دورش رو نقشه دراومده.
  // اتصال میزها (TableConnection) عمداً خالی مونده - طبق گفته‌ی خودت،
  // فعلاً کاری باهاش نداریم.
  // --------------------------------------------------------------------
  const tableData = [
    { code: 'W207', displayNumber: '207', zone: 'WINDOW', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 175, y: 95, width: 60, height: 60, rotation: -18, description: 'کنار پنجره' },
    { code: 'W410', displayNumber: '410', zone: 'WINDOW', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 150, y: 195, width: 60, height: 60, rotation: -18, description: 'کنار پنجره' },
    { code: 'W935', displayNumber: '935', zone: 'WINDOW', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 126, y: 295, width: 60, height: 60, rotation: -18, description: 'کنار پنجره' },
    { code: 'W249', displayNumber: '249', zone: 'WINDOW', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 103, y: 395, width: 60, height: 60, rotation: -18, description: 'کنار پنجره' },
    { code: 'W798', displayNumber: '798', zone: 'WINDOW', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 80, y: 495, width: 60, height: 60, rotation: -18, description: 'کنار پنجره' },
    { code: 'W377', displayNumber: '377', zone: 'WINDOW', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 57, y: 595, width: 60, height: 60, rotation: -18, description: 'کنار پنجره' },
    { code: 'W325', displayNumber: '325', zone: 'WINDOW', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 34, y: 695, width: 60, height: 60, rotation: -18, description: 'کنار پنجره' },
    { code: 'W184', displayNumber: '184', zone: 'WINDOW', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 400, y: 150, width: 60, height: 60, rotation: 0, description: 'کنار پنجره، داخلی' },
    { code: 'W691', displayNumber: '691', zone: 'WINDOW', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 270, y: 210, width: 78, height: 78, rotation: 0, description: 'کنار پنجره، داخلی' },
    { code: 'W606', displayNumber: '606', zone: 'WINDOW', shape: 'RECTANGLE', capacity: 6, minGuests: 4, maxGuests: 6, x: 280, y: 340, width: 130, height: 70, rotation: 0, description: 'کنار پنجره، میز بزرگ داخلی' },
    { code: 'W636', displayNumber: '636', zone: 'WINDOW', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 410, y: 345, width: 60, height: 60, rotation: 0, description: 'کنار پنجره، داخلی' },
    { code: 'W251', displayNumber: '251', zone: 'WINDOW', shape: 'RECTANGLE', capacity: 2, minGuests: 1, maxGuests: 2, x: 150, y: 780, width: 56, height: 40, rotation: 0, description: 'روبه‌روی مبل سرتاسری (بخشی از مبل خالی/بدون میز رزروپذیر مونده)' },
    { code: 'W398', displayNumber: '398', zone: 'WINDOW', shape: 'RECTANGLE', capacity: 2, minGuests: 1, maxGuests: 2, x: 230, y: 780, width: 56, height: 40, rotation: 0, description: 'روبه‌روی مبل سرتاسری (بخشی از مبل خالی/بدون میز رزروپذیر مونده)' },
    { code: 'W220', displayNumber: '220', zone: 'WINDOW', shape: 'RECTANGLE', capacity: 2, minGuests: 1, maxGuests: 2, x: 320, y: 800, width: 56, height: 40, rotation: 0, description: 'روبه‌روی مبل سرتاسری (بخشی از مبل خالی/بدون میز رزروپذیر مونده)' },
    { code: 'W670', displayNumber: '670', zone: 'WINDOW', shape: 'RECTANGLE', capacity: 2, minGuests: 1, maxGuests: 2, x: 420, y: 800, width: 56, height: 40, rotation: 0, description: 'روبه‌روی مبل سرتاسری (بخشی از مبل خالی/بدون میز رزروپذیر مونده)' },
    { code: 'M659', displayNumber: '659', zone: 'CENTER', shape: 'ROUND', capacity: 1, minGuests: 1, maxGuests: 1, x: 990, y: 110, width: 40, height: 40, rotation: 0, description: 'مبل تک‌نفره بنفش' },
    { code: 'M459', displayNumber: '459', zone: 'CENTER', shape: 'ROUND', capacity: 1, minGuests: 1, maxGuests: 1, x: 1040, y: 170, width: 40, height: 40, rotation: 0, description: 'مبل تک‌نفره بنفش' },
    { code: 'M408', displayNumber: '408', zone: 'CENTER', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 770, y: 100, width: 58, height: 58, rotation: 0, description: 'سالن وسط' },
    { code: 'M990', displayNumber: '990', zone: 'CENTER', shape: 'RECTANGLE', capacity: 4, minGuests: 2, maxGuests: 4, x: 900, y: 150, width: 110, height: 66, rotation: 0, description: 'سالن وسط' },
    { code: 'M995', displayNumber: '995', zone: 'CENTER', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 650, y: 260, width: 58, height: 58, rotation: 0, description: 'سالن وسط' },
    { code: 'M349', displayNumber: '349', zone: 'CENTER', shape: 'RECTANGLE', capacity: 6, minGuests: 3, maxGuests: 6, x: 790, y: 600, width: 110, height: 66, rotation: 0, description: 'سالن وسط' },
    { code: 'M939', displayNumber: '939', zone: 'CENTER', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 610, y: 610, width: 58, height: 58, rotation: 0, description: 'سالن وسط' },
    { code: 'M708', displayNumber: '708', zone: 'CENTER', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 930, y: 600, width: 76, height: 76, rotation: 0, description: 'سالن وسط' },
    { code: 'M501', displayNumber: '501', zone: 'CENTER', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 650, y: 780, width: 76, height: 76, rotation: 0, description: 'سالن وسط' },
    { code: 'M847', displayNumber: '847', zone: 'CENTER', shape: 'SQUARE', capacity: 2, minGuests: 1, maxGuests: 2, x: 870, y: 800, width: 58, height: 58, rotation: 0, description: 'سالن وسط' },
    { code: 'R412', displayNumber: '412', zone: 'ROOF', shape: 'ROUND', capacity: 1, minGuests: 1, maxGuests: 1, x: 1230, y: 110, width: 40, height: 40, rotation: 0, description: 'مبل تک‌نفره' },
    { code: 'R839', displayNumber: '839', zone: 'ROOF', shape: 'ROUND', capacity: 1, minGuests: 1, maxGuests: 1, x: 1280, y: 170, width: 40, height: 40, rotation: 0, description: 'مبل تک‌نفره' },
    { code: 'R148', displayNumber: '148', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1330, y: 130, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R496', displayNumber: '496', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1610, y: 130, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R482', displayNumber: '482', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1730, y: 130, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R132', displayNumber: '132', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1330, y: 250, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R107', displayNumber: '107', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1480, y: 250, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R899', displayNumber: '899', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1610, y: 250, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R843', displayNumber: '843', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1730, y: 250, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R176', displayNumber: '176', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1330, y: 370, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R911', displayNumber: '911', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1480, y: 370, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R719', displayNumber: '719', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1610, y: 370, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R657', displayNumber: '657', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1730, y: 370, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R525', displayNumber: '525', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1330, y: 490, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R753', displayNumber: '753', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1610, y: 490, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R140', displayNumber: '140', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1730, y: 490, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R735', displayNumber: '735', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1330, y: 610, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R560', displayNumber: '560', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1480, y: 610, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R897', displayNumber: '897', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1610, y: 610, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R280', displayNumber: '280', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1730, y: 610, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R306', displayNumber: '306', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1330, y: 730, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R221', displayNumber: '221', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1480, y: 730, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R402', displayNumber: '402', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1610, y: 730, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R622', displayNumber: '622', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1730, y: 730, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R443', displayNumber: '443', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1330, y: 830, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R509', displayNumber: '509', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1610, y: 830, width: 72, height: 72, rotation: 0, description: 'روف گاردن' },
    { code: 'R487', displayNumber: '487', zone: 'ROOF', shape: 'SQUARE', capacity: 4, minGuests: 2, maxGuests: 4, x: 1730, y: 830, width: 72, height: 72, rotation: 0, description: 'روف گاردن' }
  ];
  for (const table of tableData) {
    await prisma.cafeTable.upsert({
      where: { code: table.code },
      update: table,
      create: table
    });
  }

  // اتصال میزها فعلاً خالی — بعداً که خودت تصمیم گرفتی کدوم میزها قابل
  // اتصالن، این آرایه رو پر می‌کنیم: [['کدمیزالف','کدمیزب'], ...]
  const wantedConnections = [];

  for (const [codeA, codeB] of wantedConnections) {
    const a = await prisma.cafeTable.findUnique({ where: { code: codeA } });
    const b = await prisma.cafeTable.findUnique({ where: { code: codeB } });
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
