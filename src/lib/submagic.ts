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
 */

import type { CaptionConfig } from '@/lib/longform-types';

const BASE_URL = 'https://api.submagic.co/v1';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes

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
  if (Array.isArray(data)) {
    return data.map((t: any) => t.name || t);
  }
  return [];
}

// ─── Captioning pipeline ────────────────────────────────────────────────────

interface SubmagicProject {
  id: string;
  status: string;
  downloadUrl?: string;
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
      magicBrolls: false, // we supply our own b-roll
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
 * Poll a Submagic project until completion.
 */
export async function waitForProject(projectId: string): Promise<SubmagicProject> {
  const start = Date.now();

  while (Date.now() - start < MAX_POLL_TIME_MS) {
    const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
      headers: headers(),
    });

    if (!res.ok) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    const project: SubmagicProject = await res.json();

    if (project.status === 'completed') {
      return project;
    }

    if (project.status === 'failed') {
      throw new Error(`Submagic captioning failed for project ${projectId}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Submagic captioning timed out after ${MAX_POLL_TIME_MS / 1000}s`);
}

/**
 * Download the captioned video to disk.
 */
export async function downloadResult(
  downloadUrl: string,
  outputPath: string,
): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const res = await fetch(downloadUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Submagic download failed (${res.status})`);

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

/**
 * Full caption pipeline: create project → poll → download.
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

  if (!result.downloadUrl) {
    throw new Error('Submagic returned no download URL');
  }

  await downloadResult(result.downloadUrl, outputPath);
  return outputPath;
}
