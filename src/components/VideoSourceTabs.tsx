'use client';

import { useState } from 'react';
import VideoUploader from '@/components/VideoUploader';
import VideoGenerator from '@/components/VideoGenerator';
import type { UploadedVideo } from '@/lib/types';
import Tooltip from '@/components/Tooltip';

type Tab = 'upload' | 'generate';

interface Props {
  videos: UploadedVideo[];
  onUpload: (videos: UploadedVideo[]) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  generating: boolean;
  setGenerating: (v: boolean) => void;
}

export default function VideoSourceTabs({
  videos,
  onUpload,
  uploading,
  setUploading,
  generating,
  setGenerating,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('upload');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'generate', label: 'AI Generate' },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white flex items-center">
        1. Background Videos
        <Tooltip text="These are the background videos your ad text will appear over. Upload your own or generate one with AI." />
      </h2>

      {/* Tab bar */}
      <div className="flex border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'upload' ? (
        <VideoUploader
          videos={videos}
          onUpload={onUpload}
          uploading={uploading}
          setUploading={setUploading}
        />
      ) : (
        <VideoGenerator
          videos={videos}
          onUpload={onUpload}
          generating={generating}
          setGenerating={setGenerating}
        />
      )}

      {/* Video thumbnails — shown on generate tab (upload tab has its own) */}
      {activeTab === 'generate' && videos.length > 0 && (
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
                <p className="text-xs text-gray-500">{v.duration.toFixed(1)}s &bull; {v.width}x{v.height}</p>
              </div>
              <button
                onClick={() => onUpload(videos.filter((vid) => vid.id !== v.id))}
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
