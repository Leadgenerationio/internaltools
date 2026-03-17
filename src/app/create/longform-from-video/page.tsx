'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import MusicStep from '@/components/longform/MusicStep';
import CaptionsStep from '@/components/longform/CaptionsStep';
import UploadProcessStep from '@/components/longform-from-video/UploadProcessStep';
import EditScenesStep from '@/components/longform-from-video/EditScenesStep';
import FinalizeFromVideoStep from '@/components/longform-from-video/FinalizeFromVideoStep';
import type { MusicTrack } from '@/lib/types';
import type { CaptionConfig, LongformResultItem } from '@/lib/longform-types';

const STEPS = ['Upload', 'Edit Scenes', 'Music', 'Captions', 'Finalize'];
const STORAGE_KEY = 'longform_from_video_v1';

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
  clipFilename?: string;
  source: 'original' | 'ai' | 'upload' | 'library' | 'stock';
  visualPrompt?: string;
}

function PageContent() {
  const [step, setStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Step 1: Upload
  const [uploadedVideo, setUploadedVideo] = useState<UploadedVideo | null>(null);
  const [extractedAudioUrl, setExtractedAudioUrl] = useState('');
  const [scenes, setScenes] = useState<SceneSlotData[]>([]);
  const [fullTranscript, setFullTranscript] = useState('');

  // Step 3: Music
  const [music, setMusic] = useState<MusicTrack | null>(null);

  // Step 4: Captions
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>({
    enabled: true,
    template: 'Hormozi 2',
    language: 'en',
    magicZooms: true,
    magicBrolls: false,
    transitions: false,
    cleanAudio: false,
  });

  // Step 5: Finalize
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [results, setResults] = useState<LongformResultItem[]>([]);

  const initialized = useRef(false);

  // Restore state from localStorage
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        if (s.uploadedVideo) setUploadedVideo(s.uploadedVideo);
        if (s.extractedAudioUrl) setExtractedAudioUrl(s.extractedAudioUrl);
        if (s.scenes) setScenes(s.scenes);
        if (s.fullTranscript) setFullTranscript(s.fullTranscript);
        if (s.music) setMusic(s.music);
        if (s.captionConfig) setCaptionConfig(s.captionConfig);
        if (s.aspectRatio) setAspectRatio(s.aspectRatio);
        if (s.step !== undefined) setStep(s.step);
        if (s.completedSteps) setCompletedSteps(new Set(s.completedSteps));
      }
    } catch { /* ignore */ }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    if (!initialized.current) return;
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        step, uploadedVideo, extractedAudioUrl, scenes, fullTranscript,
        music, captionConfig, aspectRatio,
        completedSteps: [...completedSteps],
      }));
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, uploadedVideo, extractedAudioUrl, scenes, fullTranscript, music, captionConfig, aspectRatio, completedSteps]);

  const markComplete = (idx: number) => {
    setCompletedSteps((prev) => new Set([...prev, idx]));
  };

  const goToStep = (target: number) => {
    if (target <= step || completedSteps.has(target) || target <= Math.max(...completedSteps, -1) + 1) {
      setStep(target);
    }
  };

  const handleStartNew = () => {
    setStep(0);
    setCompletedSteps(new Set());
    setUploadedVideo(null);
    setExtractedAudioUrl('');
    setScenes([]);
    setFullTranscript('');
    setMusic(null);
    setCaptionConfig({ enabled: true, template: 'Hormozi 2', language: 'en', magicZooms: true, magicBrolls: false, transitions: false, cleanAudio: false });
    setAspectRatio('9:16');
    setResults([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg sm:text-xl font-bold text-white hover:text-blue-400 transition-colors">Ad Maker</Link>
          <UserMenu />
        </div>
      </header>

      {/* Step bar */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
            {step > 0 && (
              <button
                onClick={handleStartNew}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-600/10 hover:text-red-300 transition-colors whitespace-nowrap border border-red-600/30"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                <span className="hidden sm:inline">Start New</span>
              </button>
            )}
            {STEPS.map((label, idx) => {
              const isCompleted = completedSteps.has(idx);
              const isCurrent = idx === step;
              const isClickable = isCompleted || idx <= step;
              return (
                <button
                  key={label}
                  onClick={() => isClickable && goToStep(idx)}
                  disabled={!isClickable}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    isCurrent ? 'bg-blue-600 text-white'
                    : isCompleted ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30 cursor-pointer'
                    : isClickable ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 cursor-pointer'
                    : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCurrent ? 'bg-white text-blue-600'
                    : isCompleted ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                  }`}>
                    {isCompleted ? '\u2713' : idx + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
      {step === 0 && (
        <UploadProcessStep
          uploadedVideo={uploadedVideo}
          onProcessed={(video, audioUrl, detectedScenes, transcript) => {
            setUploadedVideo(video);
            setExtractedAudioUrl(audioUrl);
            setScenes(detectedScenes);
            setFullTranscript(transcript);
            markComplete(0);
            setStep(1);
          }}
        />
      )}

      {step === 1 && (
        <EditScenesStep
          scenes={scenes}
          onScenesChange={setScenes}
          onNext={() => {
            markComplete(1);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <MusicStep
          music={music}
          onMusicChange={setMusic}
          onNext={() => {
            markComplete(2);
            setStep(3);
          }}
        />
      )}

      {step === 3 && (
        <CaptionsStep
          captionConfig={captionConfig}
          onConfigChange={setCaptionConfig}
          onNext={() => {
            markComplete(3);
            setStep(4);
          }}
        />
      )}

      {step === 4 && (
        <FinalizeFromVideoStep
          uploadedVideo={uploadedVideo!}
          extractedAudioUrl={extractedAudioUrl}
          scenes={scenes}
          music={music}
          captionConfig={captionConfig}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          results={results}
          onResults={setResults}
          onStartNew={handleStartNew}
        />
      )}
    </div>
    </div>
  );
}

export default function LongformFromVideoPage() {
  return (
    <Suspense>
      <PageContent />
    </Suspense>
  );
}
