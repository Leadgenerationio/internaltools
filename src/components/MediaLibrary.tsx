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

  const selectedIds = new Set(videos.map((v) => v.storageFileId).filter(Boolean));

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/media?limit=50');
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
    if (selectedIds.has(file.id)) {
      // Remove
      onUpload(videos.filter((v) => v.storageFileId !== file.id));
    } else {
      // Add
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
          onClick={fetchFiles}
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
        <p className="text-sm">No videos in your library yet.</p>
        <p className="text-xs mt-1">Upload or generate videos to build your library.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {files.map((file) => {
        const isSelected = selectedIds.has(file.id);
        return (
          <button
            key={file.id}
            onClick={() => toggleVideo(file)}
            className={`relative group bg-gray-800 rounded-lg overflow-hidden text-left transition-all ${
              isSelected
                ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-900'
                : 'hover:ring-1 hover:ring-gray-600'
            }`}
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
            {isSelected && (
              <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
