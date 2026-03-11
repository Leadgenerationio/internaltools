'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import type { LongformScript, LongformBrief, VoiceoverConfig, CaptionConfig, LongformResultItem, LongformScene } from '@/lib/longform-types';
import { DEFAULT_VOICE_CONFIG, DEFAULT_CAPTION_CONFIG } from '@/lib/longform-types';

type WizardStep = 'script' | 'scripts' | 'configure' | 'generate' | 'results' | 'editor';
type ScriptMode = 'paste' | 'generate';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'script', label: 'Script' },
  { id: 'scripts', label: 'Review' },
  { id: 'configure', label: 'Configure' },
  { id: 'generate', label: 'Generate' },
  { id: 'results', label: 'Results' },
];

interface Voice {
  id: string;
  name: string;
  category: string;
  previewUrl: string;
  accent: string;
  gender: string;
  age: string;
}

// Models available for b-roll generation (subset suitable for longform)
const BROLL_MODELS = [
  { id: 'bytedance/seedance-1.5-pro', label: 'Seedance 1.5', badge: 'Very Fast', duration: 8, tokenCost: 3 },
  { id: 'kling-2.6/text-to-video', label: 'Kling 2.6', badge: 'Fast', duration: 5, tokenCost: 7 },
  { id: 'veo3_fast', label: 'Veo 3.1 Fast', badge: 'Fast + Audio', duration: 8, tokenCost: 5 },
  { id: 'sora-2-text-to-video', label: 'Sora 2', badge: 'Budget', duration: 10, tokenCost: 3 },
  { id: 'sora-2-pro-text-to-video', label: 'Sora 2 Pro', badge: 'HD Quality', duration: 10, tokenCost: 5 },
  { id: 'veo3', label: 'Veo 3.1 Quality', badge: 'Premium', duration: 8, tokenCost: 25 },
];

