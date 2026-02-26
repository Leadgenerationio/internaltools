'use client';

import { useState, useEffect } from 'react';
import type { TextStyle } from '@/lib/types';
import { OVERLAY_PRESETS } from '@/lib/types';

interface SavedTemplate {
  name: string;
  style: TextStyle;
  stagger: number;
}

const TEMPLATES_KEY = 'adMaker_templates';

function loadTemplates(): SavedTemplate[] {
  try {
    const stored = localStorage.getItem(TEMPLATES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveTemplates(templates: SavedTemplate[]) {
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates)); } catch { /* ignore */ }
}

interface Props {
  style: TextStyle;
  onChange: (style: TextStyle) => void;
  staggerSeconds: number;
  onStaggerChange: (seconds: number) => void;
}

export default function StyleConfigurator({ style, onChange, staggerSeconds, onStaggerChange }: Props) {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => { setTemplates(loadTemplates()); }, []);

  const update = (changes: Partial<TextStyle>) => {
    onChange({ ...style, ...changes });
  };

  const applyPreset = (key: string) => {
    const preset = OVERLAY_PRESETS[key as keyof typeof OVERLAY_PRESETS];
    if (preset) onChange({ ...preset.style });
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    const updated = [...templates.filter((t) => t.name !== name), { name, style: { ...style }, stagger: staggerSeconds }];
    setTemplates(updated);
    saveTemplates(updated);
    setTemplateName('');
    setShowSave(false);
  };

  const handleLoadTemplate = (t: SavedTemplate) => {
    onChange({ ...t.style });
    onStaggerChange(t.stagger);
  };

  const handleDeleteTemplate = (name: string) => {
    const updated = templates.filter((t) => t.name !== name);
    setTemplates(updated);
    saveTemplates(updated);
  };

  return (
    <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">Overlay Style</h3>

      {/* Preset picker */}
      <div>
        <label className="text-xs text-gray-400 block mb-1.5">Preset</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(OVERLAY_PRESETS).map(([key, preset]) => {
            const isActive =
              style.textColor === preset.style.textColor &&
              style.bgColor === preset.style.bgColor &&
              style.bgOpacity === preset.style.bgOpacity;
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                  isActive
                    ? 'border-blue-500 bg-blue-500/10 border'
                    : 'border-gray-600 bg-gray-900 border hover:border-gray-500'
                }`}
              >
                <span
                  className="inline-block w-3 h-3 rounded mr-1.5 align-middle border border-gray-600"
                  style={{
                    backgroundColor: preset.style.bgOpacity > 0
                      ? preset.style.bgColor
                      : 'transparent',
                  }}
                />
                {preset.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timing */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">
          Text stagger: {staggerSeconds}s between each box
        </label>
        <input
          type="range"
          min={0.5}
          max={4}
          step={0.5}
          value={staggerSeconds}
          onChange={(e) => onStaggerChange(parseFloat(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-600 mt-0.5">
          <span>0.5s (fast)</span>
          <span>4s (slow)</span>
        </div>
      </div>

      {/* Colours & sizing */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Text colour</label>
          <input
            type="color"
            value={style.textColor}
            onChange={(e) => update({ textColor: e.target.value })}
            className="w-full h-8 bg-gray-900 border border-gray-600 rounded-lg cursor-pointer"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Box colour</label>
          <input
            type="color"
            value={style.bgColor}
            onChange={(e) => update({ bgColor: e.target.value })}
            className="w-full h-8 bg-gray-900 border border-gray-600 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">
          Box opacity: {Math.round(style.bgOpacity * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={style.bgOpacity}
          onChange={(e) => update({ bgOpacity: parseFloat(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Font size</label>
          <input
            type="number"
            value={style.fontSize}
            onChange={(e) => update({ fontSize: parseInt(e.target.value) || 28 })}
            min={12}
            max={72}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Font weight</label>
          <select
            value={style.fontWeight}
            onChange={(e) => update({ fontWeight: e.target.value as TextStyle['fontWeight'] })}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="normal">Regular</option>
            <option value="bold">Bold</option>
            <option value="extrabold">Extra Bold</option>
          </select>
        </div>
      </div>

      {/* Saved templates */}
      <div className="border-t border-gray-700 pt-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-400">Saved Templates</label>
          <button
            onClick={() => setShowSave(!showSave)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {showSave ? 'Cancel' : 'Save Current'}
          </button>
        </div>

        {showSave && (
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name..."
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:border-blue-500 focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
            />
            <button
              onClick={handleSaveTemplate}
              disabled={!templateName.trim()}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs rounded-lg transition-colors"
            >
              Save
            </button>
          </div>
        )}

        {templates.length > 0 ? (
          <div className="space-y-1">
            {templates.map((t) => (
              <div key={t.name} className="flex items-center gap-2">
                <button
                  onClick={() => handleLoadTemplate(t)}
                  className="flex-1 text-left px-2 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors truncate"
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded mr-1.5 align-middle border border-gray-600"
                    style={{ backgroundColor: t.style.bgOpacity > 0 ? t.style.bgColor : 'transparent' }}
                  />
                  {t.name}
                </button>
                <button
                  onClick={() => handleDeleteTemplate(t.name)}
                  className="shrink-0 text-xs text-gray-500 hover:text-red-400 px-1 transition-colors"
                  title="Delete template"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">No saved templates yet.</p>
        )}
      </div>
    </div>
  );
}
