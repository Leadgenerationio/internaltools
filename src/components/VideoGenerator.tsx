'use client';

import { useState, useRef } from 'react';
import type { UploadedVideo } from '@/lib/types';
import { VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from '@/lib/types';
import { pollJob } from '@/lib/poll-job';

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
const ALL_ASPECT_OPTIONS = [
  { value: '9:16' as const, label: '9:16 Portrait' },
  { value: '16:9' as const, label: '16:9 Landscape' },
  { value: '1:1' as const, label: '1:1 Square' },
];

interface GenerationBatch {
  prompt: string;
  count: number;
  videoIds: string[];
}

export default function VideoGenerator({ videos, onUpload, generating, setGenerating }: Props) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(2);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [model, setModel] = useState(DEFAULT_VIDEO_MODEL);
  const [includeSound, setIncludeSound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [batches, setBatches] = useState<GenerationBatch[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const selectedModel = VIDEO_MODELS.find((m) => m.id === model) || VIDEO_MODELS[0];
  const aspectOptions = ALL_ASPECT_OPTIONS.filter((opt) => selectedModel.aspectRatios.includes(opt.value));
  const canGenerate = prompt.trim().length > 0 && !generating;
  const aiVideoCount = videos.filter((v) => v.originalName.startsWith('AI:')).length;

  // Reset aspect ratio if current selection isn't supported by the new model
  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    const m = VIDEO_MODELS.find((v) => v.id === newModel);
    if (m && !m.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(m.aspectRatios[0] as '9:16' | '16:9' | '1:1');
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
    setStatusMessage('Generation cancelled.');
  };

  const handleGenerationSuccess = (generatedVideos: UploadedVideo[], currentPrompt: string) => {
    const promptLabel = currentPrompt.length > 40
      ? currentPrompt.slice(0, 40) + '...'
      : currentPrompt;
    const labelledVideos = generatedVideos.map((v, i) => ({
      ...v,
      originalName: `AI: ${promptLabel}${generatedVideos.length > 1 ? ` (${i + 1})` : ''}`,
    }));

    onUpload([...videos, ...labelledVideos]);

    setBatches((prev) => [
      ...prev,
      {
        prompt: currentPrompt,
        count: labelledVideos.length,
        videoIds: labelledVideos.map((v) => v.id),
      },
    ]);

    setStatusMessage(`Generated ${generatedVideos.length} video${generatedVideos.length > 1 ? 's' : ''}. Enter a new prompt to generate more.`);
    setPrompt('');
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;

    const currentPrompt = prompt.trim();
    const abort = new AbortController();
    abortRef.current = abort;

    setGenerating(true);
    setError(null);
    setStatusMessage(`Generating ${count} video${count > 1 ? 's' : ''} with ${selectedModel.label}... This can take a few minutes.`);

    log('info', 'Starting AI video generation', { prompt: currentPrompt.slice(0, 100), count, aspectRatio, model });

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentPrompt, count, aspectRatio, model, includeSound }),
        signal: abort.signal,
      });

      let data: any;
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

      // Background job path — poll for results
      if (data.jobId) {
        log('info', 'Video generation job queued', { jobId: data.jobId });
        setStatusMessage(`Generating ${count} video${count > 1 ? 's' : ''} in background... 0%`);

        const result = await pollJob(data.jobId, 'video-gen', {
          signal: abort.signal,
          onProgress: (progress, state) => {
            if (state === 'waiting') {
              setStatusMessage(`Queued — waiting to start...`);
            } else {
              setStatusMessage(`Generating ${count} video${count > 1 ? 's' : ''}... ${progress}%`);
            }
          },
        });

        if (result.state === 'failed') {
          setError(result.error || 'Video generation failed');
          setStatusMessage('');
          return;
        }

        const jobResult = result.result;
        if (jobResult?.videos?.length > 0) {
          log('info', 'Generation success (background)', { count: jobResult.videos.length });
          handleGenerationSuccess(jobResult.videos, currentPrompt);
          if (jobResult.warning) {
            setStatusMessage(jobResult.warning);
          }
        } else {
          setError('No videos returned');
          setStatusMessage('');
        }
        return;
      }

      // Synchronous path (no Redis) — results returned directly
      if (data.videos && data.videos.length > 0) {
        log('info', 'Generation success', { count: data.videos.length });
        handleGenerationSuccess(data.videos, currentPrompt);
      } else {
        log('warn', 'No videos in generation response', { data });
        setError(data.error || 'No videos returned');
        setStatusMessage('');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      log('error', 'Generation exception', { error: String(err) });
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStatusMessage('');
    } finally {
      abortRef.current = null;
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

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Model</label>
          <div className="relative">
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={generating}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 pr-8 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer disabled:opacity-50"
            >
              {VIDEO_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.priceLabel})
                </option>
              ))}
            </select>
            <svg
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Aspect ratio</label>
          <div className="flex gap-1.5">
            {aspectOptions.map((opt) => (
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

      {/* Include sound toggle — only for models that support audio */}
      {selectedModel.supportsSound && (
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={includeSound}
              onChange={(e) => setIncludeSound(e.target.checked)}
              disabled={generating}
              className="sr-only peer"
            />
            <div className="w-10 h-6 bg-gray-700 rounded-full peer-checked:bg-blue-600 transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
          <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
            Include AI-generated sound
          </span>
          <span className="text-xs text-gray-500">(disable for silent background videos)</span>
        </label>
      )}

      {/* Generate / Cancel button */}
      {generating ? (
        <div className="flex gap-2">
          <div className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-gray-700 text-gray-300 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating...
          </div>
          <button
            onClick={handleCancel}
            className="px-4 py-2.5 rounded-xl font-semibold text-sm text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/50 border border-red-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${
            !canGenerate
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20'
          }`}
        >
          {`Generate ${count} Video${count > 1 ? 's' : ''} (${count * selectedModel.tokenCost} tokens)`}
        </button>
      )}

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
