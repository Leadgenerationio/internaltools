-- CreateEnum
CREATE TYPE "AdminAction" AS ENUM ('GRANT_TOKENS', 'CHANGE_PLAN', 'SUSPEND', 'UNSUSPEND', 'IMPERSONATE', 'ADJUST_BALANCE');

-- AlterTable: Add suspension fields to Company
ALTER TABLE "Company" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendedReason" TEXT;

-- CreateTable: AdminAuditLog
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" "AdminAction" NOT NULL,
    "targetCompanyId" TEXT,
    "targetUserId" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminUserId_createdAt_idx" ON "AdminAuditLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetCompanyId_createdAt_idx" ON "AdminAuditLog"("targetCompanyId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
