'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AdBriefForm from '@/components/AdBriefForm';
import FunnelReview from '@/components/FunnelReview';
import VideoSourceTabs from '@/components/VideoSourceTabs';
import MusicSelector from '@/components/MusicSelector';
import VideoPreview from '@/components/VideoPreview';
import StyleConfigurator from '@/components/StyleConfigurator';
import LogViewer from '@/components/LogViewer';
import type {
  AdBrief,
  GeneratedAd,
  FunnelStage,
  UploadedVideo,
  TextOverlay,
  TextStyle,
  MusicTrack,
} from '@/lib/types';
import { DEFAULT_TEXT_STYLE, FUNNEL_LABELS } from '@/lib/types';

type AppStep = 'brief' | 'review' | 'media' | 'render';

interface RenderResult {
  videoId: string;
  originalName: string;
  outputUrl: string;
  adLabel: string;
}

function adsToOverlays(
  ad: GeneratedAd,
  videoDuration: number,
  overlayStyle: TextStyle,
  staggerSeconds: number
): TextOverlay[] {
  const count = ad.textBoxes.length;
  // Clamp stagger so all boxes fit within the video duration
  const maxStagger = (videoDuration - 1) / Math.max(count, 1);
  const stagger = Math.min(staggerSeconds, maxStagger);

  return ad.textBoxes.map((box, i) => ({
    id: box.id,
    text: box.text,
    startTime: i * stagger,
    endTime: videoDuration,
    position: 'center' as const,
    yOffset: 0,
    style: { ...overlayStyle },
  }));
}

