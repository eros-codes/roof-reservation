/*
  Warnings:

  - You are about to drop the column `code` on the `OtpCode` table. All the data in the column will be lost.
  - Added the required column `codeHash` to the `OtpCode` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OtpCode" DROP COLUMN "code",
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeHash" TEXT NOT NULL;
