/**
 * Storage abstraction — uses local filesystem by default,
 * switches to S3-compatible storage (Cloudflare R2, AWS S3, etc.)
 * when S3_BUCKET is configured.
 *
 * To enable cloud storage, set these env vars:
 *   S3_BUCKET=your-bucket-name
 *   S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com  (for R2)
 *   S3_ACCESS_KEY_ID=your-access-key
 *   S3_SECRET_ACCESS_KEY=your-secret-key
 *   S3_PUBLIC_URL=https://your-public-bucket-url.com  (optional, for public URLs)
 */

import fs from 'fs';
import path from 'path';

const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL;

export const isCloudStorage = !!(S3_BUCKET && S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);

// Lazy-load S3 client only when needed
let s3Client: any = null;

async function getS3Client() {
  if (s3Client) return s3Client;
  if (!isCloudStorage) throw new Error('Cloud storage not configured');

  // Dynamic import to avoid bundling AWS SDK when not used
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3Client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID!,
      secretAccessKey: S3_SECRET_ACCESS_KEY!,
    },
  });
  return s3Client;
}

/**
 * Upload a file to storage.
 * Returns the public URL path for the file.
 */
export async function uploadFile(localPath: string, storagePath: string): Promise<string> {
  if (!isCloudStorage) {
    // Local storage — file is already on disk, just return the public URL path
    return `/${storagePath}`;
  }

  const client = await getS3Client();
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const fileBuffer = fs.readFileSync(localPath);

  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: storagePath,
    Body: fileBuffer,
    ContentType: getContentType(storagePath),
  }));

  // Clean up local file after upload
  try { fs.unlinkSync(localPath); } catch { /* ignore */ }

  return S3_PUBLIC_URL
    ? `${S3_PUBLIC_URL}/${storagePath}`
    : `/${storagePath}`;
}

/**
 * Check if a file exists in storage
 */
export async function fileExists(storagePath: string): Promise<boolean> {
  if (!isCloudStorage) {
    return fs.existsSync(path.join(process.cwd(), 'public', storagePath));
  }

  try {
    const client = await getS3Client();
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: storagePath,
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a file from storage
 */
export async function deleteFile(storagePath: string): Promise<void> {
  if (!isCloudStorage) {
    const fullPath = path.join(process.cwd(), 'public', storagePath);
    try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
    return;
  }

  try {
    const client = await getS3Client();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: storagePath,
    }));
  } catch { /* ignore */ }
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.zip': 'application/zip',
  };
  return types[ext] || 'application/octet-stream';
}
