-- Convert the legacy admin roles to the new enum values in a PostgreSQL-safe way.
ALTER TABLE "AdminUser" ALTER COLUMN "role" DROP DEFAULT;

ALTER TYPE "AdminRole" RENAME TO "AdminRole_old";
CREATE TYPE "AdminRole" AS ENUM ('MAIN', 'SECONDARY');

ALTER TABLE "AdminUser"
  ALTER COLUMN "role" TYPE "AdminRole"
  USING (
    CASE
      WHEN "role"::text = 'OWNER' THEN 'MAIN'::"AdminRole"
      WHEN "role"::text IN ('MANAGER', 'RECEPTION') THEN 'SECONDARY'::"AdminRole"
      ELSE 'SECONDARY'::"AdminRole"
    END
  );

ALTER TABLE "AdminUser" ALTER COLUMN "role" SET DEFAULT 'SECONDARY';
DROP TYPE "AdminRole_old";
