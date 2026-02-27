/**
 * Client-side job polling utility.
 *
 * Polls /api/jobs/[id] with exponential backoff until the job completes or fails.
 * Used by render and video generation flows when background jobs are available.
 */

export type JobState = 'waiting' | 'active' | 'completed' | 'failed';

export interface PollJobResult {
  id: string;
  type: string;
  state: JobState;
  progress: number;
  result?: any;
  error?: string;
}

const POLL_INTERVALS = [3000, 5000, 10000, 15000]; // exponential backoff
const DEFAULT_MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes max

/**
 * Poll a background job until it completes or fails.
 * Returns the final job status.
 */
export async function pollJob(
  jobId: string,
  type: 'render' | 'video-gen',
  options: {
    onProgress?: (progress: number, state: JobState) => void;
    signal?: AbortSignal;
    maxPollMs?: number;
  } = {}
): Promise<PollJobResult> {
  const { onProgress, signal, maxPollMs = DEFAULT_MAX_POLL_MS } = options;
  let pollIndex = 0;
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > maxPollMs) {
      return {
        id: jobId,
        type,
        state: 'failed',
        progress: 0,
        error: 'Job polling timed out. The job may still be running — refresh to check.',
      };
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const delay = POLL_INTERVALS[Math.min(pollIndex, POLL_INTERVALS.length - 1)];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const res = await fetch(`/api/jobs/${jobId}?type=${type}`, { signal });
      if (!res.ok) {
        pollIndex++;
        continue;
      }

      const data: PollJobResult = await res.json();
      onProgress?.(data.progress, data.state);

      if (data.state === 'completed' || data.state === 'failed') {
        return data;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      // Network error — keep polling
    }

    pollIndex++;
  }
}
