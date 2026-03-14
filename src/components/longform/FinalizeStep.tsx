'use client';

import { useState } from 'react';
import type { LongformScriptV2, CaptionConfig, LongformResultItem } from '@/lib/longform-types';
import type { MusicTrack } from '@/lib/types';

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

interface Props {
  scripts: LongformScriptV2[];
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

export default function FinalizeStep({
  scripts, music, captionConfig, aspectRatio,
  onAspectRatioChange, results, onResults, onStartNew,
}: Props) {
  const [producing, setProducing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allScenesReady = scripts.every((s) =>
    s.scenes.every((sc) => sc.clipUrl) && s.voiceoverUrl
  );

  const handleProduce = async () => {
    setProducing(true);
    setError(null);

    try {
      const res = await fetch('/api/longform/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variants: scripts.map((s) => ({
            scriptId: s.id,
            variant: s.variant,
            voiceoverUrl: s.voiceoverUrl,
            scenes: s.scenes.map((sc) => ({
              clipUrl: sc.clipUrl,
              order: sc.order,
            })),
          })),
          music: music ? { url: music.file, volume: music.volume } : null,
          captionConfig,
          aspectRatio,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }

      onResults(data.videos || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProducing(false);
    }
  };

  const handleDownload = async (url: string, variant: string) => {
    try {
      const normalized = normalizeVideoUrl(url);
      const res = await fetch(normalized);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `longform_${variant}.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { /* ignore */ }
  };

  // Results view
  if (results.length > 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">Your Videos Are Ready</h2>
          <p className="text-gray-400 text-sm">{results.length} video{results.length !== 1 ? 's' : ''} produced successfully.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {results.map((r, idx) => (
            <div key={idx} className="bg-gray-800/60 rounded-xl overflow-hidden border border-gray-700/50">
              <video
                src={normalizeVideoUrl(r.videoUrl)}
                className="w-full aspect-video bg-black"
                controls
              />
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.variant}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">{r.durationSeconds?.toFixed(1)}s</span>
                    {r.captioned && (
                      <span className="bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">Captioned</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(r.videoUrl, r.variant)}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Download
                </button>
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
        <p className="text-gray-400 text-sm">
          Choose your output format and produce your final videos.
        </p>
      </div>

      {/* Aspect ratio selector */}
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
            <span className="text-gray-400">Variants</span>
            <span>{scripts.length}</span>
          </div>
          {scripts.map((s) => (
            <div key={s.id} className="flex justify-between pl-4">
              <span className="text-gray-500">{s.variant}</span>
              <span className="text-gray-400">{s.scenes.length} scenes</span>
            </div>
          ))}
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
            <span className="text-sm font-medium">Producing videos...</span>
          </div>
          <p className="text-xs text-gray-500">
            Downloading clips, normalizing video, merging voiceover
            {music ? ', mixing music' : ''}
            {captionConfig.enabled ? ', adding captions' : ''}...
            This may take 1-3 minutes.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-gray-800">
        <button
          onClick={handleProduce}
          disabled={producing || !allScenesReady}
          className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors text-lg"
        >
          {producing ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Producing...
            </span>
          ) : (
            'Produce Videos'
          )}
        </button>
      </div>
    </div>
  );
}
