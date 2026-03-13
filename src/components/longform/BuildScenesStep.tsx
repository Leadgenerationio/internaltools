'use client';

import { useState, useCallback } from 'react';
import type { LongformScriptV2, LongformSceneSlot } from '@/lib/longform-types';
import SceneSlot from './SceneSlot';

interface Props {
  scripts: LongformScriptV2[];
  onScriptsChange: (scripts: LongformScriptV2[]) => void;
  onNext: () => void;
}

export default function BuildScenesStep({ scripts, onScriptsChange, onNext }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const updateScene = useCallback((scriptIdx: number, sceneIdx: number, scene: LongformSceneSlot) => {
    const updated = scripts.map((s, si) => {
      if (si !== scriptIdx) return s;
      const scenes = s.scenes.map((sc, sci) => sci === sceneIdx ? scene : sc);
      return { ...s, scenes };
    });
    onScriptsChange(updated);
  }, [scripts, onScriptsChange]);

  const saveToLibrary = useCallback(async (clipUrl: string, name: string) => {
    setSavingLibrary(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/longform/save-to-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipUrl, name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(data.error);
      }
      setSaveMessage('Saved to library!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setSaveMessage(`Error: ${err.message}`);
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setSavingLibrary(false);
    }
  }, []);

  const script = scripts[activeTab];
  if (!script) return null;

  const allScenesFilled = scripts.every((s) => s.scenes.every((sc) => sc.clipUrl));
  const currentFilledCount = script.scenes.filter((s) => s.clipUrl).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold mb-1">Build Scenes</h2>
        <p className="text-gray-400 text-sm">
          Fill each scene with a video clip. Generate with AI, upload your own, or pick from your media library.
        </p>
      </div>

      {/* Script tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-2">
        {scripts.map((s, idx) => {
          const filled = s.scenes.filter((sc) => sc.clipUrl).length;
          const total = s.scenes.length;
          return (
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
              <span className={`ml-2 text-xs ${filled === total ? 'text-green-400' : 'text-gray-500'}`}>
                {filled}/{total}
              </span>
            </button>
          );
        })}
      </div>

      {saveMessage && (
        <div className={`text-sm px-4 py-2 rounded-lg ${
          saveMessage.startsWith('Error') ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'
        }`}>
          {saveMessage}
        </div>
      )}

      {/* Scene grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {script.scenes.map((scene, si) => (
          <SceneSlot
            key={scene.id}
            scene={scene}
            onUpdate={(updated) => updateScene(activeTab, si, updated)}
            onSaveToLibrary={saveToLibrary}
          />
        ))}
      </div>

      {/* Progress + Next */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-800">
        <span className="text-sm text-gray-500">
          {currentFilledCount}/{script.scenes.length} scenes filled for &ldquo;{script.variant}&rdquo;
        </span>
        <button
          onClick={onNext}
          disabled={!allScenesFilled}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          {allScenesFilled ? 'Next: Music' : 'Fill all scenes to continue'}
        </button>
      </div>
    </div>
  );
}
