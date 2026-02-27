'use client';

import { useRef, useState, useEffect } from 'react';
import type { TextOverlay, UploadedVideo, MusicTrack } from '@/lib/types';

interface Props {
  video: UploadedVideo | null;
  videos: UploadedVideo[];
  activeIndex: number;
  onVideoChange: (index: number) => void;
  onUpdateVideo?: (index: number, updates: Partial<UploadedVideo>) => void;
  overlays: TextOverlay[];
  music: MusicTrack | null;
}

export default function VideoPreview({ video, videos, activeIndex, onVideoChange, onUpdateVideo, overlays, music }: Props) {
  const [showTrim, setShowTrim] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const vid = videoRef.current;
    const aud = audioRef.current;
    if (!vid) return;

    const handleTimeUpdate = () => {
      setCurrentTime(vid.currentTime);
      if (aud && music && Math.abs(aud.currentTime - vid.currentTime) > 0.1) {
        aud.currentTime = vid.currentTime;
      }
    };
    const handlePlay = () => {
      setIsPlaying(true);
      if (aud && music) {
        aud.currentTime = vid.currentTime;
        aud.volume = music.volume ?? 1;
        aud.play().catch((e) => console.warn('Preview music play failed:', e));
      }
    };
    const handlePause = () => {
      setIsPlaying(false);
      if (aud && music) aud.pause();
    };

    vid.addEventListener('timeupdate', handleTimeUpdate);
    vid.addEventListener('play', handlePlay);
    vid.addEventListener('pause', handlePause);

    return () => {
      vid.removeEventListener('timeupdate', handleTimeUpdate);
      vid.removeEventListener('play', handlePlay);
      vid.removeEventListener('pause', handlePause);
    };
  }, [video, music]);

  // Set music volume when available
  useEffect(() => {
    const aud = audioRef.current;
    if (aud && music) {
      aud.volume = music.volume ?? 1;
    }
  }, [music]);

  // Filter overlays visible at current time
  const visibleOverlays = overlays.filter(
    (o) => currentTime >= o.startTime && currentTime <= o.endTime
  );

  if (!video) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Preview</h2>
        <div className="bg-gray-800/50 rounded-xl aspect-[9/16] max-h-[70vh] flex flex-col items-center justify-center border-2 border-dashed border-gray-700">
          <span className="text-4xl mb-2 opacity-50">🎬</span>
          <p className="text-gray-500 text-sm">Upload a video to preview</p>
          <p className="text-gray-600 text-xs mt-1">Your overlays will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-white">Preview</h2>

      {/* Video switcher — only when multiple videos uploaded */}
      {videos.length > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onVideoChange(activeIndex - 1)}
            disabled={activeIndex === 0}
            className="p-1 text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed transition-colors shrink-0"
            aria-label="Previous video"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex-1 overflow-x-auto flex gap-1.5 py-1">
            {videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => onVideoChange(i)}
                className={`shrink-0 rounded-md overflow-hidden transition-all ${
                  i === activeIndex
                    ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-950'
                    : 'ring-1 ring-transparent hover:ring-gray-600'
                }`}
                title={v.originalName}
              >
                <img
                  src={v.thumbnail}
                  alt={v.originalName}
                  className="w-[40px] h-[56px] object-cover"
                />
              </button>
            ))}
          </div>

          <button
            onClick={() => onVideoChange(activeIndex + 1)}
            disabled={activeIndex >= videos.length - 1}
            className="p-1 text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed transition-colors shrink-0"
            aria-label="Next video"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <span className="text-xs text-gray-500 shrink-0">{activeIndex + 1} / {videos.length}</span>
        </div>
      )}

      <div className="relative bg-black rounded-xl overflow-hidden aspect-[9/16] max-h-[70vh] mx-auto" style={{ maxWidth: '320px' }}>
        {/* Background music - plays in sync with video */}
        {music?.file && (
          <audio
            key={music.file}
            ref={audioRef}
            src={music.file.startsWith('/') ? music.file : `/${music.file}`}
            loop
            preload="auto"
            playsInline
            style={{ display: 'none' }}
          />
        )}
        {/* Video */}
        <video
          key={video.id}
          ref={videoRef}
          src={video.path}
          className="w-full h-full object-cover"
          playsInline
          loop
          onError={(e) => console.error('Video load error:', video.path, e)}
        />

        {/* Safe zone guides — shows where Facebook/Instagram UI covers the video */}
        <div className="absolute inset-x-0 top-0 pointer-events-none border-b border-dashed border-red-500/20" style={{ height: '15%' }}>
          <span className="absolute bottom-1 right-2 text-[8px] text-red-400/40 font-medium">SAFE ZONE</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 pointer-events-none border-t border-dashed border-red-500/20" style={{ height: '35%' }}>
          <span className="absolute top-1 right-2 text-[8px] text-red-400/40 font-medium">SAFE ZONE</span>
        </div>

        {/* Text overlay previews — scale constants here (0.5, 0.6, 15%, 0.9em, 1.5 line-height)
            MUST stay in sync with overlay-renderer.ts PREVIEW_* constants.
            Container is constrained to the safe zone (top 15% to bottom 35%) so overlays
            auto-compress when there are many, matching the FFmpeg renderer behavior. */}
        <div className="absolute inset-0 flex flex-col items-center pointer-events-none" style={{ paddingTop: '15%', paddingBottom: '35%' }}>
          {overlays.map((overlay, i) => {
            const isVisible = currentTime >= overlay.startTime && currentTime <= overlay.endTime;
            // Reduce gap when many overlays to fit within safe zone (matches renderer compression)
            const gapEm = overlays.length >= 5 ? 0.3 : overlays.length >= 4 ? 0.5 : 0.9;
            return (
              <div
                key={overlay.id}
                className="transition-all duration-300 px-3 w-full flex justify-center"
                style={{
                  opacity: isVisible ? 1 : 0.15,
                  transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.95)',
                  maxWidth: `${overlay.style.maxWidth}%`,
                  marginBottom: `${gapEm}em`,
                  flexShrink: 1,
                }}
              >
                <div
                  className="text-center"
                  style={{
                    backgroundColor: overlay.style.bgColor + Math.round(overlay.style.bgOpacity * 255).toString(16).padStart(2, '0'),
                    color: overlay.style.textColor,
                    fontSize: `${overlay.style.fontSize * 0.5}px`,
                    fontWeight: overlay.style.fontWeight === 'extrabold' ? 800 : overlay.style.fontWeight === 'bold' ? 700 : 400,
                    padding: `${Math.round(overlay.style.paddingY * 0.6)}px ${Math.round(overlay.style.paddingX * 0.6)}px`,
                    borderRadius: `${Math.round(overlay.style.borderRadius * 0.6)}px`,
                    whiteSpace: 'pre-wrap',
                    width: 'fit-content',
                    maxWidth: '100%',
                  }}
                >
                  {overlay.emoji && <span className="mr-1">{overlay.emoji}</span>}
                  {overlay.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Play/pause overlay - play audio in same click (user gesture) to avoid autoplay block */}
        <button
          type="button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={async () => {
            const vid = videoRef.current;
            const aud = audioRef.current;
            if (!vid) return;
            if (vid.paused) {
              if (aud && music) {
                aud.currentTime = vid.currentTime;
                aud.volume = music.volume ?? 1;
              }
              await vid.play();
              if (aud && music) await aud.play().catch((e) => console.warn('Preview music:', e));
            } else {
              vid.pause();
              if (aud && music) aud.pause();
            }
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors group"
        >
          {!isPlaying && (
            <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
              <span className="text-white text-2xl ml-1">▶</span>
            </div>
          )}
        </button>
      </div>

      {/* Playback time + trim toggle */}
      <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
        <span>{currentTime.toFixed(1)}s / {video.duration.toFixed(1)}s</span>
        {onUpdateVideo && (
          <button
            onClick={() => setShowTrim(!showTrim)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              showTrim || video.trimStart || video.trimEnd
                ? 'text-blue-400 bg-blue-500/10'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {video.trimStart !== undefined || video.trimEnd !== undefined
              ? `Trimmed: ${(video.trimStart ?? 0).toFixed(1)}s–${(video.trimEnd ?? video.duration).toFixed(1)}s`
              : 'Trim'}
          </button>
        )}
      </div>

      {/* Trim controls */}
      {showTrim && onUpdateVideo && (
        <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Trim Video</span>
            {(video.trimStart !== undefined || video.trimEnd !== undefined) && (
              <button
                onClick={() => onUpdateVideo(activeIndex, { trimStart: undefined, trimEnd: undefined })}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Start</label>
              <div className="flex items-center gap-1">
                <input
                  type="range"
                  min={0}
                  max={video.duration}
                  step={0.1}
                  value={video.trimStart ?? 0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const end = video.trimEnd ?? video.duration;
                    if (val < end - 0.5) onUpdateVideo(activeIndex, { trimStart: val > 0 ? val : undefined });
                  }}
                  className="flex-1 accent-blue-500 h-1.5"
                />
                <span className="text-xs text-gray-400 w-10 text-right">{(video.trimStart ?? 0).toFixed(1)}s</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">End</label>
              <div className="flex items-center gap-1">
                <input
                  type="range"
                  min={0}
                  max={video.duration}
                  step={0.1}
                  value={video.trimEnd ?? video.duration}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const start = video.trimStart ?? 0;
                    if (val > start + 0.5) onUpdateVideo(activeIndex, { trimEnd: val < video.duration ? val : undefined });
                  }}
                  className="flex-1 accent-blue-500 h-1.5"
                />
                <span className="text-xs text-gray-400 w-10 text-right">{(video.trimEnd ?? video.duration).toFixed(1)}s</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            Output duration: {((video.trimEnd ?? video.duration) - (video.trimStart ?? 0)).toFixed(1)}s
          </p>
        </div>
      )}
    </div>
  );
}
