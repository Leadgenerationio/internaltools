/**
 * Submagic API client.
 *
 * Adds AI-powered word-by-word captions, zoom effects, and polishing
 * to assembled videos. Used by the longform video pipeline.
 *
 * Env: SUBMAGIC_API_KEY
 *
 * Important: Submagic requires a publicly accessible video URL.
 * The video must be uploaded to S3/CDN first. If no cloud storage
 * is configured, captioning is skipped and the raw video is returned.
 *
 * API docs: https://docs.submagic.co
 * Flow: create project → poll until completed → export (if needed) → download
 */

import type { CaptionConfig } from '@/lib/longform-types';

const BASE_URL = 'https://api.submagic.co/v1';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes max for download

function getApiKey(): string {
  const key = process.env.SUBMAGIC_API_KEY;
  if (!key) throw new Error('SUBMAGIC_API_KEY not configured');
  return key;
}

function headers() {
  return {
    'x-api-key': getApiKey(),
    'Content-Type': 'application/json',
  };
}

// ─── Templates ──────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/templates`, { headers: headers() });
  if (!res.ok) throw new Error(`Submagic templates failed (${res.status})`);
  const data = await res.json();
  const templates = Array.isArray(data) ? data : data.templates;
  if (Array.isArray(templates)) {
    return templates.map((t: any) => (typeof t === 'string' ? t : t.name || String(t)));
  }
  return [];
}

// ─── Captioning pipeline ────────────────────────────────────────────────────

interface SubmagicProject {
  id: string;
  status: string;
  downloadUrl?: string;
  directUrl?: string;
}

/**
 * Create a Submagic captioning project.
 */
export async function createProject(
  videoUrl: string,
  config: CaptionConfig,
  title: string = 'Ad Factory Video',
  dictionary?: string[],
): Promise<SubmagicProject> {
  const res = await fetch(`${BASE_URL}/projects`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      title,
      language: config.language,
      videoUrl,
      templateName: config.template,
      magicZooms: config.magicZooms,
      magicBrolls: config.magicBrolls ?? false,
      cleanAudio: config.cleanAudio,
      ...(dictionary && { dictionary: dictionary.slice(0, 100) }),
    }),
  });

  if (res.status === 429) throw new Error('Submagic rate limit exceeded (429)');
  if (res.status === 401) throw new Error('Submagic API key invalid (401)');
  if (res.status === 402) throw new Error('Submagic insufficient credits (402)');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Submagic create project failed (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Trigger the export step for a completed Submagic project.
 * Some flows require this before downloadUrl is populated.
 */
export async function exportProject(projectId: string): Promise<SubmagicProject> {
  const res = await fetch(`${BASE_URL}/projects/${projectId}/export`, {
    method: 'POST',
    headers: headers(),
  });

  // Export endpoint may not exist for all plan types — treat 404 as non-fatal
  if (res.status === 404) {
    console.warn(`[submagic] Export endpoint returned 404 for project ${projectId} — may not be needed`);
    return { id: projectId, status: 'completed' };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Submagic export failed (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Poll a Submagic project until completion.
 * If status=completed but no downloadUrl, tries calling export once.
 */
export async function waitForProject(projectId: string): Promise<SubmagicProject> {
  const start = Date.now();
  let exportTriggered = false;

  while (Date.now() - start < MAX_POLL_TIME_MS) {
    const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
      headers: headers(),
    });

    if (!res.ok) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    const project: SubmagicProject = await res.json();

    if (project.status === 'completed' && (project.downloadUrl || project.directUrl)) {
      return project;
    }

    // If completed but no download URL, trigger export (once)
    if (project.status === 'completed' && !project.downloadUrl && !project.directUrl && !exportTriggered) {
      try {
        const exported = await exportProject(projectId);
        exportTriggered = true;
        if (exported.downloadUrl || exported.directUrl) return exported;
        // If still no URL, continue polling — export may be async
      } catch (err: any) {
        console.warn(`[submagic] Export call failed: ${err.message}, continuing to poll`);
        exportTriggered = true; // don't retry
      }
    }

    if (project.status === 'failed') {
      throw new Error(`Submagic captioning failed for project ${projectId}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Submagic captioning timed out after ${MAX_POLL_TIME_MS / 1000}s`);
}

/**
 * Download the captioned video to disk using streaming (no full-buffer OOM risk).
 */
export async function downloadResult(
  downloadUrl: string,
  outputPath: string,
): Promise<void> {
  const fsMod = await import('fs');
  const fsp = await import('fs/promises');
  const pathMod = await import('path');

  await fsp.mkdir(pathMod.dirname(outputPath), { recursive: true });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(downloadUrl, {
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Submagic download failed (${res.status})`);
    if (!res.body) throw new Error('Submagic download returned empty body');

    // Write to disk — try streaming first, fall back to buffer
    let written = false;
    try {
      const { Readable } = await import('stream');
      if (typeof Readable.fromWeb === 'function') {
        const { pipeline } = await import('stream/promises');
        const nodeStream = Readable.fromWeb(res.body as any);
        const writeStream = fsMod.createWriteStream(outputPath);
        await pipeline(nodeStream, writeStream);
        written = true;
      }
    } catch { /* Readable.fromWeb not available in this runtime */ }

    if (!written) {
      // Fallback: buffer then write (works in all Node.js versions / Next.js standalone)
      const buffer = Buffer.from(await res.arrayBuffer());
      await fsp.writeFile(outputPath, buffer);
    }

    // Validate the downloaded file
    const stat = await fsp.stat(outputPath);
    if (stat.size < 1000) {
      throw new Error(`Downloaded captioned video is too small (${stat.size} bytes)`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full caption pipeline: create project → poll → export if needed → download.
 */
export async function captionVideo(
  videoUrl: string,
  outputPath: string,
  config: CaptionConfig,
  title?: string,
  dictionary?: string[],
): Promise<string> {
  const project = await createProject(videoUrl, config, title, dictionary);
  const result = await waitForProject(project.id);

  const url = result.downloadUrl || result.directUrl;
  if (!url) {
    throw new Error('Submagic returned no download URL');
  }

  await downloadResult(url, outputPath);
  return outputPath;
}
