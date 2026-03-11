import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface SaveToMediaLibraryParams {
  companyId: string;
  storagePath: string;
  publicUrl: string;
  sizeBytes: number;
  mimeType: string;
  originalName: string;
  duration: number;
  width: number;
  height: number;
  thumbnailUrl?: string;
}

/**
 * Persist a video to the company's media library (StorageFile table).
 * Uses upsert to deduplicate on companyId + storagePath.
 * Fire-and-forget — callers should wrap in try/catch so DB failures never block video delivery.
 */
export async function saveToMediaLibrary(params: SaveToMediaLibraryParams): Promise<string | null> {
  try {
    const record = await prisma.storageFile.upsert({
      where: {
        companyId_storagePath: {
          companyId: params.companyId,
          storagePath: params.storagePath,
        },
      },
      update: {
        originalName: params.originalName,
        duration: params.duration,
        width: params.width,
        height: params.height,
        thumbnailUrl: params.thumbnailUrl ?? null,
      },
      create: {
        companyId: params.companyId,
        storagePath: params.storagePath,
        publicUrl: params.publicUrl,
        sizeBytes: BigInt(params.sizeBytes),
        mimeType: params.mimeType,
        originalName: params.originalName,
        duration: params.duration,
        width: params.width,
        height: params.height,
        thumbnailUrl: params.thumbnailUrl ?? null,
      },
    });
    return record.id;
  } catch (err) {
    logger.error('saveToMediaLibrary failed', { error: String(err), storagePath: params.storagePath });
    return null;
  }
}
