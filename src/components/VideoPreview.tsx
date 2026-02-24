'use client';

import { useRef, useState, useEffect } from 'react';
import type { TextOverlay, UploadedVideo, MusicTrack } from '@/lib/types';

interface Props {
  video: UploadedVideo | null;
  overlays: TextOverlay[];
  music: MusicTrack | null;
}

export default function VideoPreview({ video, overlays, music }: Props) {
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

        {/* Text overlay previews - stacked layout matching example */}
        <div className="absolute inset-0 flex flex-col items-center pointer-events-none" style={{ paddingTop: '10%' }}>
          {overlays.map((overlay, i) => {
            const isVisible = currentTime >= overlay.startTime && currentTime <= overlay.endTime;
            return (
              <div
                key={overlay.id}
                className="transition-all duration-300 px-3 w-full flex justify-center"
                style={{
                  opacity: isVisible ? 1 : 0.15,
                  transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.95)',
                  maxWidth: `${overlay.style.maxWidth}%`,
                  marginBottom: '0.9em',
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

      {/* Playback time */}
      <div className="text-center text-xs text-gray-500">
        {currentTime.toFixed(1)}s / {video.duration.toFixed(1)}s
      </div>
    </div>
  );
}
