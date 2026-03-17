'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { CaptionConfig, LongformResultItem } from '@/lib/longform-types';
import type { MusicTrack } from '@/lib/types';

const GoogleDriveButton = dynamic(() => import('@/components/GoogleDriveButton'), { ssr: false });

function normalizeVideoUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('/api/files')) return url;
  if (url.startsWith('/')) return url;
  const match = url.match(/\/object\/public\/[^/]+\/(.+)$/);
  if (match) return `/api/files?path=${encodeURIComponent(match[1])}`;
  const pathMatch = url.match(/(outputs\/[^\s?#]+|longform\/[^\s?#]+|uploads\/[^\s?#]+)/);
  if (pathMatch) return `/api/files?path=${encodeURIComponent(pathMatch[1])}`;
  return url;
}

interface UploadedVideo {
  path: string;
  originalName: string;
  duration: number;
  width: number;
  height: number;
}

interface SceneData {
  start: number;
  end: number;
  clipUrl: string;
  source: string;
}

interface Props {
  uploadedVideo: UploadedVideo;
  extractedAudioUrl: string;
  scenes: SceneData[];
  music: MusicTrack | null;
  captionConfig: CaptionConfig;
  aspectRatio: string;
  onAspectRatioChange: (ar: string) => void;
  results: LongformResultItem[];
  onResults: (results: LongformResultItem[]) => void;
  onStartNew: () => void;
}

const ASPECT_RATIOS = [
  { value: '9:16', label: 'Vertical (9:16)', desc: 'TikTok, Reels, Shorts' },
  { value: '16:9', label: 'Landscape (16:9)', desc: 'YouTube, Facebook' },
  { value: '1:1', label: 'Square (1:1)', desc: 'Instagram, Facebook' },
];

export default function FinalizeFromVideoStep({
  uploadedVideo, extractedAudioUrl, scenes, music, captionConfig,
  aspectRatio, onAspectRatioChange, results, onResults, onStartNew,
}: Props) {
  const [producing, setProducing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const replacedCount = scenes.filter((s) => s.clipUrl && s.source !== 'original').length;

  const handleProduce = async () => {
    setProducing(true);
    setError(null);
    setProgressMsg('Submitting...');
    setProgressPct(0);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch('/api/longform-from-video/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          originalVideoPath: uploadedVideo.path,
          extractedAudioUrl,
          scenes: scenes.map((s) => ({
            start: s.start,
            end: s.end,
            clipUrl: s.clipUrl && s.source !== 'original' ? s.clipUrl : undefined,
          })),
          music: music ? { url: music.file, volume: music.volume } : null,
          captionConfig,
          aspectRatio,
        }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server error (${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }

      // Background job path
      if (data.jobId) {
        setProgressMsg('Producing video...');
        const { pollJob } = await import('@/lib/poll-job');
        const result = await pollJob(data.jobId, 'longform', {
          signal: abort.signal,
          onProgress: (progress) => {
            setProgressPct(progress);
            setProgressMsg(`Producing... ${progress}%`);
          },
        });

        if (result.state === 'failed') {
          throw new Error(result.error || 'Job failed');
        }

        if (result.result?.videos?.length) {
          onResults(result.result.videos);
        }
      } else if (data.videos?.length) {
        // Sync path
        onResults(data.videos);
      }

      // Show captioning warnings
      if (data.warning) {
        setWarning(data.warning);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Cancelled');
      } else {
        setError(err.message);
      }
    } finally {
      setProducing(false);
      setProgressMsg('');
      abortRef.current = null;
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const normalized = normalizeVideoUrl(url);
      const res = await fetch(normalized);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `longform_from_video.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { /* ignore */ }
  };

  // Results view
  if (results.length > 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">Your Video Is Ready</h2>
          <p className="text-gray-400 text-sm">Video produced successfully.</p>
        </div>
        {warning && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-4 py-3 text-yellow-300 text-sm">
            {warning}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {results.map((r, idx) => (
            <div key={idx} className="bg-gray-800/60 rounded-xl overflow-hidden border border-gray-700/50">
              <video
                src={normalizeVideoUrl(r.videoUrl)}
                className="w-full aspect-video bg-black"
                controls
                muted
              />
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Final Video</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">{r.durationSeconds?.toFixed(1)}s</span>
                    {r.captioned && (
                      <span className="bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">Captioned</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(r.videoUrl)}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Download
                </button>
                <GoogleDriveButton
                  files={[{ url: normalizeVideoUrl(r.videoUrl), name: `longform_from_video.mp4` }]}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-center pt-4">
          <button
            onClick={onStartNew}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            Start New Video
          </button>
        </div>
      </div>
    );
  }

  // Production view
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Finalize & Produce</h2>
        <p className="text-gray-400 text-sm">Choose your output format and produce your final video.</p>
      </div>

      {/* Aspect ratio */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Output Format</label>
        <div className="grid grid-cols-3 gap-3">
          {ASPECT_RATIOS.map((ar) => (
            <button
              key={ar.value}
              onClick={() => onAspectRatioChange(ar.value)}
              disabled={producing}
              className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                aspectRatio === ar.value
                  ? 'border-blue-600 bg-blue-600/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="font-medium text-sm">{ar.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{ar.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50 space-y-3">
        <h3 className="font-semibold text-gray-300">Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Source video</span>
            <span className="truncate ml-4 max-w-[200px]">{uploadedVideo.originalName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Duration</span>
            <span>{uploadedVideo.duration.toFixed(1)}s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Scenes</span>
            <span>{scenes.length} ({replacedCount} with b-roll)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Music</span>
            <span>{music ? music.name : 'None'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Captions</span>
            <span>{captionConfig.enabled ? captionConfig.template : 'None'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Format</span>
            <span>{aspectRatio}</span>
          </div>
        </div>
        <div className="border-t border-gray-700 pt-3 flex justify-between text-sm">
          <span className="text-gray-400">Assembly cost</span>
          <span className="text-green-400 font-medium">FREE</span>
        </div>
      </div>

      {/* Progress */}
      {producing && (
        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm font-medium">{progressMsg || 'Producing...'}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <button
            onClick={() => abortRef.current?.abort()}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-gray-800">
        <button
          onClick={handleProduce}
          disabled={producing}
          className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors text-lg"
        >
          {producing ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Producing...
            </span>
          ) : (
            'Produce Video'
          )}
        </button>
      </div>
    </div>
  );
}
