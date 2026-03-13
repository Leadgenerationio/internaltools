'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

type WizardStep = 'upload' | 'review' | 'done';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review Clips' },
  { id: 'done', label: 'Done' },
];

interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  duration: number;
  width: number;
  height: number;
  thumbnail: string;
}

interface Segment {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  thumbnailUrl: string;
  selected: boolean;
}

interface SavedClip {
  index: number;
  url: string;
  thumbnailUrl: string;
  duration: number;
  name: string;
  storageFileId: string | null;
}

export default function VideoCutupPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const [step, setStep] = useState<WizardStep>('upload');

  // Upload state
  const [video, setVideo] = useState<UploadedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analysis state
  const [segments, setSegments] = useState<Segment[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.3);

  // Splitting state
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  // Results state
  const [savedClips, setSavedClips] = useState<SavedClip[]>([]);
  const [failedCount, setFailedCount] = useState(0);

  // Preview state
  const [previewSegment, setPreviewSegment] = useState<Segment | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('videos', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Upload failed (${res.status})` }));
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      if (data.videos?.[0]) {
        setVideo(data.videos[0]);
      } else {
        throw new Error('No video returned from upload');
      }
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      handleUpload(file);
    }
  }, [handleUpload]);

  // ── Analyze ───────────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!video) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setSegments([]);

    try {
      const res = await fetch('/api/video-cutup/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath: video.path, threshold }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }

      const data = await res.json();
      const segs: Segment[] = (data.segments || []).map((s: any) => ({
        ...s,
        selected: true,
      }));
      setSegments(segs);
      setStep('review');
    } catch (err: any) {
      setAnalyzeError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }, [video, threshold]);

  // ── Split & Save ──────────────────────────────────────────────────────────

  const handleSplit = useCallback(async () => {
    if (!video) return;
    const selected = segments.filter((s) => s.selected);
    if (selected.length === 0) return;

    setSplitting(true);
    setSplitError(null);

    try {
      const res = await fetch('/api/video-cutup/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: video.path,
          originalName: video.originalName,
          segments: selected.map((s) => ({
            index: s.index,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Split failed' }));
        throw new Error(data.error || `Split failed (${res.status})`);
      }

      const data = await res.json();
      setSavedClips(data.clips || []);
      setFailedCount(data.failedCount || 0);
      setStep('done');
    } catch (err: any) {
      setSplitError(err.message);
    } finally {
      setSplitting(false);
    }
  }, [video, segments]);

  // ── Segment preview ───────────────────────────────────────────────────────

  const handlePreview = useCallback((seg: Segment) => {
    setPreviewSegment(seg);
  }, []);

  useEffect(() => {
    if (!previewSegment || !videoRef.current || !video) return;
    const el = videoRef.current;
    el.currentTime = previewSegment.startTime;
    el.play().catch(() => {});

    const checkTime = () => {
      if (el.currentTime >= previewSegment.endTime) {
        el.pause();
      }
    };

    el.addEventListener('timeupdate', checkTime);
    return () => el.removeEventListener('timeupdate', checkTime);
  }, [previewSegment, video]);

  // ── Toggle selection ──────────────────────────────────────────────────────

  const toggleSegment = (index: number) => {
    setSegments((prev) =>
      prev.map((s) => (s.index === index ? { ...s, selected: !s.selected } : s)),
    );
  };

  const selectAll = () => setSegments((prev) => prev.map((s) => ({ ...s, selected: true })));
  const selectNone = () => setSegments((prev) => prev.map((s) => ({ ...s, selected: false })));

  const selectedCount = segments.filter((s) => s.selected).length;

  // ── Format helpers ────────────────────────────────────────────────────────

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 10);
    return `${mins}:${String(secs).padStart(2, '0')}.${ms}`;
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="text-lg sm:text-xl font-bold text-white shrink-0 hover:text-blue-400 transition-colors">Ad Maker</Link>

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 justify-center min-w-0">
            {STEPS.map((s, i) => {
              const currentIndex = STEPS.findIndex((st) => st.id === step);
              const isPast = i < currentIndex;
              const isCurrent = s.id === step;
              return (
                <div key={s.id} className="flex items-center shrink-0">
                  {i > 0 && <div className={`w-4 sm:w-8 h-px ${isPast ? 'bg-blue-500' : 'bg-gray-700'}`} />}
                  <div className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                    isCurrent
                      ? 'bg-blue-500 text-white'
                      : isPast
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-gray-800 text-gray-500'
                  }`}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>

          <UserMenu />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* ── Upload Step ──────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Video Cut Up</h2>
              <p className="text-gray-400 text-sm">Upload a video and we'll automatically detect scenes. Pick the clips you want to save to your media library.</p>
            </div>

            {/* Drop zone */}
            {!video && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-xl p-12 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-400">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <svg className="w-12 h-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    <div>
                      <p className="text-white font-medium">Drop a video here or click to browse</p>
                      <p className="text-gray-500 text-sm mt-1">MP4, MOV, AVI, WebM — up to 500MB</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {uploadError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
                {uploadError}
              </div>
            )}

            {/* Uploaded video preview */}
            {video && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {video.thumbnail && (
                      <img src={video.thumbnail} alt="" className="w-20 h-14 rounded object-cover bg-gray-800" />
                    )}
                    <div>
                      <p className="text-white font-medium">{video.originalName}</p>
                      <p className="text-sm text-gray-500">
                        {video.width}x{video.height} &middot; {video.duration.toFixed(1)}s
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setVideo(null); setSegments([]); setAnalyzeError(null); }}
                    className="text-gray-500 hover:text-gray-300 transition-colors text-sm"
                  >
                    Remove
                  </button>
                </div>

                {/* Sensitivity slider */}
                <div>
                  <label className="text-sm text-gray-400">
                    Scene Detection Sensitivity: <span className="text-white font-medium">{threshold < 0.25 ? 'High' : threshold < 0.45 ? 'Medium' : 'Low'}</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">Higher sensitivity = more cuts detected</p>
                  <input
                    type="range"
                    min="0.1"
                    max="0.7"
                    step="0.05"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full accent-blue-500"
                    style={{ direction: 'rtl' }}
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>More cuts</span>
                    <span>Fewer cuts</span>
                  </div>
                </div>

                {analyzeError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
                    {analyzeError}
                  </div>
                )}

                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {analyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Detecting Scenes...
                    </span>
                  ) : (
                    'Detect Scenes'
                  )}
                </button>
              </div>
            )}

            <p className="text-xs text-gray-600">Free — no tokens required. Clips are saved to your media library for use in other ad formats.</p>
          </div>
        )}

        {/* ── Review Step ─────────────────────────────────────────────── */}
        {step === 'review' && video && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Review Clips</h2>
              <p className="text-gray-400 text-sm">
                {segments.length} scene{segments.length !== 1 ? 's' : ''} detected in <span className="text-white">{video.originalName}</span>. Select which clips to save.
              </p>
            </div>

            {/* Video player for preview */}
            <div className="bg-black rounded-xl overflow-hidden">
              <video
                ref={videoRef}
                src={video.path}
                controls
                className="w-full max-h-[360px] mx-auto"
                preload="metadata"
              />
              {previewSegment && (
                <div className="bg-gray-900 px-4 py-2 text-xs text-gray-400 flex items-center justify-between">
                  <span>Previewing: Clip {previewSegment.index + 1} ({formatTime(previewSegment.startTime)} – {formatTime(previewSegment.endTime)})</span>
                  <button onClick={() => setPreviewSegment(null)} className="text-gray-500 hover:text-white transition-colors">Clear</button>
                </div>
              )}
            </div>

            {/* Select all / none */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 hover:border-gray-500 transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={selectNone}
                  className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 hover:border-gray-500 transition-colors"
                >
                  Select None
                </button>
              </div>
              <p className="text-sm text-gray-400">{selectedCount} of {segments.length} selected</p>
            </div>

            {/* Segment grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {segments.map((seg) => (
                <div
                  key={seg.index}
                  className={`relative group rounded-xl overflow-hidden border transition-all cursor-pointer ${
                    seg.selected
                      ? 'border-blue-500 ring-1 ring-blue-500/50'
                      : 'border-gray-700 opacity-50 hover:opacity-75'
                  }`}
                >
                  {/* Thumbnail / click to toggle */}
                  <button
                    onClick={() => toggleSegment(seg.index)}
                    className="w-full text-left"
                  >
                    {seg.thumbnailUrl ? (
                      <img src={seg.thumbnailUrl} alt={`Clip ${seg.index + 1}`} className="w-full h-28 object-cover bg-gray-800" />
                    ) : (
                      <div className="w-full h-28 bg-gray-800 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                      </div>
                    )}
                    <div className="p-2.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-medium text-white">Clip {seg.index + 1}</p>
                        <span className="text-xs text-gray-500">{seg.duration.toFixed(1)}s</span>
                      </div>
                      <p className="text-xs text-gray-500">{formatTime(seg.startTime)} – {formatTime(seg.endTime)}</p>
                    </div>
                  </button>

                  {/* Preview button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePreview(seg); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Preview clip"
                  >
                    <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </button>

                  {/* Selection checkbox */}
                  {seg.selected && (
                    <div className="absolute top-2 left-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {splitError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
                {splitError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('upload'); setSegments([]); setPreviewSegment(null); }}
                className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSplit}
                disabled={splitting || selectedCount === 0}
                className="px-8 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {splitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving {selectedCount} Clip{selectedCount !== 1 ? 's' : ''}...
                  </span>
                ) : (
                  `Save ${selectedCount} Clip${selectedCount !== 1 ? 's' : ''} to Library`
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Done Step ───────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                {savedClips.length > 0 ? 'Clips Saved' : 'Done'}
              </h2>
              <p className="text-gray-400 text-sm">
                {savedClips.length} clip{savedClips.length !== 1 ? 's' : ''} saved to your media library
                {failedCount > 0 ? ` (${failedCount} failed)` : ''}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {savedClips.map((clip) => (
                <div key={clip.index} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  {clip.thumbnailUrl ? (
                    <img src={clip.thumbnailUrl} alt={clip.name} className="w-full h-28 object-cover" />
                  ) : (
                    <div className="w-full h-28 bg-gray-800 flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-white truncate">{clip.name}</p>
                    <p className="text-xs text-gray-500">{clip.duration.toFixed(1)}s</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('upload');
                  setVideo(null);
                  setSegments([]);
                  setSavedClips([]);
                  setFailedCount(0);
                  setPreviewSegment(null);
                }}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
              >
                Cut Another Video
              </button>
              <Link href="/" className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">
                Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
