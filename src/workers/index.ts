/**
 * Worker entry point — starts all BullMQ workers.
 *
 * Run with: npx tsx src/workers/index.ts
 * In production (Docker), set WORKER_MODE=true to start this instead of the web server.
 */

import { startRenderWorker } from './render-worker';
import { startVideoGenWorker } from './video-gen-worker';
import { startEmailWorker } from './email-worker';

console.log('[Workers] Starting all workers...');

const renderWorker = startRenderWorker();
const videoGenWorker = startVideoGenWorker();
const emailWorker = startEmailWorker();

if (!renderWorker && !videoGenWorker && !emailWorker) {
  console.error('[Workers] No workers started — is REDIS_URL configured?');
  process.exit(1);
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[Workers] Received ${signal}, shutting down...`);
  const closePromises: Promise<void>[] = [];
  if (renderWorker) closePromises.push(renderWorker.close());
  if (videoGenWorker) closePromises.push(videoGenWorker.close());
  if (emailWorker) closePromises.push(emailWorker.close());

  try {
    await Promise.allSettled(closePromises);
    console.log('[Workers] All workers stopped.');
  } catch (err) {
    console.error('[Workers] Error during shutdown:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[Workers] All workers started. Waiting for jobs...');