export default function Home() {
  // Step management
  const [step, setStep] = useState<AppStep>('brief');

  // Brief
  const [brief, setBrief] = useState<AdBrief | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Generated ads
  const [ads, setAds] = useState<GeneratedAd[]>([]);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Media
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [music, setMusic] = useState<MusicTrack | null>(null);
  const [uploading, setUploading] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);

  // Overlay style
  const [overlayStyle, setOverlayStyle] = useState<TextStyle>({ ...DEFAULT_TEXT_STYLE });
  const [staggerSeconds, setStaggerSeconds] = useState(2);

  // Render
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState('');
  const [renderCurrent, setRenderCurrent] = useState(0);
  const [renderTotal, setRenderTotal] = useState(0);
  const [results, setResults] = useState<RenderResult[]>([]);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // AbortControllers for cancellable operations
  const generateAbortRef = useRef<AbortController | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);

  // Preview state
  const [previewAdId, setPreviewAdId] = useState<string | null>(null);
  const [previewVideoIndex, setPreviewVideoIndex] = useState(0);

  // Persist state to localStorage so user doesn't lose progress between refreshes
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('adMaker_state');
      if (stored) {
        const s = JSON.parse(stored);
        if (s.brief) setBrief(s.brief);
        if (s.ads?.length) setAds(s.ads);
        if (s.step) setStep(s.step);
        if (s.overlayStyle) setOverlayStyle(s.overlayStyle);
        if (typeof s.staggerSeconds === 'number') setStaggerSeconds(s.staggerSeconds);
        if (s.videos?.length) setVideos(s.videos);
        if (s.music) setMusic(s.music);
      }
    } catch { /* ignore corrupt data */ }
    setIsRestored(true);
  }, []);

  useEffect(() => {
    if (!isRestored) return;
    try {
      localStorage.setItem('adMaker_state', JSON.stringify({
        brief, ads, step, overlayStyle, staggerSeconds, videos, music,
      }));
    } catch { /* storage full or unavailable */ }
  }, [isRestored, brief, ads, step, overlayStyle, staggerSeconds, videos, music]);

  // Auto-dismiss success/done messages after 8 seconds
  useEffect(() => {
    if (!rendering && renderProgress && !renderProgress.startsWith('Error') && !renderProgress.includes('failed')) {
      const timer = setTimeout(() => setRenderProgress(''), 8000);
      return () => clearTimeout(timer);
    }
  }, [rendering, renderProgress]);

  // Cleanup AbortControllers on unmount
  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort();
      renderAbortRef.current?.abort();
    };
  }, []);

  const handleCancelGenerate = useCallback(() => {
    generateAbortRef.current?.abort();
    generateAbortRef.current = null;
    setGenerating(false);
    setGenerateError('Generation cancelled.');
  }, []);

  const handleCancelRender = useCallback(() => {
    renderAbortRef.current?.abort();
    renderAbortRef.current = null;
    setRendering(false);
    setRenderProgress('Render cancelled. Videos completed before cancellation are available below.');
  }, []);

  const handleResetAll = () => {
    localStorage.removeItem('adMaker_state');
    setBrief(null);
    setAds([]);
    setStep('brief');
    setOverlayStyle({ ...DEFAULT_TEXT_STYLE });
    setStaggerSeconds(2);
    setVideos([]);
    setMusic(null);
    setResults([]);
    setRenderProgress('');
    setRenderCurrent(0);
    setRenderTotal(0);
    setPreviewAdId(null);
  };

  const approvedAds = ads.filter((a) => a.approved);
  const safeVideoIndex = Math.min(previewVideoIndex, Math.max(videos.length - 1, 0));
  const previewVideo = videos[safeVideoIndex] || null;
  const videoDuration = previewVideo ? previewVideo.duration : 15;

  // Preview overlays for the selected ad
  const previewAd = ads.find((a) => a.id === previewAdId) || approvedAds[0] || null;
  const previewOverlays = previewAd
    ? adsToOverlays(previewAd, videoDuration, overlayStyle, staggerSeconds)
    : [];

  // === Handlers ===

  const handleGenerate = async (newBrief: AdBrief) => {
    setBrief(newBrief);
    setGenerating(true);
    setGenerateError(null);

    const abort = new AbortController();
    generateAbortRef.current = abort;

    try {
      const res = await fetch('/api/generate-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: newBrief }),
        signal: abort.signal,
      });

      const data = await res.json();

      if (data.error) {
        setGenerateError(data.error);
        return;
      }

      const generated: GeneratedAd[] = data.ads.map(
        (ad: { funnelStage: FunnelStage; textBoxes: string[] }) => ({
          id: uuidv4(),
          funnelStage: ad.funnelStage,
          variationLabel: '',
          textBoxes: ad.textBoxes.map((text: string) => ({
            id: uuidv4(),
            text,
          })),
          approved: false,
        })
      );

      // Label per stage
      const stageCounts: Record<string, number> = {};
      for (const ad of generated) {
        stageCounts[ad.funnelStage] = (stageCounts[ad.funnelStage] || 0) + 1;
        ad.variationLabel = `${FUNNEL_LABELS[ad.funnelStage]} #${stageCounts[ad.funnelStage]}`;
      }

      setAds(generated);
      setStep('review');
    } catch (err: any) {
      if (err.name === 'AbortError') return; // Handled by cancel button
      setGenerateError(err.message || 'Generation failed');
    } finally {
      generateAbortRef.current = null;
      setGenerating(false);
    }
  };

  const handleRegenerateAd = async (adId: string) => {
    if (!brief) return;
    const ad = ads.find((a) => a.id === adId);
    if (!ad) return;

    setRegeneratingId(adId);

    try {
      const res = await fetch('/api/generate-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, regenerateStage: ad.funnelStage }),
      });

      const data = await res.json();
      if (data.error || !data.ads?.[0]) return;

      const newAd = data.ads[0];
      setAds((prev) =>
        prev.map((a) =>
          a.id === adId
            ? {
                ...a,
                textBoxes: newAd.textBoxes.map((text: string) => ({
                  id: uuidv4(),
                  text,
                })),
                approved: false,
              }
            : a
        )
      );
    } catch (err) {
      console.error('Regenerate failed:', err);
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRender = async () => {
    if (approvedAds.length === 0 || videos.length === 0) return;

    const abort = new AbortController();
    renderAbortRef.current = abort;

    setRendering(true);
    setResults([]);
    const totalCount = approvedAds.length * videos.length;
    setRenderTotal(totalCount);
    setRenderCurrent(0);
    setRenderProgress(`Starting render of ${totalCount} video${totalCount > 1 ? 's' : ''}...`);

    const allResults: RenderResult[] = [];
    let completed = 0;
    let cancelled = false;

    for (const ad of approvedAds) {
      if (cancelled) break;
      for (const vid of videos) {
        if (abort.signal.aborted) {
          cancelled = true;
          break;
        }

        // Compute overlays per-video so timing matches each video's actual duration
        const overlays = adsToOverlays(ad, vid.duration, overlayStyle, staggerSeconds);

        setRenderProgress(`Rendering "${ad.variationLabel}" — ${vid.originalName} (${completed + 1} of ${totalCount})...`);

        try {
          const res = await fetch('/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videos: [vid], overlays, music }),
            signal: abort.signal,
          });

          const data = await res.json();

          if (data.error) {
            setRenderProgress(`Error on "${ad.variationLabel}" — ${vid.originalName}: ${data.error}`);
            completed++;
            setRenderCurrent(completed);
            continue;
          }

          for (const r of data.results) {
            completed++;
            setRenderCurrent(completed);
            allResults.push({
              ...r,
              adLabel: ad.variationLabel,
            });
          }

          setRenderProgress(`Rendered ${completed} of ${totalCount}...`);
        } catch (err: any) {
          if (err.name === 'AbortError') { cancelled = true; break; }
          setRenderProgress(`Error on "${ad.variationLabel}" — ${vid.originalName}: ${err.message}`);
          completed++;
          setRenderCurrent(completed);
        }
      }
    }

    setResults(allResults);
    if (!cancelled) {
      setRenderProgress(
        allResults.length === totalCount
          ? `Done! ${allResults.length} video${allResults.length !== 1 ? 's' : ''} rendered.`
          : `Done with ${allResults.length} of ${totalCount} videos (some failed).`
      );
    } else if (allResults.length > 0) {
      setRenderProgress(`Cancelled. ${allResults.length} video${allResults.length !== 1 ? 's' : ''} completed before cancellation.`);
    }
    renderAbortRef.current = null;
    setRendering(false);
    if (allResults.length > 0) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleDownloadAll = () => {
    for (const r of results) {
      const link = document.createElement('a');
      link.href = r.outputUrl;
      link.download = `${r.adLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${r.originalName}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const canRender = approvedAds.length > 0 && videos.length > 0;
  const isAsyncBusy = generating || rendering || uploading || videoGenerating;

  // === Step navigation ===

  const steps: { key: AppStep; label: string; enabled: boolean }[] = [
    { key: 'brief', label: '1. Brief', enabled: !isAsyncBusy },
    { key: 'review', label: '2. Review', enabled: ads.length > 0 && !isAsyncBusy },
    { key: 'media', label: '3. Video & Music', enabled: approvedAds.length > 0 && !isAsyncBusy },
    { key: 'render', label: '4. Render', enabled: canRender && !isAsyncBusy },
  ];

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">Ad Maker</h1>
            <p className="text-sm text-gray-500">
              Generate funnel ad copy, review, and render video ads
            </p>
          </div>

          {/* Step nav */}
          <div className="flex items-center gap-1">
            {steps.map((s) => (
              <button
                key={s.key}
                onClick={() => s.enabled && setStep(s.key)}
                disabled={!s.enabled}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  step === s.key
                    ? 'bg-blue-600 text-white'
                    : s.enabled
                    ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                    : 'text-gray-600 cursor-not-allowed'
                }`}
              >
                {s.label}
              </button>
            ))}
            <button
              onClick={handleResetAll}
              className="ml-2 px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-all"
              title="Clear all saved data and start fresh"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Step 1: Brief */}
        {step === 'brief' && (
          <div className="max-w-2xl mx-auto">
            <AdBriefForm onGenerate={handleGenerate} generating={generating} initialBrief={brief} />
            {generateError && (
              <div className="mt-4 p-4 rounded-xl bg-red-950/50 border border-red-800">
                <p className="text-sm text-red-300">{generateError}</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Review */}
        {step === 'review' && (
          <div className="space-y-6">
            <FunnelReview
              ads={ads}
              onUpdateAds={setAds}
              onRegenerateAd={handleRegenerateAd}
              regeneratingId={regeneratingId}
            />

            <div className="flex items-center justify-between pt-4 border-t border-gray-800">
              <button
                onClick={() => setStep('brief')}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Back to Brief
              </button>
              <button
                onClick={() => approvedAds.length > 0 && setStep('media')}
                disabled={approvedAds.length === 0}
                className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  approvedAds.length > 0
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                Continue with {approvedAds.length} Ad{approvedAds.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Media upload + style */}
        {step === 'media' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <VideoSourceTabs
                videos={videos}
                onUpload={setVideos}
                uploading={uploading}
                setUploading={setUploading}
                generating={videoGenerating}
                setGenerating={setVideoGenerating}
              />

              <MusicSelector music={music} onChange={setMusic} />

              {/* Style controls */}
              <StyleConfigurator
                style={overlayStyle}
                onChange={setOverlayStyle}
                staggerSeconds={staggerSeconds}
                onStaggerChange={setStaggerSeconds}
              />

              {/* Approved ads summary */}
              <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">
                  Approved Ads ({approvedAds.length})
                </h3>
                <div className="space-y-2">
                  {approvedAds.map((ad) => (
                    <div
                      key={ad.id}
                      onClick={() => setPreviewAdId(ad.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        previewAdId === ad.id || (!previewAdId && previewAd?.id === ad.id)
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <p className="text-sm text-white font-medium">{ad.variationLabel}</p>
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {ad.textBoxes.map((b) => b.text).join(' / ')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Music duration warning */}
              {music && videos.length > 0 && music.fadeOut > videoDuration && (
                <div className="p-3 rounded-lg bg-yellow-950/30 border border-yellow-700/50">
                  <p className="text-xs text-yellow-400">
                    Music fade out ({music.fadeOut}s) is longer than your video ({videoDuration.toFixed(1)}s) — it will be clamped.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <button
                  onClick={() => setStep('review')}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Back to Review
                </button>
                <button
                  onClick={() => {
                    if (canRender) {
                      setStep('render');
                      handleRender();
                    }
                  }}
                  disabled={!canRender || rendering}
                  className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    canRender && !rendering
                      ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20'
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {rendering ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Rendering...
                    </span>
                  ) : (
                    `Render ${approvedAds.length * Math.max(videos.length, 1)} Video${
                      approvedAds.length * Math.max(videos.length, 1) !== 1 ? 's' : ''
                    }`
                  )}
                </button>
              </div>
            </div>

            {/* Preview panel */}
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <VideoPreview
                  video={previewVideo}
                  videos={videos}
                  activeIndex={safeVideoIndex}
                  onVideoChange={setPreviewVideoIndex}
                  overlays={previewOverlays}
                  music={music}
                />
                {previewAd && (
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Previewing: {previewAd.variationLabel}
                    {previewVideo && videos.length > 1 ? ` on ${previewVideo.originalName}` : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Render results */}
        {step === 'render' && (
          <div className="space-y-6">
            {/* Progress bar */}
            {rendering && renderTotal > 0 && (
              <div className="space-y-2">
                <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((renderCurrent / renderTotal) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  {renderCurrent} / {renderTotal} videos
                </p>
              </div>
            )}

            {renderProgress && (
              <div
                className={`p-4 rounded-xl border ${
                  renderProgress.startsWith('Error') || renderProgress.includes('failed')
                    ? 'bg-red-950/50 border-red-800'
                    : rendering
                    ? 'bg-blue-950/30 border-blue-800'
                    : 'bg-green-950/30 border-green-800'
                }`}
              >
                <p
                  className={`text-sm ${
                    renderProgress.startsWith('Error') || renderProgress.includes('failed')
                      ? 'text-red-300'
                      : rendering
                      ? 'text-blue-300'
                      : 'text-green-300'
                  }`}
                >
                  {rendering && (
                    <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                  )}
                  {renderProgress}
                </p>
              </div>
            )}

            {results.length > 0 && (
              <div ref={resultsRef} className="space-y-4 scroll-mt-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">
                    Rendered Videos ({results.length})
                  </h3>
                  {results.length > 1 && (
                    <button
                      onClick={handleDownloadAll}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Download All ({results.length})
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                      <video
                        src={r.outputUrl}
                        className="w-full rounded-lg mb-3 aspect-[9/16] object-cover"
                        controls
                        playsInline
                      />
                      <div className="space-y-2">
                        <p className="text-xs text-blue-400 font-medium">{r.adLabel}</p>
                        <p className="text-sm text-gray-300 truncate">{r.originalName}</p>
                        <a
                          href={r.outputUrl}
                          download
                          className="block text-center px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
              <button
                onClick={() => setStep('media')}
                disabled={rendering}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Back to Media
              </button>
              <button
                onClick={handleResetAll}
                disabled={rendering}
                className="px-4 py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
              >
                Start New Brief
              </button>
            </div>
          </div>
        )}

        <LogViewer />
      </div>
    </main>
  );
}
