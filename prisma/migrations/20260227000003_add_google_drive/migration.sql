-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleDriveRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "googleDriveConnected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "googleDriveEmail" TEXT;