export default function LongformVideoPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('script');
  const [scriptMode, setScriptMode] = useState<ScriptMode>('paste');

  // Paste mode
  const [pastedScript, setPastedScript] = useState('');
  const [hookMode, setHookMode] = useState<'none' | 'write' | 'ai'>('none');
  const [customHook, setCustomHook] = useState('');
  const [aiHooks, setAiHooks] = useState<string[]>([]);
  const [selectedHookIndex, setSelectedHookIndex] = useState<number | null>(null);
  const [generatingHooks, setGeneratingHooks] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [pastedCta, setPastedCta] = useState('');

  // AI Generate mode
  const [brief, setBrief] = useState<LongformBrief>({
    productService: '',
    targetAudience: '',
    offer: '',
    keyBenefits: '',
    cta: '',
    tone: 'Friendly, trustworthy, slightly urgent',
    language: 'English',
    numVariants: 3,
  });

  // Scripts
  const [scripts, setScripts] = useState<LongformScript[]>([]);
  const [selectedScripts, setSelectedScripts] = useState<Set<number>>(new Set());
  const [generatingScripts, setGeneratingScripts] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  // Configure
  const [voiceConfig, setVoiceConfig] = useState<VoiceoverConfig>({ ...DEFAULT_VOICE_CONFIG });
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>({ ...DEFAULT_CAPTION_CONFIG });
  const [skipBroll, setSkipBroll] = useState(false);
  const [videoModel, setVideoModel] = useState('veo3_fast');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const [captionTemplates, setCaptionTemplates] = useState<string[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Generate
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Results
  const [results, setResults] = useState<LongformResultItem[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [tokensUsed, setTokensUsed] = useState(0);

  // Editor
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingScenes, setEditingScenes] = useState<LongformScene[]>([]);
  const [editingVoiceoverUrl, setEditingVoiceoverUrl] = useState('');
  const [editingScriptText, setEditingScriptText] = useState('');
  const [regenIndex, setRegenIndex] = useState<number | null>(null);
  const [regenPrompt, setRegenPrompt] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [reassembling, setReassembling] = useState(false);
  const [reassembleProgress, setReassembleProgress] = useState(0);

  // ── Paste mode handlers ──────────────────────────────────────────────────

  const handleGenerateHooks = useCallback(async () => {
    if (!pastedScript.trim() || generatingHooks) return;
    setGeneratingHooks(true);
    setHookError(null);
    setAiHooks([]);
    setSelectedHookIndex(null);

    try {
      const res = await fetch('/api/longform/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptBody: pastedScript.trim(), count: 5 }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to generate hooks' }));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const data = await res.json();
      setAiHooks(data.hooks || []);
      if (data.hooks?.length > 0) setSelectedHookIndex(0);
    } catch (err: any) {
      setHookError(err.message);
    } finally {
      setGeneratingHooks(false);
    }
  }, [pastedScript, generatingHooks]);

  const handlePastedContinue = useCallback(() => {
    let hook = '';
    if (hookMode === 'write') {
      hook = customHook.trim();
    } else if (hookMode === 'ai' && selectedHookIndex !== null && aiHooks[selectedHookIndex]) {
      hook = aiHooks[selectedHookIndex];
    }

    const script: LongformScript = {
      variant: 'custom',
      hook,
      body: pastedScript.trim(),
      cta: pastedCta.trim(),
      suggestedBroll: [],
    };

    setScripts([script]);
    setSelectedScripts(new Set([0]));
    setStep('configure');
  }, [pastedScript, hookMode, customHook, aiHooks, selectedHookIndex, pastedCta]);

  // ── AI Generate mode handlers ─────────────────────────────────────────────

  const handleGenerateScripts = useCallback(async () => {
    if (!brief.productService.trim()) return;
    setGeneratingScripts(true);
    setScriptError(null);

    try {
      const res = await fetch('/api/longform/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brief),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Script generation failed' }));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const data = await res.json();
      setScripts(data.scripts);
      setSelectedScripts(new Set(data.scripts.map((_: any, i: number) => i)));
      setStep('scripts');
    } catch (err: any) {
      setScriptError(err.message);
    } finally {
      setGeneratingScripts(false);
    }
  }, [brief]);

  // ── Configure Step — load voices ──────────────────────────────────────────

  const loadVoices = useCallback(async () => {
    if (voices.length > 0 || loadingVoices) return;
    setLoadingVoices(true);
    setVoiceError(null);
    try {
      const res = await fetch('/api/longform/voices');
      if (res.ok) {
        const data = await res.json();
        setVoices(data.voices || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setVoiceError(data.error || `Failed to load voices (${res.status})`);
      }
    } catch {
      setVoiceError('Network error — could not reach voice API');
    } finally {
      setLoadingVoices(false);
    }
  }, [voices.length, loadingVoices]);

  const loadCaptionTemplates = useCallback(async () => {
    if (captionTemplates.length > 0 || loadingTemplates) return;
    setLoadingTemplates(true);
    try {
      const res = await fetch('/api/longform/caption-templates');
      if (res.ok) {
        const data = await res.json();
        setCaptionTemplates(data.templates || []);
      }
    } catch { /* ignore */ } finally {
      setLoadingTemplates(false);
    }
  }, [captionTemplates.length, loadingTemplates]);

  useEffect(() => {
    if (step === 'configure') {
      loadVoices();
      loadCaptionTemplates();
    }
  }, [step, loadVoices, loadCaptionTemplates]);

  const handlePlayPreview = useCallback((voice: Voice) => {
    if (!voice.previewUrl) return;

    if (playingVoiceId === voice.id && voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current = null;
      setPlayingVoiceId(null);
      return;
    }

    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current = null;
    }

    const audio = new Audio(voice.previewUrl);
    voiceAudioRef.current = audio;
    setPlayingVoiceId(voice.id);

    audio.play().catch(() => setPlayingVoiceId(null));
    audio.onended = () => { setPlayingVoiceId(null); voiceAudioRef.current = null; };
    audio.onerror = () => { setPlayingVoiceId(null); voiceAudioRef.current = null; };
  }, [playingVoiceId]);

  useEffect(() => {
    return () => {
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause();
        voiceAudioRef.current = null;
      }
    };
  }, []);

  // ── Generate Step ─────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    const selected = scripts.filter((_, i) => selectedScripts.has(i));
    if (selected.length === 0) return;

    setGenerating(true);
    setGenerateError(null);
    setProgress(0);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch('/api/longform/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scripts: selected,
          voiceConfig,
          captionConfig,
          skipBroll,
          videoModel: skipBroll ? undefined : videoModel,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to start generation' }));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const { jobId: jid } = await res.json();
      setJobId(jid);
      setStep('generate');

      const { pollJob } = await import('@/lib/poll-job');
      const result = await pollJob(jid, 'longform', {
        onProgress: (p) => setProgress(p),
        signal: abort.signal,
      });

      if (result.state === 'completed' && result.result) {
        const r = result.result as any;
        setResults(r.videos || []);
        setFailedCount(r.failed || 0);
        setTokensUsed(r.tokensUsed || 0);
        setStep('results');
      } else if (result.state === 'failed') {
        throw new Error(result.error || 'Generation failed');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setGenerateError(err.message);
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [scripts, selectedScripts, voiceConfig, captionConfig, skipBroll, videoModel]);

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  // ── Editor handlers ───────────────────────────────────────────────────────

  const handleEditScenes = useCallback((resultIndex: number) => {
    const r = results[resultIndex];
    if (!r.scenes || !r.voiceoverUrl) return;
    setEditingIndex(resultIndex);
    setEditingScenes([...r.scenes]);
    setEditingVoiceoverUrl(r.voiceoverUrl);
    setEditingScriptText(r.scriptText || '');
    setRegenIndex(null);
    setStep('editor');
  }, [results]);

  const handleRegenScene = useCallback(async (sceneIdx: number) => {
    if (regenLoading) return;
    const scene = editingScenes[sceneIdx];
    if (!scene) return;

    setRegenLoading(true);
    try {
      const res = await fetch('/api/longform/regenerate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: regenPrompt || scene.prompt, videoModel }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to regenerate' }));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const { jobId: jid } = await res.json();

      const { pollJob } = await import('@/lib/poll-job');
      const result = await pollJob(jid, 'longform', { onProgress: () => {} });

      if (result.state === 'completed' && result.result) {
        const r = result.result as any;
        const updated = [...editingScenes];
        updated[sceneIdx] = {
          ...updated[sceneIdx],
          clipUrl: r.clipUrl,
          clipFilename: r.clipFilename,
          durationSeconds: r.durationSeconds,
          prompt: r.prompt || regenPrompt || scene.prompt,
        };
        setEditingScenes(updated);
        setRegenIndex(null);
        setRegenPrompt('');
      } else {
        throw new Error(result.error || 'Scene regeneration failed');
      }
    } catch (err: any) {
      setGenerateError(err.message);
    } finally {
      setRegenLoading(false);
    }
  }, [editingScenes, regenPrompt, videoModel, regenLoading]);

  const handleReassemble = useCallback(async () => {
    if (reassembling || editingIndex === null) return;
    setReassembling(true);
    setReassembleProgress(0);

    try {
      const res = await fetch('/api/longform/reassemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: editingScenes.map((s, i) => ({ clipUrl: s.clipUrl, order: i, prompt: s.prompt })),
          voiceoverUrl: editingVoiceoverUrl,
          captionConfig,
          scriptText: editingScriptText,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to reassemble' }));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const { jobId: jid } = await res.json();

      const { pollJob } = await import('@/lib/poll-job');
      const result = await pollJob(jid, 'longform', {
        onProgress: (p) => setReassembleProgress(p),
      });

      if (result.state === 'completed' && result.result) {
        const r = result.result as any;
        // Update the result with the new video
        const updated = [...results];
        updated[editingIndex] = {
          ...updated[editingIndex],
          videoUrl: r.videoUrl,
          durationSeconds: r.durationSeconds,
          captioned: r.captioned,
          scenes: editingScenes,
        };
        setResults(updated);
        setStep('results');
        setEditingIndex(null);
      } else {
        throw new Error(result.error || 'Reassembly failed');
      }
    } catch (err: any) {
      setGenerateError(err.message);
    } finally {
      setReassembling(false);
    }
  }, [editingScenes, editingVoiceoverUrl, editingScriptText, captionConfig, editingIndex, results, reassembling]);

  const handleReplaceScene = useCallback(async (sceneIdx: number, file: File) => {
    // Upload the file via /api/upload
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      const updated = [...editingScenes];
      updated[sceneIdx] = {
        ...updated[sceneIdx],
        clipUrl: data.path || data.url,
        prompt: `Uploaded: ${file.name}`,
        durationSeconds: data.duration || updated[sceneIdx].durationSeconds,
      };
      setEditingScenes(updated);
    } catch (err: any) {
      setGenerateError(`Upload failed: ${err.message}`);
    }
  }, [editingScenes]);

  const handleDeleteScene = useCallback((sceneIdx: number) => {
    if (editingScenes.length <= 1) return; // must keep at least 1
    const updated = editingScenes.filter((_, i) => i !== sceneIdx).map((s, i) => ({ ...s, order: i }));
    setEditingScenes(updated);
  }, [editingScenes]);

  // ── Token cost calculation ────────────────────────────────────────────────

  const selectedCount = selectedScripts.size;
  const selectedModel = BROLL_MODELS.find((m) => m.id === videoModel);
  const LONGFORM_BASE = 5;
  const perVariantCost = skipBroll ? 10 : (LONGFORM_BASE + 3 * (selectedModel?.tokenCost || 5));
  const totalTokenCost = selectedCount * perVariantCost;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="text-lg sm:text-xl font-bold text-white shrink-0 hover:text-blue-400 transition-colors">Ad Maker</Link>

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 justify-center min-w-0">
            {[...STEPS, ...(step === 'editor' ? [{ id: 'editor' as WizardStep, label: 'Editor' }] : [])].map((s, i) => {
              const currentIndex = [...STEPS, ...(step === 'editor' ? [{ id: 'editor' as WizardStep, label: 'Editor' }] : [])].findIndex((st) => st.id === step);
              const isPast = i < currentIndex;
              const isCurrent = s.id === step;
              return (
                <div key={s.id} className="flex items-center shrink-0">
                  {i > 0 && <div className={`w-4 sm:w-8 h-px ${isPast ? 'bg-blue-500' : 'bg-gray-700'}`} />}
                  <div className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                    isCurrent ? 'bg-blue-500 text-white' : isPast ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-500'
                  }`}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>

          <UserMenu />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* ── Script Step ────────────────────────────────────────────── */}
        {step === 'script' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Your Script</h2>
              <p className="text-gray-400 text-sm">Paste your own script or generate one with AI.</p>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
              <button
                onClick={() => setScriptMode('paste')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  scriptMode === 'paste' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Paste Script
              </button>
              <button
                onClick={() => setScriptMode('generate')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  scriptMode === 'generate' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                AI Generate
              </button>
            </div>

            {/* ── Paste Mode ─────────────────────────────────────────── */}
            {scriptMode === 'paste' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Script *</label>
                  <textarea
                    value={pastedScript}
                    onChange={(e) => setPastedScript(e.target.value)}
                    placeholder="Paste your full ad script here..."
                    rows={8}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm leading-relaxed"
                  />
                  <p className="text-xs text-gray-500 mt-1">{pastedScript.trim().split(/\s+/).filter(Boolean).length} words</p>
                </div>

                {/* Hook section */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                  <div>
                    <h3 className="text-white font-semibold text-sm">Hook (optional)</h3>
                    <p className="text-xs text-gray-500">A 2-5 second attention-grabbing opener before the main script.</p>
                  </div>

                  <div className="flex gap-2">
                    {(['none', 'write', 'ai'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setHookMode(mode)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          hookMode === mode
                            ? 'bg-blue-500/20 border border-blue-500 text-blue-400'
                            : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        {mode === 'none' ? 'No Hook' : mode === 'write' ? 'Write My Own' : 'AI Generate'}
                      </button>
                    ))}
                  </div>

                  {hookMode === 'write' && (
                    <textarea
                      value={customHook}
                      onChange={(e) => setCustomHook(e.target.value)}
                      placeholder="e.g. Stop scrolling if you own a home in the UK..."
                      rows={2}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  )}

                  {hookMode === 'ai' && (
                    <div className="space-y-3">
                      {aiHooks.length === 0 && !generatingHooks && (
                        <button
                          onClick={handleGenerateHooks}
                          disabled={!pastedScript.trim() || generatingHooks}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Generate Hook Ideas
                        </button>
                      )}

                      {generatingHooks && (
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          Generating hooks...
                        </div>
                      )}

                      {hookError && <div className="text-red-400 text-sm">{hookError}</div>}

                      {aiHooks.length > 0 && (
                        <div className="space-y-2">
                          {aiHooks.map((hook, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedHookIndex(i)}
                              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                                selectedHookIndex === i
                                  ? 'bg-blue-500/20 border border-blue-500 text-white'
                                  : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                              }`}
                            >
                              {hook}
                            </button>
                          ))}
                          <button
                            onClick={handleGenerateHooks}
                            disabled={generatingHooks}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            Regenerate hooks
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Optional CTA */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">CTA (optional)</label>
                  <input
                    type="text"
                    value={pastedCta}
                    onChange={(e) => setPastedCta(e.target.value)}
                    placeholder="e.g. Click the link below to get started"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                <button
                  onClick={handlePastedContinue}
                  disabled={!pastedScript.trim()}
                  className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  Continue to Configure
                </button>
              </div>
            )}

            {/* ── AI Generate Mode ───────────────────────────────────── */}
            {scriptMode === 'generate' && (
              <div className="space-y-4">
                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Product / Service *</label>
                    <input type="text" value={brief.productService}
                      onChange={(e) => setBrief({ ...brief, productService: e.target.value })}
                      placeholder="e.g. Free solar panel installation for UK homeowners"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Target Audience</label>
                    <input type="text" value={brief.targetAudience}
                      onChange={(e) => setBrief({ ...brief, targetAudience: e.target.value })}
                      placeholder="e.g. Homeowners in the UK, aged 30-65"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Offer</label>
                    <input type="text" value={brief.offer}
                      onChange={(e) => setBrief({ ...brief, offer: e.target.value })}
                      placeholder="e.g. Government-backed scheme covers full cost"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Key Benefits</label>
                    <textarea value={brief.keyBenefits}
                      onChange={(e) => setBrief({ ...brief, keyBenefits: e.target.value })}
                      placeholder="e.g. Free installation, reduce bills by 70%, government-funded"
                      rows={3}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">CTA</label>
                      <input type="text" value={brief.cta}
                        onChange={(e) => setBrief({ ...brief, cta: e.target.value })}
                        placeholder="e.g. Enter your postcode to check"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Tone</label>
                      <input type="text" value={brief.tone}
                        onChange={(e) => setBrief({ ...brief, tone: e.target.value })}
                        placeholder="e.g. Friendly, trustworthy"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Language</label>
                      <select value={brief.language} onChange={(e) => setBrief({ ...brief, language: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        {['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Polish', 'Arabic', 'Hindi'].map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Script Variants</label>
                      <select value={brief.numVariants} onChange={(e) => setBrief({ ...brief, numVariants: Number(e.target.value) })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>{n} variant{n !== 1 ? 's' : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {scriptError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">{scriptError}</div>
                )}

                <button
                  onClick={handleGenerateScripts}
                  disabled={!brief.productService.trim() || generatingScripts}
                  className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {generatingScripts ? 'Generating Scripts...' : 'Generate Scripts'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Scripts Step ────────────────────────────────────────────── */}
        {step === 'scripts' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Review Scripts</h2>
              <p className="text-gray-400 text-sm">Select which variants to produce. Edit text directly if needed.</p>
            </div>

            <div className="space-y-4">
              {scripts.map((script, i) => (
                <div key={i} className={`border rounded-xl p-5 transition-colors ${
                  selectedScripts.has(i) ? 'border-blue-500 bg-gray-900' : 'border-gray-800 bg-gray-900/50 opacity-60'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selectedScripts.has(i)}
                        onChange={() => {
                          const next = new Set(selectedScripts);
                          next.has(i) ? next.delete(i) : next.add(i);
                          setSelectedScripts(next);
                        }}
                        className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500" />
                      <span className="text-sm font-semibold text-blue-400 uppercase tracking-wider">{script.variant}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {script.hook !== undefined && (
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">Hook</label>
                        <textarea value={script.hook}
                          onChange={(e) => { const u = [...scripts]; u[i] = { ...u[i], hook: e.target.value }; setScripts(u); }}
                          rows={2} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:ring-1 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">Body</label>
                      <textarea value={script.body}
                        onChange={(e) => { const u = [...scripts]; u[i] = { ...u[i], body: e.target.value }; setScripts(u); }}
                        rows={4} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:ring-1 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">CTA</label>
                      <textarea value={script.cta}
                        onChange={(e) => { const u = [...scripts]; u[i] = { ...u[i], cta: e.target.value }; setScripts(u); }}
                        rows={2} className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:ring-1 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    {script.suggestedBroll.length > 0 && (
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">Suggested B-Roll</label>
                        <p className="text-xs text-gray-400 mt-1">{script.suggestedBroll.join(' / ')}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('script')} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">
                Back
              </button>
              <button onClick={() => setStep('configure')} disabled={selectedScripts.size === 0}
                className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors">
                Configure ({selectedScripts.size} selected)
              </button>
            </div>
          </div>
        )}

        {/* ── Configure Step ──────────────────────────────────────────── */}
        {step === 'configure' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Configure</h2>
              <p className="text-gray-400 text-sm">Choose your voice, video model, caption style, and options.</p>
            </div>

            {/* Voice Selection */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h3 className="text-white font-semibold">Voice</h3>

              {loadingVoices ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Loading voices...
                </div>
              ) : voiceError ? (
                <div className="space-y-2">
                  <p className="text-red-400 text-sm">{voiceError}</p>
                  <button onClick={() => { setVoices([]); setVoiceError(null); loadVoices(); }}
                    className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:border-gray-500 transition-colors">
                    Retry
                  </button>
                </div>
              ) : voices.length > 0 ? (
                <div className="space-y-3">
                  <input type="text" value={voiceSearch} onChange={(e) => setVoiceSearch(e.target.value)}
                    placeholder="Search voices..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:border-transparent" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                    {voices
                      .filter((v) => {
                        if (!voiceSearch.trim()) return true;
                        const q = voiceSearch.toLowerCase();
                        return v.name.toLowerCase().includes(q) || v.gender?.toLowerCase().includes(q) || v.accent?.toLowerCase().includes(q) || v.age?.toLowerCase().includes(q);
                      })
                      .map((v) => (
                      <div key={v.id} onClick={() => setVoiceConfig({ ...voiceConfig, voiceId: v.id })}
                        className={`flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                          voiceConfig.voiceId === v.id
                            ? 'bg-blue-500/20 border border-blue-500 text-white'
                            : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                        }`}>
                        {v.previewUrl && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); handlePlayPreview(v); }}
                            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                              playingVoiceId === v.id ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                            }`} title={playingVoiceId === v.id ? 'Stop' : 'Preview'}>
                            {playingVoiceId === v.id ? (
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            )}
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{v.name}</div>
                          <div className="text-xs text-gray-500">{[v.gender, v.accent, v.age].filter(Boolean).join(' / ')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">{voices.length} voices available</p>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No voices available. ElevenLabs may not be configured.</p>
              )}

              {/* Voice settings */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-xs text-gray-400">Stability: {voiceConfig.stability.toFixed(1)}</label>
                  <input type="range" min="0" max="1" step="0.1" value={voiceConfig.stability}
                    onChange={(e) => setVoiceConfig({ ...voiceConfig, stability: Number(e.target.value) })}
                    className="w-full accent-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Similarity: {voiceConfig.similarityBoost.toFixed(1)}</label>
                  <input type="range" min="0" max="1" step="0.1" value={voiceConfig.similarityBoost}
                    onChange={(e) => setVoiceConfig({ ...voiceConfig, similarityBoost: Number(e.target.value) })}
                    className="w-full accent-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Speed: {voiceConfig.speed.toFixed(1)}x</label>
                  <input type="range" min="0.5" max="2" step="0.1" value={voiceConfig.speed}
                    onChange={(e) => setVoiceConfig({ ...voiceConfig, speed: Number(e.target.value) })}
                    className="w-full accent-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Style: {voiceConfig.style.toFixed(1)}</label>
                  <input type="range" min="0" max="1" step="0.1" value={voiceConfig.style}
                    onChange={(e) => setVoiceConfig({ ...voiceConfig, style: Number(e.target.value) })}
                    className="w-full accent-blue-500" />
                </div>
              </div>
            </div>

            {/* B-Roll Options + Model Selection */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h3 className="text-white font-semibold">B-Roll Video</h3>

              <label className="flex items-center gap-3">
                <input type="checkbox" checked={!skipBroll} onChange={(e) => setSkipBroll(!e.target.checked)}
                  className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500" />
                <div>
                  <div className="text-white text-sm font-medium">Generate AI B-Roll</div>
                  <div className="text-xs text-gray-400">Create AI video clips to play over the voiceover</div>
                </div>
              </label>

              {!skipBroll && (
                <div className="pl-8 space-y-3">
                  <label className="block text-xs text-gray-400 font-medium">Video Model</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {BROLL_MODELS.map((m) => (
                      <button key={m.id} onClick={() => setVideoModel(m.id)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                          videoModel === m.id
                            ? 'bg-blue-500/20 border border-blue-500 text-white'
                            : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                        }`}>
                        <div>
                          <div className="font-medium">{m.label}</div>
                          <div className="text-xs text-gray-500">{m.duration}s clips · {m.tokenCost} tokens/clip</div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          videoModel === m.id ? 'bg-blue-500/30 text-blue-300' : 'bg-gray-700 text-gray-400'
                        }`}>{m.badge}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Captions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h3 className="text-white font-semibold">Captions</h3>

              <label className="flex items-center gap-3">
                <input type="checkbox" checked={captionConfig.enabled}
                  onChange={(e) => setCaptionConfig({ ...captionConfig, enabled: e.target.checked })}
                  className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500" />
                <div>
                  <div className="text-white text-sm font-medium">Add Captions</div>
                  <div className="text-xs text-gray-400">Word-by-word animated captions burned into the video</div>
                </div>
              </label>

              {captionConfig.enabled && (
                <div className="pl-8 space-y-3">
                  <label className="block text-xs text-gray-400 font-medium">Caption Style</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setCaptionConfig({ ...captionConfig, template: 'built-in' })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        captionConfig.template === 'built-in'
                          ? 'bg-blue-500/20 border border-blue-500 text-blue-400'
                          : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      }`}
                    >
                      Built-in (Free)
                    </button>
                    {(captionTemplates.length > 0 ? captionTemplates : ['Hormozi 2', 'Beast', 'Sara', 'Ali', 'Kaizen', 'Matt', 'Jess', 'Jack', 'Nick', 'Laura', 'Hormozi 1', 'Dan', 'Devin', 'Maya', 'Karl', 'Iman', 'Noah']).map((t) => (
                      <button key={t} onClick={() => setCaptionConfig({ ...captionConfig, template: t })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          captionConfig.template === t
                            ? 'bg-blue-500/20 border border-blue-500 text-blue-400'
                            : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {captionConfig.template !== 'built-in' && (
                    <p className="text-xs text-amber-400">Submagic styles require cloud storage (S3). Falls back to built-in if unavailable.</p>
                  )}
                </div>
              )}
            </div>

            {/* Cost summary */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-semibold">Token Cost</div>
                  <div className="text-sm text-gray-400">
                    {selectedCount} variant{selectedCount !== 1 ? 's' : ''} x {perVariantCost} tokens
                    {!skipBroll ? ` (base + 3x ${selectedModel?.label || 'Veo 3.1 Fast'})` : ' (voiceover only)'}
                  </div>
                </div>
                <div className="text-2xl font-bold text-blue-400">{totalTokenCost} tokens</div>
              </div>
            </div>

            <div className="space-y-3">
              {generateError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                  <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  <span>{generateError}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(scriptMode === 'paste' ? 'script' : 'scripts')}
                  className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">
                  Back
                </button>
                <button onClick={handleGenerate} disabled={generating || selectedCount === 0}
                  className="px-8 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors">
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Starting...
                    </span>
                  ) : (
                    `Generate ${selectedCount} Video${selectedCount !== 1 ? 's' : ''} (${totalTokenCost} tokens)`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Generate Step (Progress) ────────────────────────────────── */}
        {step === 'generate' && (
          <div className="space-y-6 text-center py-10">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Generating Videos</h2>
              <p className="text-gray-400 text-sm">This takes 5-15 minutes per variant. You can leave this page — the job runs in the background.</p>
            </div>
            <div className="max-w-md mx-auto">
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-3">
                <div className="bg-blue-500 h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            {generateError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg max-w-md mx-auto">{generateError}</div>
            )}
            {generating && (
              <button onClick={handleCancel}
                className="px-6 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/40 font-medium rounded-lg transition-colors">
                Cancel
              </button>
            )}
          </div>
        )}

        {/* ── Results Step ────────────────────────────────────────────── */}
        {step === 'results' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                {results.length > 0 ? 'Videos Ready' : 'Generation Complete'}
              </h2>
              <p className="text-gray-400 text-sm">
                {results.length} video{results.length !== 1 ? 's' : ''} produced
                {failedCount > 0 ? ` (${failedCount} failed)` : ''}
                {' / '}{tokensUsed} tokens used
              </p>
            </div>

            <div className="space-y-4">
              {results.map((r, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-blue-400 uppercase tracking-wider">{r.variant}</span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {r.captioned && <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded">Captioned</span>}
                      <span>{Math.round(r.durationSeconds)}s</span>
                    </div>
                  </div>
                  <video src={r.videoUrl} controls className="w-full max-w-sm rounded-lg bg-black mx-auto" preload="metadata" />
                  <div className="mt-3 flex gap-2 justify-center flex-wrap">
                    <a href={r.videoUrl} download={`longform_${r.variant}.mp4`}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
                      Download
                    </a>
                    {r.scenes && r.scenes.length > 0 && r.voiceoverUrl && (
                      <button onClick={() => handleEditScenes(i)}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">
                        Edit Scenes
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => {
                setStep('script');
                setScripts([]); setSelectedScripts(new Set()); setResults([]);
                setJobId(null); setProgress(0); setPastedScript('');
                setHookMode('none'); setCustomHook(''); setAiHooks([]);
                setSelectedHookIndex(null); setPastedCta('');
              }} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">
                Start New
              </button>
              <Link href="/" className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">
                Home
              </Link>
            </div>
          </div>
        )}

        {/* ── Editor Step ─────────────────────────────────────────────── */}
        {step === 'editor' && editingIndex !== null && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Edit Scenes</h2>
              <p className="text-gray-400 text-sm">
                {results[editingIndex]?.variant} — {editingScenes.length} scene{editingScenes.length !== 1 ? 's' : ''}. Regenerate, replace, or remove individual clips.
              </p>
            </div>

            {generateError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">{generateError}</div>
            )}

            <div className="space-y-4">
              {editingScenes.map((scene, si) => (
                <div key={si} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-blue-400">Scene {si + 1}</span>
                    <span className="text-xs text-gray-500">{scene.durationSeconds.toFixed(1)}s</span>
                  </div>

                  <div className="flex gap-4 flex-col sm:flex-row">
                    {/* Video preview */}
                    <div className="sm:w-48 shrink-0">
                      <video src={scene.clipUrl} controls className="w-full rounded-lg bg-black aspect-[9/16] object-cover" preload="metadata" />
                    </div>

                    {/* Scene details + actions */}
                    <div className="flex-1 space-y-3">
                      <p className="text-xs text-gray-400 line-clamp-3">{scene.prompt}</p>

                      {regenIndex === si ? (
                        <div className="space-y-2">
                          <textarea
                            value={regenPrompt}
                            onChange={(e) => setRegenPrompt(e.target.value)}
                            placeholder="Enter new scene prompt..."
                            rows={3}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handleRegenScene(si)} disabled={regenLoading}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                              {regenLoading ? (
                                <span className="flex items-center gap-1">
                                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  Generating...
                                </span>
                              ) : `Regenerate (${selectedModel?.tokenCost || 5} tokens)`}
                            </button>
                            <button onClick={() => { setRegenIndex(null); setRegenPrompt(''); }}
                              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => { setRegenIndex(si); setRegenPrompt(scene.prompt); }}
                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors">
                            Regenerate
                          </button>
                          <label className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors cursor-pointer">
                            Replace
                            <input type="file" accept="video/*" className="hidden"
                              onChange={(e) => { if (e.target.files?.[0]) handleReplaceScene(si, e.target.files[0]); }} />
                          </label>
                          {editingScenes.length > 1 && (
                            <button onClick={() => handleDeleteScene(si)}
                              className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-400 text-xs font-medium rounded-lg transition-colors">
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reassemble */}
            <div className="flex gap-3">
              <button onClick={() => { setStep('results'); setEditingIndex(null); setGenerateError(null); }}
                className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">
                Back to Results
              </button>
              <button onClick={handleReassemble} disabled={reassembling}
                className="px-8 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors">
                {reassembling ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Reassembling ({reassembleProgress}%)...
                  </span>
                ) : 'Re-assemble Video'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
