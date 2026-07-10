# Roof Reservation

سیستم رزرو لوکس Roof با Express، Prisma، PostgreSQL، HTML/CSS/Vanilla JS و رابط کاملاً RTL.

## راه‌اندازی

1. دیتابیس PostgreSQL را بساز:

```sql
CREATE DATABASE roof_reservation;
```

2. فایل env را بساز:

```bash
cp .env.example .env
```

3. مقدار `DATABASE_URL` را با پسورد PostgreSQL خودت تنظیم کن.

4. نصب پکیج‌ها:

```bash
npm install
```

5. ساخت جدول‌ها و seed اولیه:

```bash
npx prisma migrate dev --name init
npm run db:seed
```

6. اجرا:

```bash
npm run dev
```

سایت:

```text
http://localhost:3000
```

پنل ادمین:

```text
http://localhost:3000/admin-login.html
```

ادمین اولیه پیش‌فرض:

```text
email: admin@roof.local
password: Admin123456
```

## نکته‌ها

- Docker ندارد.
- PostgreSQL از اول استفاده شده.
- SMS فعلاً mock است و در console نمایش داده می‌شود.
- پرداخت فعلاً mock است و سه حالت موفق، ناموفق، نیازمند بررسی دارد.
- نقشه فعلاً فرضی و data-driven است و بعداً با نقشه واقعی جایگزین می‌شود.
