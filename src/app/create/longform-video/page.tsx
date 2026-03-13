'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import type {
  LongformScriptV2, LongformWizardStep, VoiceoverConfig, CaptionConfig, LongformResultItem,
} from '@/lib/longform-types';
import { DEFAULT_VOICE_CONFIG, DEFAULT_CAPTION_CONFIG } from '@/lib/longform-types';
import type { MusicTrack } from '@/lib/types';

import LongformWizardShell from '@/components/longform/LongformWizardShell';
import PromptStep from '@/components/longform/PromptStep';
import VoiceEditStep from '@/components/longform/VoiceEditStep';
import BuildScenesStep from '@/components/longform/BuildScenesStep';
import MusicStep from '@/components/longform/MusicStep';
import CaptionsStep from '@/components/longform/CaptionsStep';
import FinalizeStep from '@/components/longform/FinalizeStep';

const STORAGE_KEY = 'longform_wizard_v2';
const JOB_KEY = 'longform_job_id';

const VALID_STEPS: LongformWizardStep[] = ['prompt', 'voice-edit', 'build-scenes', 'music', 'captions', 'finalize'];

export default function LongformVideoPage() {
  const { status } = useSession();
  const router = useRouter();

  // ─── Wizard state ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<LongformWizardStep>('prompt');
  const [prompt, setPrompt] = useState('');
  const [numScripts, setNumScripts] = useState(3);
  const [language, setLanguage] = useState('English');
  const [scripts, setScripts] = useState<LongformScriptV2[]>([]);
  const [voiceConfig] = useState<VoiceoverConfig>(DEFAULT_VOICE_CONFIG);
  const [music, setMusic] = useState<MusicTrack | null>(null);
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>(DEFAULT_CAPTION_CONFIG);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [results, setResults] = useState<LongformResultItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // ─── Completed steps tracking ───────────────────────────────────────────────
  const [completedSteps, setCompletedSteps] = useState<Set<LongformWizardStep>>(new Set());

  const markComplete = useCallback((s: LongformWizardStep) => {
    setCompletedSteps((prev) => new Set([...prev, s]));
  }, []);

  // ─── Persistence ────────────────────────────────────────────────────────────
  const initialized = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Restore state from localStorage
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.prompt) setPrompt(state.prompt);
        if (state.numScripts) setNumScripts(state.numScripts);
        if (state.language) setLanguage(state.language);
        // Only restore V2 scripts (have fullText + scenes), skip legacy format
        if (state.scripts?.length && state.scripts[0]?.fullText) setScripts(state.scripts);
        if (state.music) setMusic(state.music);
        if (state.captionConfig) setCaptionConfig(state.captionConfig);
        if (state.aspectRatio) setAspectRatio(state.aspectRatio);
        if (state.step && VALID_STEPS.includes(state.step)) setStep(state.step);
        if (state.completedSteps) {
          const valid = (state.completedSteps as string[]).filter((s) => VALID_STEPS.includes(s as LongformWizardStep));
          setCompletedSteps(new Set(valid as LongformWizardStep[]));
        }
      }
    } catch { /* ignore */ }

    // Clean up old wizard state key
    localStorage.removeItem('longform_wizard_state');

    // Check for pending job
    const pendingJobId = localStorage.getItem(JOB_KEY);
    if (pendingJobId) {
      resumeJob(pendingJobId);
    }
  }, []);

  // Debounced save to localStorage
  useEffect(() => {
    if (!initialized.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          step, prompt, numScripts, language, scripts, music, captionConfig, aspectRatio,
          completedSteps: [...completedSteps],
        }));
      } catch { /* ignore */ }
    }, 2000);
  }, [step, prompt, numScripts, language, scripts, music, captionConfig, aspectRatio, completedSteps]);

  // ─── Job resume ─────────────────────────────────────────────────────────────
  const resumeJob = async (jobId: string) => {
    setStep('finalize');
    setIsGenerating(true);
    try {
      const { pollJob } = await import('@/lib/poll-job');
      const result = await pollJob(jobId, 'longform');
      localStorage.removeItem(JOB_KEY);
      if (result.state === 'completed' && result.result) {
        const r = result.result as any;
        setResults(r.videos || []);
      } else if (result.state === 'failed') {
        // Stay on finalize step so user can retry
      }
    } catch {
      localStorage.removeItem(JOB_KEY);
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Script generation ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/longform/generate-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, numScripts, language }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      setScripts(data.scripts || []);
      markComplete('prompt');
      setStep('voice-edit');
    } catch (err: any) {
      throw err; // PromptStep handles the error display
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Step navigation ───────────────────────────────────────────────────────
  const goToStep = (target: LongformWizardStep) => {
    setStep(target);
  };

  const handleStartNew = () => {
    setStep('prompt');
    setPrompt('');
    setNumScripts(3);
    setLanguage('English');
    setScripts([]);
    setMusic(null);
    setCaptionConfig(DEFAULT_CAPTION_CONFIG);
    setAspectRatio('9:16');
    setResults([]);
    setCompletedSteps(new Set());
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(JOB_KEY);
  };

  // ─── Auth guard ─────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">Loading...</div>;
  }
  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  return (
    <>
      {/* Header */}
      <div className="bg-gray-950 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white hover:text-blue-400 transition-colors">
            Ad Maker
          </Link>
          <UserMenu />
        </div>
      </div>

      <LongformWizardShell
        currentStep={step}
        completedSteps={completedSteps}
        onStepClick={goToStep}
      >
        {step === 'prompt' && (
          <PromptStep
            prompt={prompt}
            numScripts={numScripts}
            language={language}
            onPromptChange={setPrompt}
            onNumScriptsChange={setNumScripts}
            onLanguageChange={setLanguage}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />
        )}

        {step === 'voice-edit' && (
          <VoiceEditStep
            scripts={scripts}
            defaultVoiceConfig={voiceConfig}
            onScriptsChange={setScripts}
            onNext={() => {
              markComplete('voice-edit');
              setStep('build-scenes');
            }}
          />
        )}

        {step === 'build-scenes' && (
          <BuildScenesStep
            scripts={scripts}
            onScriptsChange={setScripts}
            onNext={() => {
              markComplete('build-scenes');
              setStep('music');
            }}
          />
        )}

        {step === 'music' && (
          <MusicStep
            music={music}
            onMusicChange={setMusic}
            onNext={() => {
              markComplete('music');
              setStep('captions');
            }}
          />
        )}

        {step === 'captions' && (
          <CaptionsStep
            captionConfig={captionConfig}
            onConfigChange={setCaptionConfig}
            onNext={() => {
              markComplete('captions');
              setStep('finalize');
            }}
          />
        )}

        {step === 'finalize' && (
          <FinalizeStep
            scripts={scripts}
            music={music}
            captionConfig={captionConfig}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            results={results}
            onResults={setResults}
            onStartNew={handleStartNew}
          />
        )}
      </LongformWizardShell>
    </>
  );
}
