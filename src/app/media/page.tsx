'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

type Category = 'all' | 'videos' | 'images' | 'audio';

interface MediaFile {
  id: string;
  publicUrl: string;
  originalName: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  createdAt: string;
  sizeBytes: number | null;
}

interface AvatarItem {
  id: string;
  name: string;
  imageUrl: string;
  prompt?: string;
  createdAt: string;
}

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'all', label: 'All Media', icon: 'grid' },
  { id: 'videos', label: 'Videos', icon: 'video' },
  { id: 'images', label: 'Images', icon: 'image' },
  { id: 'audio', label: 'Audio', icon: 'audio' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function normalizeUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('/api/files')) return url;
  if (url.startsWith('/')) return url;
  const match = url.match(/\/object\/public\/[^/]+\/(.+)$/);
  if (match) return `/api/files?path=${encodeURIComponent(match[1])}`;
  const pathMatch = url.match(/(outputs\/[^\s?#]+|longform\/[^\s?#]+|uploads\/[^\s?#]+)/);
  if (pathMatch) return `/api/files?path=${encodeURIComponent(pathMatch[1])}`;
  return url;
}

export default function MediaLibraryPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [showAvatars, setShowAvatars] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState<Set<string>>(new Set());

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '24', category });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/media?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        setTotal(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, category, search]);

  const fetchAvatars = useCallback(async () => {
    try {
      const res = await fetch('/api/avatar/library?limit=50');
      if (res.ok) {
        const data = await res.json();
        setAvatars(data.avatars || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      if (showAvatars) {
        fetchAvatars();
      } else {
        fetchFiles();
      }
    }
  }, [status, showAvatars, fetchFiles, fetchAvatars]);

  // Reset page when category/search changes
  useEffect(() => { setPage(1); }, [category, search]);

  const handleDelete = async (id: string) => {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch { /* ignore */ }
    finally {
      setDeleting((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleDeleteAvatar = async (id: string) => {
    setDeletingAvatar((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/avatar/library/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAvatars((prev) => prev.filter((a) => a.id !== id));
      }
    } catch { /* ignore */ }
    finally {
      setDeletingAvatar((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const getFileIcon = (mimeType: string | null) => {
    if (mimeType?.startsWith('video/')) return 'video';
    if (mimeType?.startsWith('image/')) return 'image';
    if (mimeType?.startsWith('audio/')) return 'audio';
    return 'file';
  };

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="text-lg sm:text-xl font-bold text-white shrink-0 hover:text-blue-400 transition-colors">Ad Maker</Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Media Library</h1>
            <p className="text-sm text-gray-400 mt-0.5">All your videos, images, avatars, and audio in one place.</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-64"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          <button
            onClick={() => { setShowAvatars(true); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 flex items-center gap-2 ${
              showAvatars ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            Avatars
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setShowAvatars(false); setCategory(cat.id); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 flex items-center gap-2 ${
                !showAvatars && category === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {cat.id === 'all' && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                </svg>
              )}
              {cat.id === 'videos' && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              )}
              {cat.id === 'images' && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                </svg>
              )}
              {cat.id === 'audio' && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
              )}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Avatars view */}
        {showAvatars && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-400">{avatars.length} avatar{avatars.length !== 1 ? 's' : ''}</p>
              <Link href="/create/avatar-video" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                Create New Avatar
              </Link>
            </div>

            {avatars.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                <p className="text-gray-400">No avatars yet.</p>
                <Link href="/create/avatar-video" className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block">
                  Create your first avatar
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {avatars.map((avatar) => (
                  <div key={avatar.id} className={`group relative bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-colors ${deletingAvatar.has(avatar.id) ? 'opacity-50' : ''}`}>
                    <div className="aspect-square bg-gray-800">
                      <img src={normalizeUrl(avatar.imageUrl)} alt={avatar.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-3">
                      <p className="text-sm text-white font-medium truncate">{avatar.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(avatar.createdAt)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteAvatar(avatar.id)}
                      disabled={deletingAvatar.has(avatar.id)}
                      className="absolute top-2 right-2 w-7 h-7 bg-red-600/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete avatar"
                    >
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Files view */}
        {!showAvatars && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-400">{total} item{total !== 1 ? 's' : ''}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
                Loading...
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Z" />
                </svg>
                <p className="text-gray-400">{search ? 'No results found.' : 'No media files yet.'}</p>
                <p className="text-xs text-gray-500 mt-1">Upload or generate content to build your library.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {files.map((file) => {
                  const type = getFileIcon(file.mimeType);
                  const isDeleting = deleting.has(file.id);
                  return (
                    <div key={file.id} className={`group relative bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-colors ${isDeleting ? 'opacity-50' : ''}`}>
                      {/* Preview */}
                      <div className="aspect-video bg-gray-800 relative">
                        {type === 'video' && file.thumbnailUrl ? (
                          <img src={normalizeUrl(file.thumbnailUrl)} alt="" className="w-full h-full object-cover" />
                        ) : type === 'video' ? (
                          <video src={normalizeUrl(file.publicUrl)} className="w-full h-full object-cover" preload="metadata" muted />
                        ) : type === 'image' ? (
                          <img src={normalizeUrl(file.publicUrl)} alt="" className="w-full h-full object-cover" />
                        ) : type === 'audio' ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                          </div>
                        )}

                        {/* Type badge */}
                        <div className="absolute bottom-1.5 left-1.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            type === 'video' ? 'bg-purple-600/80 text-purple-100'
                            : type === 'image' ? 'bg-green-600/80 text-green-100'
                            : type === 'audio' ? 'bg-orange-600/80 text-orange-100'
                            : 'bg-gray-700 text-gray-300'
                          }`}>
                            {type === 'video' ? 'VIDEO' : type === 'image' ? 'IMAGE' : type === 'audio' ? 'AUDIO' : 'FILE'}
                          </span>
                        </div>

                        {/* Duration badge for video/audio */}
                        {file.duration != null && (
                          <div className="absolute bottom-1.5 right-1.5">
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/70 text-white">
                              {file.duration.toFixed(1)}s
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <p className="text-sm text-white truncate">{file.originalName || 'Untitled'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {file.width && file.height && (
                            <span className="text-xs text-gray-500">{file.width}x{file.height}</span>
                          )}
                          {file.sizeBytes && (
                            <span className="text-xs text-gray-500">{formatBytes(Number(file.sizeBytes))}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{formatDate(file.createdAt)}</p>
                      </div>

                      {/* Delete button on hover */}
                      <button
                        onClick={() => handleDelete(file.id)}
                        disabled={isDeleting}
                        className="absolute top-2 right-2 w-7 h-7 bg-red-600/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete"
                      >
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 disabled:opacity-50 hover:bg-gray-700 transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 disabled:opacity-50 hover:bg-gray-700 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
