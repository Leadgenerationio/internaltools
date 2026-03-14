'use client';

import { useState, useRef } from 'react';
import type { LongformSceneSlot } from '@/lib/longform-types';
import { VIDEO_MODELS } from '@/lib/types';
import StoryblocksSearch from '@/components/StoryblocksSearch';

// Models suitable for b-roll scenes
const BROLL_MODELS = VIDEO_MODELS.filter((m) => m.aspectRatios.includes('9:16'));

interface Props {
  scene: LongformSceneSlot;
  onUpdate: (scene: LongformSceneSlot) => void;
  onSaveToLibrary: (clipUrl: string, name: string) => Promise<void>;
}

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

export default function SceneSlot({ scene, onUpdate, onSaveToLibrary }: Props) {
  const [tab, setTab] = useState<'ai' | 'upload' | 'library' | 'stock'>('ai');
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelId, setModelId] = useState(BROLL_MODELS[0]?.id || 'veo3_fast');
  const [prompt, setPrompt] = useState(scene.visualPrompt);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Library modal
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState<any[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  const selectedModel = BROLL_MODELS.find((m) => m.id === modelId);

  const handleAiGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/longform/regenerate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), videoModel: modelId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const data = await res.json();
      const { jobId } = data;

      // Poll for completion
      const { pollJob } = await import('@/lib/poll-job');
      const result = await pollJob(jobId, 'longform');

      if (result.state === 'failed') {
        throw new Error(result.error || 'Generation failed');
      }

      const jobResult = result.result as any;
      onUpdate({
        ...scene,
        clipUrl: jobResult.clipUrl,
        clipFilename: jobResult.clipFilename,
        clipDuration: jobResult.durationSeconds,
        source: 'ai-generated',
        visualPrompt: prompt,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('videos', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errData.error || 'Upload failed');
      }
      const data = await res.json();
      const video = data.videos?.[0];
      if (!video) throw new Error('No video returned');

      onUpdate({
        ...scene,
        clipUrl: video.path,
        clipFilename: video.filename,
        clipDuration: video.duration || 0,
        source: 'uploaded',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const loadLibrary = async () => {
    setShowLibrary(true);
    if (libraryFiles.length > 0) return;
    setLoadingLibrary(true);
    try {
      const res = await fetch('/api/media?limit=50');
      if (res.ok) {
        const data = await res.json();
        setLibraryFiles(data.files || []);
      }
    } catch { /* ignore */ }
    setLoadingLibrary(false);
  };

  const selectFromLibrary = (file: any) => {
    onUpdate({
      ...scene,
      clipUrl: file.publicUrl,
      clipFilename: file.originalName || 'library-clip',
      clipDuration: file.duration || 0,
      source: 'library',
    });
    setShowLibrary(false);
  };

  const handleSaveToLibrary = async () => {
    if (!scene.clipUrl) return;
    setSaving(true);
    try {
      await onSaveToLibrary(scene.clipUrl, `Scene - ${scene.visualPrompt.slice(0, 40)}`);
    } catch { /* parent handles error */ }
    setSaving(false);
  };

  const clearSlot = () => {
    onUpdate({
      ...scene,
      clipUrl: undefined,
      clipFilename: undefined,
      clipDuration: undefined,
      source: 'empty',
    });
  };

  const hasClip = !!scene.clipUrl;

  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-gray-800 border-b border-gray-700/50 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-300">Scene {scene.order + 1}</span>
          <span className="text-xs text-gray-500 ml-2">~{scene.durationEstimate}s</span>
        </div>
        {hasClip && (
          <div className="flex items-center gap-2">
            {scene.source === 'ai-generated' && (
              <button
                onClick={handleSaveToLibrary}
                disabled={saving}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {saving ? 'Saving...' : 'Save to Library'}
              </button>
            )}
            <button onClick={clearSlot} className="text-xs text-red-400 hover:text-red-300">
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Scene text */}
      <div className="px-4 py-2 text-xs text-gray-400 italic border-b border-gray-700/30">
        &ldquo;{scene.text.slice(0, 120)}{scene.text.length > 120 ? '...' : ''}&rdquo;
      </div>

      {/* Video preview or source tabs */}
      <div className="p-4">
        {hasClip ? (
          <div className="space-y-2">
            <video
              src={normalizeVideoUrl(scene.clipUrl!)}
              className="w-full rounded-lg bg-black aspect-[9/16] max-h-[240px] object-contain"
              controls
              muted
            />
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                scene.source === 'ai-generated' ? 'bg-purple-600/20 text-purple-400'
                  : scene.source === 'uploaded' ? 'bg-blue-600/20 text-blue-400'
                    : 'bg-green-600/20 text-green-400'
              }`}>
                {scene.source === 'ai-generated' ? 'AI Generated' : scene.source === 'uploaded' ? 'Uploaded' : 'Library'}
              </span>
              {scene.clipDuration ? (
                <span className="text-xs text-gray-500">{scene.clipDuration.toFixed(1)}s</span>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-3">
              {(['ai', 'upload', 'library', 'stock'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); if (t === 'library') loadLibrary(); }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  {t === 'ai' ? 'AI' : t === 'upload' ? 'Upload' : t === 'library' ? 'Library' : 'Stock'}
                </button>
              ))}
            </div>

            {tab === 'ai' && (
              <div className="space-y-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={2}
                  placeholder="Describe the video scene..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white resize-none"
                  disabled={generating}
                />
                <div className="flex items-center gap-2">
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white"
                    disabled={generating}
                  >
                    {BROLL_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label} ({m.tokenCost} tok)</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAiGenerate}
                    disabled={generating || !prompt.trim()}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded transition-colors"
                  >
                    {generating ? 'Generating...' : `Generate (${selectedModel?.tokenCost || 5} tok)`}
                  </button>
                </div>
              </div>
            )}

            {tab === 'upload' && (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-6 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm"
                >
                  {uploading ? 'Uploading...' : 'Click to upload video'}
                </button>
              </div>
            )}

            {tab === 'library' && showLibrary && (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {loadingLibrary ? (
                  <div className="text-xs text-gray-500 text-center py-4">Loading...</div>
                ) : libraryFiles.length === 0 ? (
                  <div className="text-xs text-gray-500 text-center py-4">No videos in library</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {libraryFiles.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => selectFromLibrary(f)}
                        className="bg-gray-900 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
                      >
                        {f.thumbnailUrl ? (
                          <img src={normalizeVideoUrl(f.thumbnailUrl)} alt="" className="w-full aspect-video object-cover" />
                        ) : f.publicUrl ? (
                          <video
                            src={normalizeVideoUrl(f.publicUrl)}
                            className="w-full aspect-video object-cover bg-gray-800"
                            preload="metadata"
                            muted
                          />
                        ) : (
                          <div className="w-full aspect-video bg-gray-800 flex items-center justify-center text-xs text-gray-500">No preview</div>
                        )}
                        <div className="px-1.5 py-1 truncate text-xs text-gray-400">{f.originalName || 'Video'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'stock' && (
              <StoryblocksSearch
                compact
                onSelect={(video) => {
                  onUpdate({
                    ...scene,
                    clipUrl: video.path,
                    clipFilename: video.filename,
                    clipDuration: video.duration,
                    source: 'library',
                  });
                }}
              />
            )}

            {error && (
              <div className="mt-2 text-xs text-red-400">{error}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
