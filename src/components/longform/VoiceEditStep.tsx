'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LongformScriptV2, VoiceoverConfig } from '@/lib/longform-types';
import VoicePreviewPlayer from './VoicePreviewPlayer';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

interface Props {
  scripts: LongformScriptV2[];
  defaultVoiceConfig: VoiceoverConfig;
  onScriptsChange: (scripts: LongformScriptV2[]) => void;
  onNext: () => void;
}

export default function VoiceEditStep({ scripts, defaultVoiceConfig, onScriptsChange, onNext }: Props) {
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [generatingVo, setGeneratingVo] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch voices on mount
  useEffect(() => {
    fetch('/api/longform/voices')
      .then((r) => r.json())
      .then((data) => setVoices(data.voices || []))
      .catch(() => {})
      .finally(() => setLoadingVoices(false));
  }, []);

  const updateScript = useCallback((idx: number, updates: Partial<LongformScriptV2>) => {
    const updated = scripts.map((s, i) => i === idx ? { ...s, ...updates } : s);
    onScriptsChange(updated);
  }, [scripts, onScriptsChange]);

  const updateSceneText = useCallback((scriptIdx: number, sceneIdx: number, text: string) => {
    const updated = scripts.map((s, si) => {
      if (si !== scriptIdx) return s;
      const scenes = s.scenes.map((sc, sci) => sci === sceneIdx ? { ...sc, text } : sc);
      return { ...s, scenes, fullText: scenes.map((sc) => sc.text).join(' ') };
    });
    onScriptsChange(updated);
  }, [scripts, onScriptsChange]);

  const generateVoiceover = async (idx: number) => {
    const script = scripts[idx];
    const voiceConfig = script.voiceConfig || defaultVoiceConfig;
    const voiceId = script.voiceId || voiceConfig.voiceId;

    setGeneratingVo((p) => ({ ...p, [script.id]: true }));
    setErrors((p) => ({ ...p, [script.id]: '' }));

    try {
      const res = await fetch('/api/longform/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          scriptText: script.fullText,
          voiceConfig: { ...voiceConfig, voiceId },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const data = await res.json();
      updateScript(idx, {
        voiceoverUrl: data.voiceoverUrl,
        voiceoverDuration: data.durationSeconds,
      });
    } catch (err: any) {
      setErrors((p) => ({ ...p, [script.id]: err.message }));
    } finally {
      setGeneratingVo((p) => ({ ...p, [script.id]: false }));
    }
  };

  const allHaveVoiceover = scripts.every((s) => s.voiceoverUrl);

  const script = scripts[activeTab];
  if (!script) return null;

  const isGenerating = generatingVo[script.id];
  const error = errors[script.id];
  const selectedVoiceId = script.voiceId || defaultVoiceConfig.voiceId;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold mb-1">Voice & Edit</h2>
        <p className="text-gray-400 text-sm">Choose a voice for each script, edit the text, then generate the voiceover.</p>
      </div>

      {/* Script tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-2">
        {scripts.map((s, idx) => (
          <button
            key={s.id}
            onClick={() => setActiveTab(idx)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === idx
                ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {s.variant}
            {s.voiceoverUrl && <span className="ml-2 text-green-400 text-xs">\u2713</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Voice selection */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Voice</h3>
          {loadingVoices ? (
            <div className="text-gray-500 text-sm">Loading voices...</div>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
              {voices.map((v) => (
                <div
                  key={v.voice_id}
                  onClick={() => updateScript(activeTab, { voiceId: v.voice_id })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    selectedVoiceId === v.voice_id
                      ? 'bg-blue-600/20 border border-blue-600/50'
                      : 'bg-gray-800/50 hover:bg-gray-800 border border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{v.name}</div>
                    <div className="text-xs text-gray-500">
                      {v.labels?.gender} {v.labels?.accent && `\u00B7 ${v.labels.accent}`}
                    </div>
                  </div>
                  {v.preview_url && (
                    <VoicePreviewPlayer src={v.preview_url} compact />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Script text + voiceover */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Script Text</h3>

          {/* Full text editor */}
          <textarea
            value={script.fullText}
            onChange={(e) => {
              // When editing full text, update fullText and keep scenes in sync
              // (simple approach: put all text in first scene)
              const newText = e.target.value;
              const updatedScenes = script.scenes.length > 0
                ? script.scenes.map((sc, i) => i === 0 ? { ...sc, text: newText } : { ...sc, text: '' })
                : [{ id: crypto.randomUUID(), order: 0, text: newText, visualPrompt: '', durationEstimate: 30, source: 'empty' as const }];
              updateScript(activeTab, { fullText: newText, scenes: updatedScenes });
            }}
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Script text..."
          />

          {/* Scene breakdown (collapsible) */}
          <details className="group">
            <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
              Scene breakdown ({script.scenes.length} scenes) — click to edit individual scenes
            </summary>
            <div className="mt-2 space-y-2">
              {script.scenes.map((scene, si) => (
                <div key={scene.id} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-gray-500">Scene {si + 1}</span>
                    <span className="text-xs text-gray-600">~{scene.durationEstimate}s</span>
                  </div>
                  <textarea
                    value={scene.text}
                    onChange={(e) => updateSceneText(activeTab, si, e.target.value)}
                    rows={2}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white resize-none"
                  />
                </div>
              ))}
            </div>
          </details>

          {/* Generate voiceover */}
          <div className="border-t border-gray-800 pt-4 space-y-3">
            {script.voiceoverUrl && (
              <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-green-400 text-sm font-medium">Voiceover Ready</span>
                  <span className="text-xs text-gray-500">{script.voiceoverDuration?.toFixed(1)}s</span>
                </div>
                <VoicePreviewPlayer src={script.voiceoverUrl} label="Generated voiceover" />
              </div>
            )}

            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {script.voiceoverUrl ? 'Re-generate to update' : '2 tokens per voiceover'}
              </span>
              <button
                onClick={() => generateVoiceover(activeTab)}
                disabled={isGenerating || !script.fullText.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </span>
                ) : script.voiceoverUrl ? 'Re-generate Voiceover' : 'Generate Voiceover'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Next button */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-800">
        <span className="text-sm text-gray-500">
          {scripts.filter((s) => s.voiceoverUrl).length}/{scripts.length} voiceovers generated
        </span>
        <button
          onClick={onNext}
          disabled={!allHaveVoiceover}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          {allHaveVoiceover ? 'Next: Build Scenes' : 'Generate all voiceovers to continue'}
        </button>
      </div>
    </div>
  );
}
