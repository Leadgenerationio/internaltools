'use client';

import { useCallback, useState } from 'react';
import type { MusicTrack } from '@/lib/types';

interface Props {
  music: MusicTrack | null;
  onChange: (music: MusicTrack | null) => void;
}

export default function MusicSelector({ music, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('music', file);

    setUploading(true);
    setError(null);

    try {
      const res = await fetch('/api/upload-music', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.path) {
        onChange({
          id: data.id || crypto.randomUUID(),
          name: file.name,
          file: data.path,
          volume: 0.3,
          startTime: 0,
          fadeIn: 1,
          fadeOut: 2,
        });
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">3. Background Music</h2>

      {music ? (
        <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎵</span>
              <div>
                <p className="text-sm text-white font-medium">{music.name}</p>
              </div>
            </div>
            <button
              onClick={() => onChange(null)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Remove
            </button>
          </div>

          {/* Volume control */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">
              Music volume: {Math.round(music.volume * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={music.volume}
              onChange={(e) => onChange({ ...music, volume: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Fade controls */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Fade in (seconds)</label>
              <input
                type="number"
                value={music.fadeIn}
                onChange={(e) => onChange({ ...music, fadeIn: parseFloat(e.target.value) || 0 })}
                min={0}
                max={5}
                step={0.5}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Fade out (seconds)</label>
              <input
                type="number"
                value={music.fadeOut}
                onChange={(e) => onChange({ ...music, fadeOut: parseFloat(e.target.value) || 0 })}
                min={0}
                max={5}
                step={0.5}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <label
            htmlFor="music-input"
            className={`block border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
              uploading ? 'border-blue-600 bg-blue-900/20 cursor-wait' : 'border-gray-600 hover:border-blue-500'
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Uploading...</p>
              </div>
            ) : (
              <>
                <div className="text-3xl mb-2">🎵</div>
                <p className="text-gray-400 text-sm">
                  Upload a music track (MP3, WAV, AAC)
                </p>
                <p className="text-gray-500 text-xs mt-1">Optional — mixed with video audio</p>
              </>
            )}
          </label>
          <input
            id="music-input"
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => { handleFileUpload(e.target.files); e.target.value = ''; }}
            disabled={uploading}
          />
          {error && (
            <div className="flex items-center justify-between gap-3 p-3 mt-2 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 p-1" aria-label="Dismiss">✕</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
