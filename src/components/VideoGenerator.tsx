'use client';

import { useState, useRef } from 'react';
import type { UploadedVideo } from '@/lib/types';

const log = async (level: string, message: string, meta?: object) => {
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, ...meta }),
    });
  } catch {
    console.log(`[${level}]`, message, meta);
  }
};

interface Props {
  videos: UploadedVideo[];
  onUpload: (videos: UploadedVideo[]) => void;
  generating: boolean;
  setGenerating: (v: boolean) => void;
}

const COUNT_OPTIONS = [1, 2, 3, 4] as const;
const DURATION_OPTIONS = ['4', '6', '8'] as const;
const ASPECT_OPTIONS = [
  { value: '9:16' as const, label: '9:16 Portrait' },
  { value: '16:9' as const, label: '16:9 Landscape' },
];

interface GenerationBatch {
  prompt: string;
  count: number;
  videoIds: string[];
}

export default function VideoGenerator({ videos, onUpload, generating, setGenerating }: Props) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(2);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [duration, setDuration] = useState<'4' | '6' | '8'>('6');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [batches, setBatches] = useState<GenerationBatch[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const canGenerate = prompt.trim().length > 0 && !generating;
  const aiVideoCount = videos.filter((v) => v.originalName.startsWith('AI:')).length;

  const handleGenerate = async () => {
    if (!canGenerate) return;

    const currentPrompt = prompt.trim();
    setGenerating(true);
    setError(null);
    setStatusMessage(`Generating ${count} video${count > 1 ? 's' : ''}... This can take a few minutes.`);

    log('info', 'Starting AI video generation', { prompt: currentPrompt.slice(0, 100), count, aspectRatio, duration });

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentPrompt, count, aspectRatio, duration }),
      });

      let data: { videos?: UploadedVideo[]; error?: string };
      try {
        data = await res.json();
      } catch {
        data = { error: `Generation failed (${res.status})` };
      }

      if (!res.ok) {
        log('error', 'Generation failed', { status: res.status, error: data.error });
        setError(data.error || `Generation failed (${res.status})`);
        setStatusMessage('');
        return;
      }

      if (data.videos && data.videos.length > 0) {
        log('info', 'Generation success', { count: data.videos.length });

        // Label videos with prompt snippet
        const promptLabel = currentPrompt.length > 40
          ? currentPrompt.slice(0, 40) + '...'
          : currentPrompt;
        const labelledVideos = data.videos.map((v, i) => ({
          ...v,
          originalName: `AI: ${promptLabel}${data.videos!.length > 1 ? ` (${i + 1})` : ''}`,
        }));

        onUpload([...videos, ...labelledVideos]);

        // Track batch
        setBatches((prev) => [
          ...prev,
          {
            prompt: currentPrompt,
            count: labelledVideos.length,
            videoIds: labelledVideos.map((v) => v.id),
          },
        ]);

        setStatusMessage(`Generated ${data.videos.length} video${data.videos.length > 1 ? 's' : ''}. Enter a new prompt to generate more.`);
        setPrompt('');
      } else {
        log('warn', 'No videos in generation response', { data });
        setError(data.error || 'No videos returned');
        setStatusMessage('');
      }
    } catch (err) {
      log('error', 'Generation exception', { error: String(err) });
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStatusMessage('');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Show existing AI videos count */}
      {aiVideoCount > 0 && !generating && (
        <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
          <p className="text-sm text-gray-300">
            <span className="text-white font-medium">{aiVideoCount} AI video{aiVideoCount !== 1 ? 's' : ''}</span> generated
            {batches.length > 0 && ` from ${batches.length} prompt${batches.length !== 1 ? 's' : ''}`}.
            Add more below with a different prompt, or go back to upload to add your own.
          </p>
        </div>
      )}

      {/* Prompt */}
      <div>
        <label htmlFor="ai-prompt" className="block text-sm font-medium text-gray-300 mb-1.5">
          {aiVideoCount > 0 ? 'Next video prompt' : 'Describe your video'}
        </label>
        <textarea
          id="ai-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={generating}
          placeholder={
            aiVideoCount > 0
              ? 'Describe a different scene for your next batch of videos...'
              : 'A drone shot of a modern house with solar panels at sunset, cinematic lighting...'
          }
          rows={3}
          className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none"
        />
      </div>

      {/* Options row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Count */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Videos per prompt</label>
          <div className="flex gap-1.5">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                disabled={generating}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  count === n
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                } disabled:opacity-50`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Duration</label>
          <div className="flex gap-1.5">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                disabled={generating}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  duration === d
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                } disabled:opacity-50`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Aspect ratio</label>
          <div className="flex gap-1.5">
            {ASPECT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAspectRatio(opt.value)}
                disabled={generating}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  aspectRatio === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                } disabled:opacity-50`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${
          !canGenerate
            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20'
        }`}
      >
        {generating ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating...
          </span>
        ) : (
          `Generate ${count} Video${count > 1 ? 's' : ''}`
        )}
      </button>

      {/* Status message */}
      {statusMessage && (
        <div className={`flex items-center gap-3 p-3 rounded-lg text-sm ${
          generating
            ? 'bg-blue-900/30 border border-blue-700 text-blue-300'
            : 'bg-green-900/30 border border-green-700 text-green-300'
        }`}>
          {generating && (
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
          )}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Previous batches */}
      {batches.length > 0 && !generating && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">Generation history</p>
          {batches.map((batch, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
              <span className="text-gray-500 font-mono w-4">{i + 1}.</span>
              <span className="truncate flex-1">{batch.prompt}</span>
              <span className="shrink-0 text-gray-500">{batch.count} video{batch.count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 text-red-400 hover:text-red-200 p-1 rounded"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
