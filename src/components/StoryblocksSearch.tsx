'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface StockVideo {
  id: number;
  title: string;
  duration: number;
  thumbnailUrl: string;
  previewUrl: string;
}

interface Props {
  /** Called when user selects and downloads a stock video */
  onSelect: (video: {
    id: string;
    filename: string;
    originalName: string;
    path: string;
    duration: number;
    width: number;
    height: number;
    thumbnail: string;
    storageFileId?: string;
  }) => void;
  /** Compact mode for inline use (e.g. scene slots) */
  compact?: boolean;
}

export default function StoryblocksSearch({ onSelect, compact }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockVideo[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(async (q: string, p: number) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/storyblocks/search?q=${encodeURIComponent(q.trim())}&page=${p}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Search failed' }));
        throw new Error(data.error || `Search failed (${res.status})`);
      }
      const data = await res.json();
      setResults(data.results || []);
      setTotalResults(data.totalResults || 0);
      setPage(p);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on typing
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.trim().length >= 2) {
      searchTimeout.current = setTimeout(() => search(value, 1), 500);
    }
  };

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  const handleDownload = async (video: StockVideo) => {
    setDownloading(video.id);
    setError(null);

    try {
      const res = await fetch('/api/storyblocks/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockItemId: video.id, title: video.title }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(data.error || `Download failed (${res.status})`);
      }

      const data = await res.json();
      if (data.video) {
        onSelect(data.video);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  };

  const hasMore = results.length > 0 && page * 20 < totalResults;

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search(query, 1)}
          placeholder="Search stock videos..."
          className={`w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:border-transparent ${
            compact ? 'py-1.5 text-xs' : 'py-2.5 text-sm'
          }`}
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Searching...
        </div>
      )}

      {error && (
        <div className={`text-red-400 ${compact ? 'text-xs' : 'text-sm'}`}>{error}</div>
      )}

      {/* Results grid */}
      {!loading && results.length > 0 && (
        <>
          <div className={`grid gap-2 ${compact ? 'grid-cols-2 max-h-[200px] overflow-y-auto' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
            {results.map((v) => (
              <div
                key={v.id}
                className="relative group bg-gray-800 rounded-lg overflow-hidden"
              >
                {/* Thumbnail / preview on hover */}
                <div
                  className="relative cursor-pointer"
                  onMouseEnter={() => setPreviewId(v.id)}
                  onMouseLeave={() => setPreviewId(null)}
                >
                  {previewId === v.id && v.previewUrl ? (
                    <video
                      ref={previewRef}
                      src={v.previewUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className={`w-full object-cover ${compact ? 'h-20' : 'h-28'}`}
                    />
                  ) : (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      className={`w-full object-cover ${compact ? 'h-20' : 'h-28'}`}
                      loading="lazy"
                    />
                  )}
                  {v.duration > 0 && (
                    <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                      {v.duration}s
                    </span>
                  )}
                </div>

                <div className={compact ? 'p-1.5' : 'p-2'}>
                  <p className={`text-gray-300 truncate ${compact ? 'text-xs' : 'text-xs'}`}>{v.title}</p>
                </div>

                {/* Use button */}
                <button
                  onClick={() => handleDownload(v)}
                  disabled={downloading === v.id}
                  className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 hover:opacity-100"
                >
                  {downloading === v.id ? (
                    <div className="flex items-center gap-1.5 text-white text-xs font-medium">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Downloading...
                    </div>
                  ) : (
                    <span className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg">
                      Use This
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className={`text-gray-500 ${compact ? 'text-xs' : 'text-sm'}`}>
              {totalResults.toLocaleString()} results
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <button
                  onClick={() => search(query, page - 1)}
                  className="px-3 py-1 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded hover:border-gray-500"
                >
                  Prev
                </button>
              )}
              {hasMore && (
                <button
                  onClick={() => search(query, page + 1)}
                  className="px-3 py-1 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded hover:border-gray-500"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {!loading && results.length === 0 && query.trim().length >= 2 && (
        <div className={`text-center text-gray-500 py-4 ${compact ? 'text-xs' : 'text-sm'}`}>
          No results found. Try different keywords.
        </div>
      )}

      {!loading && results.length === 0 && query.trim().length < 2 && (
        <div className={`text-center text-gray-500 py-4 ${compact ? 'text-xs' : 'text-sm'}`}>
          Search Storyblocks for stock footage
        </div>
      )}
    </div>
  );
}
