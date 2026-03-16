'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UploadedVideo } from '@/lib/types';

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
}

interface Props {
  videos: UploadedVideo[];
  onUpload: (videos: UploadedVideo[]) => void;
}

export default function MediaLibrary({ videos, onUpload }: Props) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [manageMode, setManageMode] = useState(false);

  const selectedIds = new Set(videos.map((v) => v.storageFileId).filter(Boolean));

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/media?limit=50&aspect=9:16');
      if (!res.ok) throw new Error('Failed to load media library');
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const toggleVideo = (file: MediaFile) => {
    if (manageMode) return;
    if (selectedIds.has(file.id)) {
      onUpload(videos.filter((v) => v.storageFileId !== file.id));
    } else {
      const newVideo: UploadedVideo = {
        id: file.id,
        filename: file.originalName || 'Library Video',
        originalName: file.originalName || 'Library Video',
        path: file.publicUrl,
        duration: file.duration ?? 0,
        width: file.width ?? 0,
        height: file.height ?? 0,
        thumbnail: file.thumbnailUrl || '',
        storageFileId: file.id,
      };
      onUpload([...videos, newVideo]);
    }
  };

  const handleDelete = async (fileId: string) => {
    setDeleting((prev) => new Set(prev).add(fileId));
    try {
      const res = await fetch(`/api/media/${fileId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      // Also remove from selected videos if it was selected
      if (selectedIds.has(fileId)) {
        onUpload(videos.filter((v) => v.storageFileId !== fileId));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading library...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button
          onClick={() => { setError(null); fetchFiles(); }}
          className="text-sm text-blue-400 hover:text-blue-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">No 9:16 portrait videos in your library yet.</p>
        <p className="text-xs mt-1">Upload or generate vertical videos to build your library.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with manage toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{files.length} portrait video{files.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setManageMode(!manageMode)}
          className={`text-xs px-3 py-1 rounded-lg transition-colors ${
            manageMode
              ? 'bg-red-600/20 text-red-400 border border-red-600/40'
              : 'text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600'
          }`}
        >
          {manageMode ? 'Done' : 'Manage'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {files.map((file) => {
          const isSelected = selectedIds.has(file.id);
          const isDeleting = deleting.has(file.id);
          return (
            <div
              key={file.id}
              className={`relative group bg-gray-800 rounded-lg overflow-hidden text-left transition-all ${
                isDeleting ? 'opacity-50 pointer-events-none' : ''
              } ${
                !manageMode && isSelected
                  ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-900'
                  : !manageMode ? 'hover:ring-1 hover:ring-gray-600' : ''
              }`}
            >
              <button
                onClick={() => toggleVideo(file)}
                disabled={manageMode}
                className="w-full text-left"
              >
                {file.thumbnailUrl ? (
                  <img
                    src={file.thumbnailUrl}
                    alt={file.originalName || 'Video'}
                    className="w-full h-24 object-cover"
                  />
                ) : file.publicUrl ? (
                  <video
                    src={file.publicUrl}
                    className="w-full h-24 object-cover bg-gray-700"
                    preload="metadata"
                    muted
                  />
                ) : (
                  <div className="w-full h-24 bg-gray-700 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="p-2">
                  <p className="text-xs text-gray-300 truncate">{file.originalName || 'Untitled'}</p>
                  <p className="text-xs text-gray-500">
                    {file.duration != null ? `${file.duration.toFixed(1)}s` : ''}
                    {file.width && file.height ? ` \u00b7 ${file.width}x${file.height}` : ''}
                  </p>
                </div>
              </button>

              {/* Selection badge */}
              {!manageMode && isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}

              {/* Delete button in manage mode */}
              {manageMode && (
                <button
                  onClick={() => handleDelete(file.id)}
                  disabled={isDeleting}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"
                  title="Delete from library"
                >
                  {isDeleting ? (
                    <svg className="w-3 h-3 text-white animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
