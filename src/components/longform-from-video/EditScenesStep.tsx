'use client';

import { useState } from 'react';
import SceneSlot from '@/components/longform/SceneSlot';

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

interface Props {
  scenes: SceneSlotData[];
  onScenesChange: (scenes: SceneSlotData[]) => void;
  onNext: () => void;
}

export default function EditScenesStep({ scenes, onScenesChange, onNext }: Props) {
  const [expandedScene, setExpandedScene] = useState<string | null>(null);

  const replacedCount = scenes.filter((s) => s.clipUrl && s.source !== 'original').length;

  const handleSceneUpdate = (idx: number, updates: Partial<SceneSlotData>) => {
    const updated = [...scenes];
    updated[idx] = { ...updated[idx], ...updates };
    onScenesChange(updated);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1">Edit Scenes</h2>
          <p className="text-gray-400 text-sm">
            Replace any scene with b-roll. Scenes you don't touch will keep the original video.
            The original audio is always preserved.
          </p>
        </div>
        <span className="text-sm text-gray-500">
          {replacedCount} of {scenes.length} replaced
        </span>
      </div>

      <div className="space-y-4">
        {scenes.map((scene, idx) => (
          <div
            key={scene.id}
            className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden"
          >
            {/* Scene header */}
            <button
              onClick={() => setExpandedScene(expandedScene === scene.id ? null : scene.id)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-800/80 transition-colors"
            >
              {scene.thumbnail && (
                <img
                  src={scene.thumbnail}
                  alt={`Scene ${idx + 1}`}
                  className="w-16 h-10 object-cover rounded bg-gray-900 flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500">
                    {formatTime(scene.start)} – {formatTime(scene.end)}
                  </span>
                  {scene.clipUrl && scene.source !== 'original' && (
                    <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full">
                      B-roll added
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300 mt-0.5 truncate">
                  {scene.text || `Scene ${idx + 1}`}
                </p>
              </div>
              <span className="text-gray-500 text-xl">
                {expandedScene === scene.id ? '▼' : '▶'}
              </span>
            </button>

            {/* Expanded: SceneSlot for replacing video */}
            {expandedScene === scene.id && (
              <div className="border-t border-gray-700/50 p-4">
                <SceneSlot
                  scene={{
                    id: scene.id,
                    order: scene.order,
                    text: scene.text,
                    visualPrompt: scene.visualPrompt || scene.text,
                    durationEstimate: scene.duration,
                    clipUrl: scene.clipUrl,
                    clipFilename: scene.clipFilename,
                    clipDuration: scene.duration,
                    source: scene.source === 'original' ? 'empty' : scene.source === 'stock' ? 'uploaded' : scene.source as any,
                  }}
                  onUpdate={(updated) => handleSceneUpdate(idx, {
                    clipUrl: updated.clipUrl || '',
                    clipFilename: updated.clipFilename,
                    source: updated.source === 'empty' ? 'original' as const
                      : updated.source === 'ai-generated' ? 'ai' as const
                      : updated.source === 'uploaded' ? 'upload' as const
                      : updated.source === 'library' ? 'library' as const
                      : 'stock' as const,
                    visualPrompt: updated.visualPrompt,
                  })}
                  onSaveToLibrary={async () => {}}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-800">
        <button
          onClick={onNext}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          Next: Music
        </button>
      </div>
    </div>
  );
}
