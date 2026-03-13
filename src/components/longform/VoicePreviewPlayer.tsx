'use client';

import { useRef, useState, useEffect } from 'react';

interface Props {
  src: string;
  label?: string;
  compact?: boolean;
}

export default function VoicePreviewPlayer({ src, label, compact }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // Stop playback when src changes or component unmounts
  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    return () => {
      audioRef.current?.pause();
    };
  }, [src]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent parent onClick (e.g. voice selection)
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'bg-gray-800 rounded-lg px-3 py-2'}`}>
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration) setProgress((a.currentTime / a.duration) * 100);
        }}
      />
      <button
        onClick={toggle}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 transition-colors flex-shrink-0"
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        ) : (
          <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
      {compact ? (
        playing && (
          <div className="w-12 h-1 bg-gray-700 rounded-full">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )
      ) : (
        <div className="flex-1 min-w-0">
          {label && <span className="text-xs text-gray-400 truncate block">{label}</span>}
          <div className="h-1 bg-gray-700 rounded-full mt-1">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
