'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

type Tab = 'all' | 'b-roll' | 'talking-heads' | 'avatars' | 'images' | 'audio';

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
  tag: string | null;
}

interface AvatarItem {
  id: string;
  name: string;
  imageUrl: string;
  prompt?: string;
  createdAt: string;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All Media' },
  { id: 'b-roll', label: 'B-Roll' },
  { id: 'talking-heads', label: 'Talking Heads' },
  { id: 'avatars', label: 'Avatars' },
  { id: 'images', label: 'Images' },
  { id: 'audio', label: 'Audio' },
];

const TAG_OPTIONS = [
  { value: '', label: 'No tag' },
  { value: 'b-roll', label: 'B-Roll' },
  { value: 'talking-head', label: 'Talking Head' },
  { value: 'avatar', label: 'Avatar' },
  { value: 'voiceover', label: 'Voiceover' },
  { value: 'music', label: 'Music' },
  { value: 'clip', label: 'Clip' },
  { value: 'product', label: 'Product' },
  { value: 'ad', label: 'Ad Output' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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

function getTagColor(tag: string | null): string {
  switch (tag) {
    case 'b-roll': return 'bg-purple-600/80 text-purple-100';
    case 'talking-head': return 'bg-cyan-600/80 text-cyan-100';
    case 'avatar': return 'bg-blue-600/80 text-blue-100';
    case 'voiceover': return 'bg-orange-600/80 text-orange-100';
    case 'music': return 'bg-pink-600/80 text-pink-100';
    case 'clip': return 'bg-yellow-600/80 text-yellow-100';
    case 'product': return 'bg-green-600/80 text-green-100';
    case 'ad': return 'bg-red-600/80 text-red-100';
    default: return 'bg-gray-700 text-gray-300';
  }
}

export default function MediaLibraryPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTag, setEditTag] = useState('');

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '24' });
      if (search.trim()) params.set('search', search.trim());

      if (tab === 'b-roll') {
        params.set('category', 'videos');
        params.set('tag', 'b-roll');
      } else if (tab === 'talking-heads') {
        params.set('category', 'videos');
        params.set('tag', 'talking-head');
      } else if (tab === 'images') {
        params.set('category', 'images');
      } else if (tab === 'audio') {
        params.set('category', 'audio');
      }
      // 'all' and 'avatars' don't set category/tag

      const res = await fetch(`/api/media?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        setTotal(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, tab, search]);

  const fetchAvatars = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/avatar/library?limit=50');
      if (res.ok) {
        const data = await res.json();
        setAvatars(data.avatars || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (tab === 'avatars') fetchAvatars();
    else fetchFiles();
  }, [status, tab, fetchFiles, fetchAvatars]);

  useEffect(() => { setPage(1); }, [tab, search]);

  const handleDelete = async (id: string) => {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch { /* ignore */ }
    finally { setDeleting((prev) => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const handleDeleteAvatar = async (id: string) => {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/avatar/library/${id}`, { method: 'DELETE' });
      if (res.ok) setAvatars((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ }
    finally { setDeleting((prev) => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const startEditing = (file: MediaFile) => {
    setEditing(file.id);
    setEditName(file.originalName || '');
    setEditTag(file.tag || '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const res = await fetch(`/api/media/${editing}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, tag: editTag }),
      });
      if (res.ok) {
        setFiles((prev) => prev.map((f) =>
          f.id === editing ? { ...f, originalName: editName, tag: editTag || null } : f
        ));
      }
    } catch { /* ignore */ }
    setEditing(null);
  };

  const getFileType = (mimeType: string | null) => {
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Media Library</h1>
            <p className="text-sm text-gray-400 mt-0.5">Organise your b-roll, talking heads, avatars, and more.</p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-56"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors shrink-0 ${
                tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Avatar grid */}
        {tab === 'avatars' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-400">{avatars.length} avatar{avatars.length !== 1 ? 's' : ''}</p>
              <Link href="/create/avatar-video" className="text-sm text-blue-400 hover:text-blue-300">+ Create Avatar</Link>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" /> Loading...
              </div>
            ) : avatars.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p>No avatars yet.</p>
                <Link href="/create/avatar-video" className="text-sm text-blue-400 mt-2 inline-block">Create your first avatar</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {avatars.map((a) => (
                  <div key={a.id} className={`group relative bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-colors ${deleting.has(a.id) ? 'opacity-50' : ''}`}>
                    <div className="aspect-square bg-gray-800">
                      <img src={normalizeUrl(a.imageUrl)} alt={a.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-2.5">
                      <p className="text-sm text-white font-medium truncate">{a.name}</p>
                      <p className="text-xs text-gray-500">{formatDate(a.createdAt)}</p>
                    </div>
                    <button onClick={() => handleDeleteAvatar(a.id)} className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* File grid */}
        {tab !== 'avatars' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-400">{total} item{total !== 1 ? 's' : ''}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" /> Loading...
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p>{search ? 'No results found.' : tab === 'b-roll' ? 'No b-roll tagged yet. Edit any video to tag it as b-roll.' : tab === 'talking-heads' ? 'No talking head videos yet. Create one in the Avatar Video Creator.' : 'No media files yet.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {files.map((file) => {
                  const type = getFileType(file.mimeType);
                  const isDeleting = deleting.has(file.id);
                  const isEditing = editing === file.id;

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
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                            </svg>
                          </div>
                        )}
                        {/* Tag badge */}
                        {file.tag && (
                          <span className={`absolute top-1.5 left-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${getTagColor(file.tag)}`}>
                            {TAG_OPTIONS.find((o) => o.value === file.tag)?.label || file.tag}
                          </span>
                        )}
                        {/* Duration */}
                        {file.duration != null && (
                          <span className="absolute bottom-1.5 right-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/70 text-white">
                            {file.duration.toFixed(1)}s
                          </span>
                        )}
                      </div>

                      {/* Info / Edit mode */}
                      {isEditing ? (
                        <div className="p-2 space-y-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                          <select
                            value={editTag}
                            onChange={(e) => setEditTag(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                          >
                            {TAG_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <div className="flex gap-1">
                            <button onClick={saveEdit} className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium">Save</button>
                            <button onClick={() => setEditing(null)} className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5">
                          <p className="text-xs text-white truncate">{file.originalName || 'Untitled'}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {file.width && file.height ? `${file.width}x${file.height}` : ''}
                            {file.sizeBytes ? ` · ${formatBytes(Number(file.sizeBytes))}` : ''}
                          </p>
                        </div>
                      )}

                      {/* Hover actions */}
                      {!isEditing && (
                        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEditing(file)} className="w-6 h-6 bg-gray-700/90 hover:bg-blue-600 rounded-full flex items-center justify-center" title="Edit">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(file.id)} className="w-6 h-6 bg-gray-700/90 hover:bg-red-600 rounded-full flex items-center justify-center" title="Delete">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 disabled:opacity-50 hover:bg-gray-700">Previous</button>
                <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 disabled:opacity-50 hover:bg-gray-700">Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
