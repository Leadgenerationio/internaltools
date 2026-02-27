/**
 * Type-safe job payloads for BullMQ background jobs.
 */

import type { TextOverlay, MusicTrack, UploadedVideo } from '@/lib/types';

// ─── Render Job ──────────────────────────────────────────────────────────────

export interface RenderJobData {
  /** Auth context */
  companyId: string;
  userId: string;

  /** Render inputs — one video per item, each with overlays */
  items: RenderJobItem[];

  /** Music config (shared across all items) */
  music: MusicTrack | null;

  /** Render quality */
  quality: 'draft' | 'final';

  /** Token cost already deducted */
  tokenCost: number;
}

export interface RenderJobItem {
  video: UploadedVideo;
  overlays: TextOverlay[];
  adLabel: string;
}

export interface RenderJobResult {
  results: RenderResultItem[];
  failed: number;
  tokensUsed: number;
}

export interface RenderResultItem {
  videoId: string;
  originalName: string;
  adLabel: string;
  outputUrl: string;
}

// ─── Video Generation Job ────────────────────────────────────────────────────

export interface VideoGenJobData {
  /** Auth context */
  companyId: string;
  userId: string;

  /** Generation inputs */
  prompt: string;
  count: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
  model: string;
  includeSound: boolean;
  apiType: 'veo' | 'market';

  /** Token cost already deducted */
  tokenCost: number;
}

export interface VideoGenJobResult {
  videos: VideoGenResultItem[];
  failed: number;
  tokensUsed: number;
  warning?: string;
}

export interface VideoGenResultItem {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  duration: number;
  width: number;
  height: number;
  thumbnail: string;
}

// ─── Job Status (returned by /api/jobs/[id]) ─────────────────────────────────

export type JobType = 'render' | 'video-gen';

export interface JobStatus {
  id: string;
  type: JobType;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number; // 0-100
  result?: RenderJobResult | VideoGenJobResult;
  error?: string;
  createdAt: number; // timestamp ms
}
