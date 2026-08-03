-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Reservation_status_startAt_reminderSentAt_idx" ON "Reservation"("status", "startAt", "reminderSentAt");
