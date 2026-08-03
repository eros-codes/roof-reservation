-- Keep the enum finalization harmless for fresh databases.
ALTER TABLE "AdminUser" ALTER COLUMN "role" SET DEFAULT 'SECONDARY';
