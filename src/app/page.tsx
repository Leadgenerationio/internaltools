'use client';

import { useState, useRef } from 'react';
import VideoUploader from '@/components/VideoUploader';
import TextOverlayEditor from '@/components/TextOverlayEditor';
import MusicSelector from '@/components/MusicSelector';
import VideoPreview from '@/components/VideoPreview';
import LogViewer from '@/components/LogViewer';
import type { UploadedVideo, TextOverlay, MusicTrack } from '@/lib/types';

interface RenderResult {
  videoId: string;
  originalName: string;
  outputUrl: string;
}

export default function Home() {
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [music, setMusic] = useState<MusicTrack | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState('');
  const [results, setResults] = useState<RenderResult[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  const videoDuration = videos.length > 0 ? videos[0].duration : 15;

  const canRender = videos.length > 0 && overlays.length > 0;
  const missingSteps: string[] = [];
  if (videos.length === 0) missingSteps.push('Upload at least one video');
  if (overlays.length === 0) missingSteps.push('Add at least one text overlay');

  const handleRender = async () => {
    if (!canRender) return;

    setRendering(true);
    setRenderProgress(`Rendering ${videos.length} video${videos.length > 1 ? 's' : ''}...`);
    setResults([]);

    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos, overlays, music }),
      });

      const data = await res.json();

      if (data.error) {
        setRenderProgress(`Error: ${data.error}`);
      } else {
        setResults(data.results);
        setRenderProgress(`Done! ${data.results.length} video${data.results.length > 1 ? 's' : ''} rendered.`);
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err: any) {
      setRenderProgress(`Error: ${err.message}`);
    } finally {
      setRendering(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">Ad Video Creator</h1>
            <p className="text-sm text-gray-500">Create scroll-stopping video ads with timed text overlays</p>
          </div>
          <div className="flex items-center gap-3">
            {!canRender && missingSteps.length > 0 && (
              <p className="text-xs text-gray-500 hidden sm:block max-w-[200px]">
                {missingSteps.join(' • ')}
              </p>
            )}
            <button
              onClick={handleRender}
              disabled={rendering || !canRender}
              title={!canRender ? missingSteps.join('\n') : undefined}
              className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${
                rendering || !canRender
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20'
              }`}
            >
              {rendering ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Rendering...
                </span>
              ) : (
                `Render ${videos.length > 0 ? videos.length : ''} Video${videos.length !== 1 ? 's' : ''}`
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel: Controls */}
          <div className="lg:col-span-2 space-y-6">
            <VideoUploader
              videos={videos}
              onUpload={setVideos}
              uploading={uploading}
              setUploading={setUploading}
            />

            <TextOverlayEditor
              overlays={overlays}
              onChange={setOverlays}
              videoDuration={videoDuration}
            />

            <MusicSelector
              music={music}
              onChange={setMusic}
            />
          </div>

          {/* Right panel: Preview */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <VideoPreview
                video={videos[0] || null}
                overlays={overlays}
                music={music}
              />
            </div>
          </div>
        </div>

        {/* Render progress */}
        {renderProgress && (
          <div className={`mt-8 p-4 rounded-xl border ${
            renderProgress.startsWith('Error') ? 'bg-red-950/50 border-red-800' : 'bg-gray-800 border-gray-700'
          }`}>
            <p className={`text-sm ${renderProgress.startsWith('Error') ? 'text-red-300' : 'text-gray-300'}`}>
              {renderProgress}
            </p>
          </div>
        )}

        {/* Results - scroll into view when done */}
        {results.length > 0 && (
          <div ref={resultsRef} className="mt-8 space-y-4 scroll-mt-8">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✓</span>
              <h3 className="text-lg font-semibold text-white">Rendered Videos</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {results.map((r) => (
                <div key={r.videoId} className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-colors">
                  <video
                    src={r.outputUrl}
                    className="w-full rounded-lg mb-3 aspect-[9/16] object-cover"
                    controls
                    playsInline
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-gray-300 truncate flex-1 min-w-0">{r.originalName}</p>
                    <a
                      href={r.outputUrl}
                      download
                      className="shrink-0 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <LogViewer />
      </div>
    </main>
  );
}
