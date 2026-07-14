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
  // فعلاً کاری باهاش نداریم. صندلی هر میز (chairs) هم عمداً خالیه -
  // هیچ چیدمان پیش‌فرضی نداره، از تو پنل ادمین (ابزار جدید) دستی چیده می‌شه.
  // --------------------------------------------------------------------
  // عمداً خالی — همه‌ی میزهای قبلی (چه نمونه‌های اولیه، چه صندلی‌هاشون) حذف
  // شدن. از این به بعد میزها فقط از تو پنل ادمین («+ افزودن میز») ساخته می‌شن.
  const tableData = [];
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
