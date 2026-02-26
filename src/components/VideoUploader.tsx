'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import type { UploadedVideo } from '@/lib/types';

const log = async (level: string, message: string, meta?: object) => {
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, ...meta }),
    });
  } catch {
    console.log(`[${level}]`, message, meta);
  }
};

interface Props {
  videos: UploadedVideo[];
  onUpload: (videos: UploadedVideo[]) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
}

export default function VideoUploader({ videos, onUpload, uploading, setUploading }: Props) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) {
      log('debug', 'handleFiles called with no files');
      return;
    }

    log('info', 'Files selected', { count: files.length, names: Array.from(files).map((f) => f.name), sizes: Array.from(files).map((f) => f.size) });

    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append('videos', f));

    log('debug', 'Starting fetch to /api/upload');

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      log('info', 'Upload response', { status: res.status, ok: res.ok });
      let data: { videos?: UploadedVideo[]; error?: string };
      try {
        data = await res.json();
      } catch {
        data = { error: res.status === 413 ? 'File too large' : `Upload failed (${res.status})` };
      }

      if (!res.ok) {
        log('error', 'Upload failed', { status: res.status, error: data.error });
        setUploadError(data.error || `Upload failed (${res.status})`);
        return;
      }
      if (data.videos && data.videos.length > 0) {
        log('info', 'Upload success', { count: data.videos.length });
        onUpload([...videos, ...data.videos]);
      } else {
        log('warn', 'No videos in response', { data });
        setUploadError(data.error || 'No videos returned');
      }
    } catch (err) {
      log('error', 'Upload exception', { error: String(err) });
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      inputRef.current && (inputRef.current.value = '');
    }
  }, [videos, onUpload, setUploading]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      log('debug', 'Input onChange fired', { hasFiles: !!e.target.files?.length });
      handleFiles(e.target.files);
    },
    [handleFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (!uploading) handleFiles(e.dataTransfer.files);
    },
    [handleFiles, uploading]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setIsDragOver(true);
  }, [uploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const removeVideo = (id: string) => {
    onUpload(videos.filter((v) => v.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Drop zone - use label to reliably trigger file input */}
      <label
        htmlFor="video-input"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`block border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${
          uploading
            ? 'border-blue-600 bg-blue-900/20 cursor-wait'
            : isDragOver
              ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
              : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/30'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-400">Uploading...</span>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-3">🎬</div>
            <p className="text-gray-400">
              Drag & drop videos here, or <span className="text-blue-400 underline">browse</span>
            </p>
            <p className="text-gray-500 text-sm mt-1">MP4, MOV, WebM supported. Max 500MB per file. Upload multiple for batch.</p>
          </>
        )}
      </label>
      <input
        ref={inputRef}
        id="video-input"
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/*"
        multiple
        className="sr-only"
        onChange={handleChange}
        disabled={uploading}
      />

      {uploadError && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
          <span>{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            className="shrink-0 text-red-400 hover:text-red-200 p-1 rounded"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Video thumbnails */}
      {videos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {videos.map((v) => (
            <div key={v.id} className="relative group bg-gray-800 rounded-lg overflow-hidden">
              <img
                src={v.thumbnail}
                alt={v.originalName}
                className="w-full h-24 object-cover"
              />
              <div className="p-2">
                <p className="text-xs text-gray-300 truncate">{v.originalName}</p>
                <p className="text-xs text-gray-500">{v.duration.toFixed(1)}s • {v.width}x{v.height}</p>
              </div>
              <button
                onClick={() => removeVideo(v.id)}
                className="absolute top-1 right-1 w-6 h-6 bg-red-500/90 hover:bg-red-500 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white"
                aria-label={`Remove ${v.originalName}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
