-- AlterTable
ALTER TABLE "StorageFile" ADD COLUMN "originalName" TEXT,
ADD COLUMN "duration" DOUBLE PRECISION,
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "thumbnailUrl" TEXT;

-- CreateIndex
CREATE INDEX "StorageFile_companyId_mimeType_idx" ON "StorageFile"("companyId", "mimeType");

-- CreateIndex (unique constraint for upsert deduplication)
CREATE UNIQUE INDEX "StorageFile_companyId_storagePath_key" ON "StorageFile"("companyId", "storagePath");
