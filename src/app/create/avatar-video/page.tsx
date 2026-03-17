'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import UserMenu from '@/components/UserMenu';
import type { AvatarWizardStep, AvatarItem } from '@/lib/avatar-types';

const GoogleDriveButton = dynamic(() => import('@/components/GoogleDriveButton'), { ssr: false });

const STEPS: { id: AvatarWizardStep; label: string }[] = [
  { id: 'create', label: 'Create Avatar' },
  { id: 'edit', label: 'Edit & Save' },
  { id: 'product', label: 'Product' },
  { id: 'script', label: 'Script & Voice' },
  { id: 'generate', label: 'Generate' },
  { id: 'done', label: 'Done' },
];

interface VoiceOption {
  id: string;
  name: string;
  category: string;
  previewUrl: string;
  accent: string;
  gender: string;
  age: string;
}

export default function AvatarVideoPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // ─── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<AvatarWizardStep>('create');

  // Step 1: Create avatar
  const [avatarPrompt, setAvatarPrompt] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryAvatars, setLibraryAvatars] = useState<AvatarItem[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // Step 2: Edit & save
  const [avatarName, setAvatarName] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Step 3: Product (optional)
  // Placeholder for future product upload + angle generation

  // Step 4: Script & voice
  const [script, setScript] = useState('');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [voiceSearchQuery, setVoiceSearchQuery] = useState('');
  const [generatingVoiceover, setGeneratingVoiceover] = useState(false);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [voiceoverDuration, setVoiceoverDuration] = useState<number | null>(null);
  const [voiceoverError, setVoiceoverError] = useState<string | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Step 5: Generate
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Step 6: Done
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [cropAspect, setCropAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [cropPosX, setCropPosX] = useState(0.5);
  const [cropPosY, setCropPosY] = useState(0.5);
  const [cropping, setCropping] = useState(false);
  const [croppedVideoUrl, setCroppedVideoUrl] = useState<string | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  // ─── Fetch voices on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoadingVoices(true);
    fetch('/api/longform/voices')
      .then((r) => r.json())
      .then((data) => {
        if (data.voices) setVoices(data.voices);
      })
      .catch(() => {})
      .finally(() => setLoadingVoices(false));
  }, [status]);

  // ─── Step 1: Generate avatar image ────────────────────────────────────────
  const handleGenerateImage = useCallback(async () => {
    if (!avatarPrompt.trim()) return;
    setGeneratingImage(true);
    setImageError(null);

    try {
      const res = await fetch('/api/avatar/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: avatarPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate image');
      setAvatarImageUrl(data.imageUrl);
      setStep('edit');
    } catch (err: any) {
      setImageError(err.message);
    } finally {
      setGeneratingImage(false);
    }
  }, [avatarPrompt]);

  // ─── Step 1: Load avatar library ──────────────────────────────────────────
  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      const res = await fetch('/api/avatar/library?limit=50');
      const data = await res.json();
      if (data.avatars) setLibraryAvatars(data.avatars);
    } catch { /* ignore */ }
    finally { setLoadingLibrary(false); }
  }, []);

  useEffect(() => {
    if (showLibrary && libraryAvatars.length === 0) loadLibrary();
  }, [showLibrary, libraryAvatars.length, loadLibrary]);

  const selectFromLibrary = useCallback((avatar: AvatarItem) => {
    setAvatarImageUrl(avatar.imageUrl);
    setAvatarName(avatar.name);
    setAvatarId(avatar.id);
    setAvatarPrompt(avatar.prompt || '');
    setSaved(true);
    setShowLibrary(false);
    setStep('edit');
  }, []);

  // ─── Step 2: Save avatar ─────────────────────────────────────────────────
  const handleSaveAvatar = useCallback(async () => {
    if (!avatarName.trim() || !avatarImageUrl) return;
    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/avatar/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: avatarName.trim(),
          imageUrl: avatarImageUrl,
          prompt: avatarPrompt.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setAvatarId(data.avatar.id);
      setSaved(true);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }, [avatarName, avatarImageUrl, avatarPrompt]);

  // ─── Step 4: Voice preview ────────────────────────────────────────────────
  const handlePreviewVoice = useCallback((voiceId: string, previewUrl: string) => {
    if (previewingVoice === voiceId) {
      previewAudioRef.current?.pause();
      setPreviewingVoice(null);
      return;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    const audio = new Audio(previewUrl);
    audio.onended = () => setPreviewingVoice(null);
    audio.play().catch(() => {});
    previewAudioRef.current = audio;
    setPreviewingVoice(voiceId);
  }, [previewingVoice]);

  // ─── Step 4: Generate voiceover ───────────────────────────────────────────
  const handleGenerateVoiceover = useCallback(async () => {
    if (!script.trim() || !selectedVoiceId) return;
    setGeneratingVoiceover(true);
    setVoiceoverError(null);

    try {
      const res = await fetch('/api/avatar/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: script.trim(), voiceId: selectedVoiceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voiceover generation failed');
      setVoiceoverUrl(data.voiceoverUrl);
      setVoiceoverDuration(data.durationSeconds);
    } catch (err: any) {
      setVoiceoverError(err.message);
    } finally {
      setGeneratingVoiceover(false);
    }
  }, [script, selectedVoiceId]);

  // ─── Step 5: Generate video ───────────────────────────────────────────────
  const handleGenerateVideo = useCallback(async () => {
    if (!avatarImageUrl || !voiceoverUrl) return;
    setGeneratingVideo(true);
    setVideoError(null);
    setVideoProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/avatar/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarImageUrl,
          voiceoverUrl,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start video generation');

      if (data.jobId) {
        // Dynamic import pollJob to keep bundle small
        const { pollJob } = await import('@/lib/poll-job');
        const result = await pollJob(data.jobId, 'avatar', {
          onProgress: (progress) => setVideoProgress(progress),
          signal: controller.signal,
        });

        if (result.state === 'completed' && result.result) {
          const videoResult = result.result as { videoUrl: string };
          setFinalVideoUrl(videoResult.videoUrl);
          setStep('done');
        } else {
          throw new Error(result.error || 'Video generation failed');
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setVideoError(err.message);
      }
    } finally {
      setGeneratingVideo(false);
      abortRef.current = null;
    }
  }, [avatarImageUrl, voiceoverUrl]);

  const handleCancelGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ─── Step 6: Crop video ──────────────────────────────────────────────────
  const handleCrop = useCallback(async () => {
    const sourceUrl = finalVideoUrl;
    if (!sourceUrl) return;
    setCropping(true);
    setCropError(null);

    try {
      const res = await fetch('/api/avatar/crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: sourceUrl,
          aspectRatio: cropAspect,
          posX: cropPosX,
          posY: cropPosY,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Crop failed');
      setCroppedVideoUrl(data.videoUrl);
    } catch (err: any) {
      setCropError(err.message);
    } finally {
      setCropping(false);
    }
  }, [finalVideoUrl, cropAspect, cropPosX, cropPosY]);

  // ─── Step 6: Save to media library ─────────────────────────────────────────
  const handleSaveToLibrary = useCallback(async () => {
    const videoToSave = croppedVideoUrl || finalVideoUrl;
    if (!videoToSave) return;
    setSavingToLibrary(true);
    setLibraryError(null);

    try {
      const res = await fetch('/api/avatar/save-to-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: videoToSave,
          name: avatarName || 'Avatar Video',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setSavedToLibrary(true);
    } catch (err: any) {
      setLibraryError(err.message);
    } finally {
      setSavingToLibrary(false);
    }
  }, [croppedVideoUrl, finalVideoUrl, avatarName]);

  // ─── Cleanup audio on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      abortRef.current?.abort();
    };
  }, []);

  // ─── Loading / auth guard ─────────────────────────────────────────────────
  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  // ─── Filter voices for search ─────────────────────────────────────────────
  const filteredVoices = voiceSearchQuery
    ? voices.filter((v) =>
        v.name.toLowerCase().includes(voiceSearchQuery.toLowerCase()) ||
        v.accent?.toLowerCase().includes(voiceSearchQuery.toLowerCase()) ||
        v.gender?.toLowerCase().includes(voiceSearchQuery.toLowerCase())
      )
    : voices;

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="text-lg sm:text-xl font-bold text-white shrink-0 hover:text-blue-400 transition-colors">
            Ad Maker
          </Link>
          <UserMenu />
        </div>
      </header>

      {/* Step indicators */}
      <div className="border-b border-gray-800 px-3 sm:px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center shrink-0">
              {i > 0 && <div className={`w-4 sm:w-8 h-px mx-1 ${i <= currentStepIndex ? 'bg-blue-500' : 'bg-gray-700'}`} />}
              <button
                onClick={() => { if (i <= currentStepIndex) setStep(s.id); }}
                disabled={i > currentStepIndex}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs sm:text-sm font-medium transition-colors ${
                  step === s.id
                    ? 'bg-blue-600 text-white'
                    : i < currentStepIndex
                    ? 'bg-gray-800 text-blue-400 hover:bg-gray-700 cursor-pointer'
                    : 'bg-gray-900 text-gray-600 cursor-not-allowed'
                }`}
              >
                <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${
                  step === s.id ? 'bg-white text-blue-600' : i < currentStepIndex ? 'bg-blue-500/30 text-blue-400' : 'bg-gray-800 text-gray-600'
                }`}>
                  {i < currentStepIndex ? '\u2713' : i + 1}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ═══ Step 1: Create Avatar ═══ */}
        {step === 'create' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Create Your Avatar</h2>
              <p className="text-gray-400 text-sm">Describe the person you want as your avatar, or select one from your library.</p>
            </div>

            {/* Toggle: Generate vs Library */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowLibrary(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !showLibrary ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Generate New
              </button>
              <button
                onClick={() => setShowLibrary(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showLibrary ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Select from Library
              </button>
            </div>

            {!showLibrary ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Avatar Description</label>
                  <textarea
                    value={avatarPrompt}
                    onChange={(e) => setAvatarPrompt(e.target.value)}
                    placeholder="A professional woman in her 30s with dark hair, wearing a navy blazer, neutral background, studio lighting, portrait photo, looking at camera..."
                    rows={4}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">Be specific about appearance, clothing, background, and lighting. Cost: 2 tokens.</p>
                </div>

                {imageError && (
                  <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">{imageError}</div>
                )}

                <button
                  onClick={handleGenerateImage}
                  disabled={!avatarPrompt.trim() || generatingImage}
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {generatingImage && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {generatingImage ? 'Generating (30-60s)...' : 'Generate Avatar Image'}
                </button>
              </div>
            ) : (
              <div>
                {loadingLibrary ? (
                  <div className="flex items-center gap-2 text-gray-400 py-8">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Loading library...
                  </div>
                ) : libraryAvatars.length === 0 ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                    <p className="text-gray-400">No saved avatars yet. Generate one first!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {libraryAvatars.map((avatar) => (
                      <button
                        key={avatar.id}
                        onClick={() => selectFromLibrary(avatar)}
                        className="group bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-blue-500 transition-colors text-left"
                      >
                        <div className="aspect-square bg-gray-800 relative overflow-hidden">
                          <img
                            src={avatar.imageUrl}
                            alt={avatar.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/20 transition-colors flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-medium text-sm bg-blue-600 px-3 py-1 rounded-full">
                              Select
                            </span>
                          </div>
                        </div>
                        <div className="p-2">
                          <p className="text-sm text-white font-medium truncate">{avatar.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ Step 2: Edit & Save ═══ */}
        {step === 'edit' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Edit & Save Avatar</h2>
              <p className="text-gray-400 text-sm">Review your avatar and save it to your library for reuse.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Avatar preview */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {avatarImageUrl && (
                  <img
                    src={avatarImageUrl}
                    alt="Generated avatar"
                    className="w-full aspect-square object-cover"
                  />
                )}
              </div>

              {/* Save form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Avatar Name</label>
                  <input
                    type="text"
                    value={avatarName}
                    onChange={(e) => { setAvatarName(e.target.value); setSaved(false); }}
                    placeholder="e.g. Sarah - Professional"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {avatarPrompt && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Prompt Used</label>
                    <p className="text-xs text-gray-500 bg-gray-800 rounded-lg p-3">{avatarPrompt}</p>
                  </div>
                )}

                {saveError && (
                  <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">{saveError}</div>
                )}

                <div className="flex gap-3">
                  {!saved && (
                    <button
                      onClick={handleSaveAvatar}
                      disabled={!avatarName.trim() || saving}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      {saving ? 'Saving...' : 'Save to Library'}
                    </button>
                  )}

                  {saved && (
                    <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Saved to library
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setStep('product')}
                  className="w-full px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors mt-4"
                >
                  Next: Product (Optional)
                </button>

                <button
                  onClick={() => { setAvatarImageUrl(null); setAvatarName(''); setSaved(false); setAvatarId(null); setStep('create'); }}
                  className="w-full px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Generate a Different Avatar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Step 3: Product (Optional) ═══ */}
        {step === 'product' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Product Images (Optional)</h2>
              <p className="text-gray-400 text-sm">Upload a product image to include in your avatar video. You can skip this step.</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center space-y-4">
              <div className="w-12 h-12 mx-auto bg-gray-800 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-300 font-medium">Product Multi-Angle Generation</p>
                <p className="text-xs text-gray-500 mt-1">Upload a product photo and generate 9 different angles using AI. This feature is coming soon.</p>
              </div>
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-xs text-gray-500">
                When available, this will cost 5 tokens to generate a grid of 9 product angles from a single photo.
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('script')}
                className="flex-1 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
              >
                Skip &mdash; Continue to Script
              </button>
            </div>
          </div>
        )}

        {/* ═══ Step 4: Script & Voice ═══ */}
        {step === 'script' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Script & Voice</h2>
              <p className="text-gray-400 text-sm">Write your script and select a voice for your avatar.</p>
            </div>

            {/* Script textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Script</label>
              <textarea
                value={script}
                onChange={(e) => { setScript(e.target.value); setVoiceoverUrl(null); setVoiceoverDuration(null); }}
                placeholder="Write the script your avatar will speak..."
                rows={6}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex justify-between mt-1">
                <p className="text-xs text-gray-500">The avatar will lip-sync to this audio.</p>
                <p className="text-xs text-gray-500">{script.length} chars</p>
              </div>
            </div>

            {/* Voice selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Voice</label>
              {loadingVoices ? (
                <div className="flex items-center gap-2 text-gray-400 py-4 text-sm">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Loading voices...
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={voiceSearchQuery}
                    onChange={(e) => setVoiceSearchQuery(e.target.value)}
                    placeholder="Search voices by name, accent, or gender..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <div className="max-h-48 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg divide-y divide-gray-800">
                    {filteredVoices.slice(0, 50).map((voice) => (
                      <button
                        key={voice.id}
                        onClick={() => setSelectedVoiceId(voice.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                          selectedVoiceId === voice.id
                            ? 'bg-blue-600/20 text-blue-300'
                            : 'text-gray-300 hover:bg-gray-800'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{voice.name}</span>
                          {(voice.accent || voice.gender) && (
                            <span className="ml-2 text-xs text-gray-500">
                              {[voice.gender, voice.accent, voice.age].filter(Boolean).join(' / ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {voice.previewUrl && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePreviewVoice(voice.id, voice.previewUrl); }}
                              className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
                              title="Preview voice"
                            >
                              {previewingVoice === voice.id ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                                </svg>
                              )}
                            </button>
                          )}
                          {selectedVoiceId === voice.id && (
                            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                      </button>
                    ))}
                    {filteredVoices.length === 0 && (
                      <p className="px-3 py-4 text-sm text-gray-500 text-center">No voices found</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Generate voiceover */}
            {voiceoverError && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">{voiceoverError}</div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerateVoiceover}
                disabled={!script.trim() || !selectedVoiceId || generatingVoiceover}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {generatingVoiceover && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {generatingVoiceover ? 'Generating...' : voiceoverUrl ? 'Regenerate Voiceover (2 tokens)' : 'Generate Voiceover (2 tokens)'}
              </button>
            </div>

            {/* Audio player */}
            {voiceoverUrl && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-300">Voiceover Preview</p>
                  {voiceoverDuration !== null && (
                    <span className="text-xs text-gray-500">{voiceoverDuration.toFixed(1)}s</span>
                  )}
                </div>
                <audio controls className="w-full" src={voiceoverUrl}>
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Next button */}
            <button
              onClick={() => setStep('generate')}
              disabled={!voiceoverUrl}
              className="w-full px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
            >
              Next: Generate Video
            </button>
          </div>
        )}

        {/* ═══ Step 5: Generate Video ═══ */}
        {step === 'generate' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Generate Avatar Video</h2>
              <p className="text-gray-400 text-sm">Review your setup and generate the lip-synced avatar video.</p>
            </div>

            {/* Summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-medium text-gray-300">Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Avatar preview */}
                <div className="flex items-center gap-3">
                  {avatarImageUrl && (
                    <img src={avatarImageUrl} alt="Avatar" className="w-16 h-16 rounded-lg object-cover border border-gray-700" />
                  )}
                  <div>
                    <p className="text-sm text-white font-medium">{avatarName || 'Avatar'}</p>
                    <p className="text-xs text-gray-500">Avatar image</p>
                  </div>
                </div>

                {/* Voice info */}
                <div>
                  <p className="text-sm text-white font-medium">
                    {voices.find((v) => v.id === selectedVoiceId)?.name || 'Selected voice'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {voiceoverDuration ? `${voiceoverDuration.toFixed(1)}s voiceover` : 'Voiceover'}
                  </p>
                </div>
              </div>

              {/* Script preview */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Script</p>
                <p className="text-sm text-gray-300 bg-gray-800 rounded-lg p-3 max-h-24 overflow-y-auto">{script}</p>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs text-gray-500">
                Cost: 10 tokens. The video will be generated using AI lip-sync technology.
              </div>
            </div>

            {videoError && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">{videoError}</div>
            )}

            {generatingVideo ? (
              <div className="space-y-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center space-y-4">
                  <div className="w-10 h-10 mx-auto border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <div>
                    <p className="text-white font-medium">Generating avatar video...</p>
                    <p className="text-sm text-gray-500 mt-1">This may take several minutes. You can wait here or come back later.</p>
                  </div>
                  {videoProgress > 0 && (
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>
                  )}
                  <p className="text-xs text-gray-600">{videoProgress}% complete</p>
                </div>
                <button
                  onClick={handleCancelGeneration}
                  className="w-full px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateVideo}
                disabled={!avatarImageUrl || !voiceoverUrl}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors text-lg"
              >
                Generate Avatar Video (10 tokens)
              </button>
            )}
          </div>
        )}

        {/* ═══ Step 6: Done ═══ */}
        {step === 'done' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 bg-green-600/20 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">Avatar Video Ready!</h2>
              <p className="text-gray-400 text-sm">Your avatar video has been generated successfully.</p>
            </div>

            {/* Video preview */}
            {(croppedVideoUrl || finalVideoUrl) && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <video
                  controls
                  className="w-full max-h-[500px] mx-auto"
                  src={croppedVideoUrl || finalVideoUrl!}
                  key={croppedVideoUrl || finalVideoUrl}
                >
                  Your browser does not support the video element.
                </video>
              </div>
            )}

            {/* ── Crop Tool ── */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-medium text-white">Crop & Resize</h3>

              {/* Aspect ratio selector */}
              <div className="flex gap-2">
                {([
                  { value: '9:16' as const, label: '9:16', desc: 'Reels / TikTok' },
                  { value: '16:9' as const, label: '16:9', desc: 'YouTube / Landscape' },
                  { value: '1:1' as const, label: '1:1', desc: 'Instagram / Square' },
                ] as const).map((ar) => (
                  <button
                    key={ar.value}
                    onClick={() => { setCropAspect(ar.value); setCroppedVideoUrl(null); }}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                      cropAspect === ar.value
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <div>{ar.label}</div>
                    <div className="text-[10px] opacity-60 mt-0.5">{ar.desc}</div>
                  </button>
                ))}
              </div>

              {/* Position sliders */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Horizontal Position
                    <span className="float-right text-gray-600">{cropPosX === 0 ? 'Left' : cropPosX === 1 ? 'Right' : cropPosX === 0.5 ? 'Center' : `${Math.round(cropPosX * 100)}%`}</span>
                  </label>
                  <input
                    type="range"
                    min={0} max={1} step={0.01}
                    value={cropPosX}
                    onChange={(e) => { setCropPosX(parseFloat(e.target.value)); setCroppedVideoUrl(null); }}
                    className="w-full accent-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Vertical Position
                    <span className="float-right text-gray-600">{cropPosY === 0 ? 'Top' : cropPosY === 1 ? 'Bottom' : cropPosY === 0.5 ? 'Center' : `${Math.round(cropPosY * 100)}%`}</span>
                  </label>
                  <input
                    type="range"
                    min={0} max={1} step={0.01}
                    value={cropPosY}
                    onChange={(e) => { setCropPosY(parseFloat(e.target.value)); setCroppedVideoUrl(null); }}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>

              {cropError && (
                <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300">{cropError}</div>
              )}

              <button
                onClick={handleCrop}
                disabled={cropping}
                className="w-full px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {cropping && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {cropping ? 'Cropping...' : croppedVideoUrl ? 'Re-crop Video' : 'Crop Video'}
              </button>

              {croppedVideoUrl && (
                <p className="text-xs text-green-400 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Cropped to {cropAspect}
                </p>
              )}
            </div>

            {/* ── Action Buttons ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Download */}
              <a
                href={croppedVideoUrl || finalVideoUrl || '#'}
                download
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors text-center flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Video
              </a>

              {/* Save to Library */}
              <button
                onClick={handleSaveToLibrary}
                disabled={savingToLibrary || savedToLibrary}
                className={`px-5 py-2.5 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  savedToLibrary
                    ? 'bg-green-600/20 border border-green-600 text-green-400'
                    : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
                }`}
              >
                {savingToLibrary ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                ) : savedToLibrary ? (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg> Saved to Library</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg> Save to Library</>
                )}
              </button>
            </div>

            {libraryError && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300">{libraryError}</div>
            )}

            {/* Google Drive export */}
            <div>
              <GoogleDriveButton
                files={(croppedVideoUrl || finalVideoUrl) ? [{
                  url: croppedVideoUrl || finalVideoUrl!,
                  name: `${avatarName || 'avatar-video'}${croppedVideoUrl ? `-${cropAspect.replace(':', 'x')}` : ''}.mp4`,
                }] : []}
                disabled={!finalVideoUrl}
              />
            </div>

            {/* ── Use in other tools ── */}
            <div className="border-t border-gray-800 pt-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-400">Use this video in</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link
                  href={`/create/longform-video?avatarVideoUrl=${encodeURIComponent(croppedVideoUrl || finalVideoUrl || '')}&avatarName=${encodeURIComponent(avatarName || 'Avatar Video')}`}
                  className="px-5 py-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/50 text-purple-300 font-medium rounded-lg transition-colors text-center text-sm"
                >
                  Create Longform Ad
                </Link>
                <Link
                  href={`/create/video-overlay?videoUrl=${encodeURIComponent(croppedVideoUrl || finalVideoUrl || '')}`}
                  className="px-5 py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 text-blue-300 font-medium rounded-lg transition-colors text-center text-sm"
                >
                  Add Text Overlay
                </Link>
              </div>
            </div>

            {/* ── Bottom actions ── */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setStep('create');
                  setAvatarImageUrl(null);
                  setAvatarName('');
                  setAvatarId(null);
                  setAvatarPrompt('');
                  setScript('');
                  setSelectedVoiceId('');
                  setVoiceoverUrl(null);
                  setVoiceoverDuration(null);
                  setFinalVideoUrl(null);
                  setCroppedVideoUrl(null);
                  setSaved(false);
                  setSavedToLibrary(false);
                  setVideoError(null);
                  setVideoProgress(0);
                }}
                className="flex-1 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-center"
              >
                Create Another
              </button>
              <Link
                href="/"
                className="flex-1 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-center"
              >
                Back to Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
