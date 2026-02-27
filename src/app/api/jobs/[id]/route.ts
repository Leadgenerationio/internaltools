/**
 * Job status API — GET /api/jobs/[id]?type=render|video-gen
 *
 * Returns the current state, progress, and result of a background job.
 * Auth-gated: job must belong to the caller's company.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { getRenderQueue, getVideoGenQueue } from '@/lib/queue';
import type { JobType, JobStatus } from '@/lib/job-types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  const jobId = params.id;
  const type = request.nextUrl.searchParams.get('type') as JobType;

  if (!type || !['render', 'video-gen'].includes(type)) {
    return NextResponse.json({ error: 'Invalid or missing job type parameter' }, { status: 400 });
  }

  const queue = type === 'render' ? getRenderQueue() : getVideoGenQueue();
  if (!queue) {
    return NextResponse.json({ error: 'Job queue not available' }, { status: 503 });
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Auth check: job must belong to the same company
  if (job.data.companyId !== authResult.auth.companyId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : 0;

  const status: JobStatus = {
    id: job.id!,
    type,
    state: ['waiting', 'delayed', 'prioritized', 'wait'].includes(state) ? 'waiting'
         : state === 'active' ? 'active'
         : state === 'completed' ? 'completed'
         : 'failed',
    progress,
    createdAt: job.timestamp,
  };

  if (state === 'completed') {
    status.result = job.returnvalue;
  }

  if (state === 'failed') {
    status.error = job.failedReason || 'Unknown error';
  }

  return NextResponse.json(status);
}
