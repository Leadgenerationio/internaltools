-- Add tag column to StorageFile for media categorization
ALTER TABLE "StorageFile" ADD COLUMN "tag" TEXT;
CREATE INDEX "StorageFile_companyId_tag_idx" ON "StorageFile"("companyId", "tag");
