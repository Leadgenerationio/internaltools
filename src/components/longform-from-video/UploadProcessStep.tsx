'use client';

import { useState, useRef } from 'react';

interface UploadedVideo {
  path: string;
  originalName: string;
  duration: number;
  width: number;
  height: number;
  thumbnail?: string;
}

interface SceneSlotData {
  id: string;
  order: number;
  start: number;
  end: number;
  duration: number;
  text: string;
  thumbnail: string;
  clipUrl: string;
  source: 'original' | 'ai' | 'upload' | 'library' | 'stock';
}

interface Props {
  uploadedVideo: UploadedVideo | null;
  onProcessed: (
    video: UploadedVideo,
    audioUrl: string,
    scenes: SceneSlotData[],
    transcript: string,
  ) => void;
}

export default function UploadProcessStep({ uploadedVideo, onProcessed }: Props) {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<UploadedVideo | null>(uploadedVideo);
  const [progressMsg, setProgressMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('videos', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      const uploaded = data.videos?.[0] || data.uploads?.[0] || data;
      const vid: UploadedVideo = {
        path: uploaded.path,
        originalName: uploaded.originalName || file.name,
        duration: uploaded.duration || 0,
        width: uploaded.width || 0,
        height: uploaded.height || 0,
        thumbnail: uploaded.thumbnail,
      };
      setVideo(vid);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async () => {
    if (!video) return;
    setProcessing(true);
    setError(null);
    setProgressMsg('Extracting audio & detecting scenes...');

    try {
      const res = await fetch('/api/longform-from-video/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: video.path,
          videoDuration: video.duration,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Processing failed (${res.status})`);
      }

      onProcessed(video, data.audioUrl, data.scenes, data.fullTranscript || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
      setProgressMsg('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      handleUpload(file);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Upload Your Video</h2>
        <p className="text-gray-400 text-sm">
          Upload a video with audio. We'll extract the audio, detect scenes, and transcribe the speech.
        </p>
      </div>

      {!video ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
        >
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-3">
              <span className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              <span className="text-gray-400">Uploading...</span>
            </div>
          ) : (
            <>
              <div className="text-4xl mb-3">📹</div>
              <p className="text-gray-300 font-medium">Drag & drop your video here</p>
              <p className="text-gray-500 text-sm mt-1">or click to browse. MP4, MOV, WebM up to 500MB.</p>
            </>
          )}
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50 space-y-4">
          <div className="flex items-start gap-4">
            {video.thumbnail && (
              <img
                src={video.thumbnail}
                alt="Video thumbnail"
                className="w-24 h-24 object-cover rounded-lg bg-gray-900"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{video.originalName}</p>
              <p className="text-sm text-gray-400 mt-1">
                {video.width}×{video.height} &middot; {video.duration.toFixed(1)}s
              </p>
            </div>
            <button
              onClick={() => setVideo(null)}
              className="text-gray-500 hover:text-gray-300 text-sm"
            >
              Remove
            </button>
          </div>

          {!processing && (
            <button
              onClick={handleProcess}
              className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
            >
              Process Video
            </button>
          )}

          {processing && (
            <div className="flex items-center gap-3 px-4 py-3 bg-blue-950/30 border border-blue-800 rounded-lg">
              <span className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
              <span className="text-sm text-blue-300">{progressMsg}</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
