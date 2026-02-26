-- CreateEnum
CREATE TYPE "TokenTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "TokenReason" AS ENUM ('PLAN_ALLOCATION', 'TOPUP_PURCHASE', 'ADMIN_GRANT', 'GENERATE_ADS', 'GENERATE_VIDEO', 'RENDER', 'REFUND', 'EXPIRY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TopupStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- AlterTable
ALTER TABLE "ApiUsageLog" ADD COLUMN     "tokensCost" INTEGER;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "monthlyTokenBudget" INTEGER,
ADD COLUMN     "tokenBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TokenTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "TokenTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "TokenReason" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "apiUsageLogId" TEXT,
    "stripePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TokenTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenTopup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenAmount" INTEGER NOT NULL,
    "pricePence" INTEGER NOT NULL,
    "stripeSessionId" TEXT,
    "stripePaymentId" TEXT,
    "status" "TopupStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TokenTopup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransaction_apiUsageLogId_key" ON "TokenTransaction"("apiUsageLogId");

-- CreateIndex
CREATE INDEX "TokenTransaction_companyId_createdAt_idx" ON "TokenTransaction"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenTransaction_companyId_type_createdAt_idx" ON "TokenTransaction"("companyId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTopup_stripeSessionId_key" ON "TokenTopup"("stripeSessionId");

-- CreateIndex
CREATE INDEX "TokenTopup_companyId_createdAt_idx" ON "TokenTopup"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTransaction" ADD CONSTRAINT "TokenTransaction_apiUsageLogId_fkey" FOREIGN KEY ("apiUsageLogId") REFERENCES "ApiUsageLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTopup" ADD CONSTRAINT "TokenTopup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTopup" ADD CONSTRAINT "TokenTopup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
