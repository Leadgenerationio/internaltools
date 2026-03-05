'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import type { MusicTrack } from '@/lib/types';
import Tooltip from '@/components/Tooltip';

interface Props {
  music: MusicTrack | null;
  onChange: (music: MusicTrack | null) => void;
}

interface LibraryTrack {
  id: string;
  name: string;
  artist: string;
  duration: number;
  previewUrl: string;
  downloadUrl: string;
  image: string;
  genre: string;
  mood: string;
}

const GENRES = ['electronic', 'pop', 'hiphop', 'rock', 'ambient', 'classical', 'jazz', 'lounge', 'cinematic'];
const MOODS = ['upbeat', 'energetic', 'chill', 'happy', 'dramatic', 'inspirational', 'dark', 'romantic'];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MusicSelector({ music, onChange }: Props) {
  const [tab, setTab] = useState<'upload' | 'library'>('library');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Library state
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGenre, setActiveGenre] = useState('');
  const [activeMood, setActiveMood] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Audio preview
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load popular tracks on first library tab view
  useEffect(() => {
    if (tab === 'library' && !loadedOnce && !music) {
      searchLibrary();
      setLoadedOnce(true);
    }
  }, [tab, loadedOnce, music]);

  // Debounced search
  useEffect(() => {
    if (!loadedOnce) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      searchLibrary(1);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, activeGenre, activeMood]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const searchLibrary = async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (searchQuery) params.set('q', searchQuery);
      if (activeGenre) params.set('genre', activeGenre);
      if (activeMood) params.set('mood', activeMood);

      const res = await fetch(`/api/music-library?${params}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (p === 1) {
        setTracks(data.tracks);
      } else {
        setTracks((prev) => [...prev, ...data.tracks]);
      }
      setHasMore(data.hasMore);
      setPage(p);
    } catch {
      setError('Failed to search music library');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = (track: LibraryTrack) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(track.previewUrl);
    audio.volume = 0.5;
    audio.play();
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(track.id);
  };

  const handleSelectTrack = async (track: LibraryTrack) => {
    setDownloading(track.id);
    setError(null);

    // Stop preview if playing
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }

    try {
      const res = await fetch('/api/music-library/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId: track.id,
          downloadUrl: track.downloadUrl,
          name: track.name,
          artist: track.artist,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      onChange({
        id: data.id,
        name: data.name,
        file: data.path,
        volume: 0.5,
        startTime: 0,
        fadeIn: 1,
        fadeOut: 2,
      });
    } catch {
      setError('Failed to download track');
    } finally {
      setDownloading(null);
    }
  };

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
          volume: 1,
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
      <h2 className="text-lg font-semibold text-white flex items-center">
        3. Background Music
        <Tooltip text="Optional. Music will play under all rendered videos. You can adjust volume and fade settings after selecting a track." />
      </h2>

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
          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setTab('library')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'library' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Free Music Library
            </button>
            <button
              onClick={() => setTab('upload')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'upload' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Upload Your Own
            </button>
          </div>

          {tab === 'library' ? (
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tracks..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Genre tags */}
              <div className="flex flex-wrap gap-1.5">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => setActiveGenre(activeGenre === g ? '' : g)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      activeGenre === g
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {/* Mood tags */}
              <div className="flex flex-wrap gap-1.5">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setActiveMood(activeMood === m ? '' : m)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      activeMood === m
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Track list */}
              <div className="space-y-1 max-h-80 overflow-y-auto rounded-lg">
                {loading && tracks.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : tracks.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">
                    {error || 'No tracks found. Try a different search.'}
                  </p>
                ) : (
                  tracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 p-2.5 bg-gray-800 hover:bg-gray-750 rounded-lg group transition-colors"
                    >
                      {/* Play/pause */}
                      <button
                        onClick={() => handlePreview(track)}
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-gray-700 hover:bg-blue-600 transition-colors"
                      >
                        {playingId === track.id ? (
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </button>

                      {/* Track info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{track.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {track.artist} · {formatDuration(track.duration)}
                          {track.genre && <span className="ml-1 text-gray-600">· {track.genre}</span>}
                        </p>
                      </div>

                      {/* Select button */}
                      <button
                        onClick={() => handleSelectTrack(track)}
                        disabled={downloading === track.id}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        {downloading === track.id ? (
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          'Use'
                        )}
                      </button>
                    </div>
                  ))
                )}

                {/* Load more */}
                {hasMore && !loading && (
                  <button
                    onClick={() => searchLibrary(page + 1)}
                    className="w-full py-2 text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Load more tracks
                  </button>
                )}
                {loading && tracks.length > 0 && (
                  <div className="flex items-center justify-center py-2">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <p className="text-[10px] text-gray-600">
                Music by Jamendo · Creative Commons licensed · Free for use
              </p>
            </div>
          ) : (
            /* Upload tab */
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
            </>
          )}

          {error && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 p-1" aria-label="Dismiss">✕</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
