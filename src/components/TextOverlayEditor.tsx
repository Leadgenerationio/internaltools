'use client';

import { useState } from 'react';
import type { TextOverlay, TextStyle } from '@/lib/types';
import { DEFAULT_TEXT_STYLE, OVERLAY_PRESETS } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-700 pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-300 hover:text-white"
      >
        {title}
        <span className="text-gray-500">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

interface Props {
  overlays: TextOverlay[];
  onChange: (overlays: TextOverlay[]) => void;
  videoDuration: number;
}

export default function TextOverlayEditor({ overlays, onChange, videoDuration }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preset, setPreset] = useState<string>('white-box');

  const addOverlay = () => {
    // Auto-calculate start time: each new overlay starts 2s after the previous one
    const lastStart = overlays.length > 0
      ? Math.max(...overlays.map((o) => o.startTime))
      : -2;
    const newStart = Math.min(lastStart + 2, videoDuration - 1);

    const selectedPreset = OVERLAY_PRESETS[preset as keyof typeof OVERLAY_PRESETS];

    const newOverlay: TextOverlay = {
      id: uuidv4(),
      text: 'Your text here',
      startTime: newStart,
      endTime: videoDuration,
      position: 'center',
      yOffset: 0,
      style: { ...selectedPreset.style },
    };

    const updated = [...overlays, newOverlay];
    onChange(updated);
    setSelectedId(newOverlay.id);
  };

  const updateOverlay = (id: string, updates: Partial<TextOverlay>) => {
    onChange(overlays.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  };

  const updateStyle = (id: string, styleUpdates: Partial<TextStyle>) => {
    onChange(
      overlays.map((o) =>
        o.id === id ? { ...o, style: { ...o.style, ...styleUpdates } } : o
      )
    );
  };

  const removeOverlay = (id: string) => {
    onChange(overlays.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveOverlay = (id: string, direction: 'up' | 'down') => {
    const index = overlays.findIndex((o) => o.id === id);
    if (direction === 'up' && index > 0) {
      const updated = [...overlays];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      onChange(updated);
    }
    if (direction === 'down' && index < overlays.length - 1) {
      const updated = [...overlays];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      onChange(updated);
    }
  };

  const selected = overlays.find((o) => o.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">2. Text Overlays</h2>
        <div className="flex items-center gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="bg-gray-800 text-sm text-gray-300 rounded-lg px-3 py-1.5 border border-gray-700"
          >
            {Object.entries(OVERLAY_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={addOverlay}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            + Add Text
          </button>
        </div>
      </div>

      {/* Overlay list */}
      <div className="space-y-2">
        {overlays.map((overlay, i) => (
          <div
            key={overlay.id}
            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedId === overlay.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
            }`}
            onClick={() => setSelectedId(overlay.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-gray-500 text-sm font-mono w-6">{i + 1}.</span>
                <span className="text-gray-200 text-sm truncate">{overlay.emoji ? `${overlay.emoji} ${overlay.text}` : overlay.text}</span>
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                  {overlay.startTime.toFixed(1)}s
                </span>
                <button onClick={(e) => { e.stopPropagation(); moveOverlay(overlay.id, 'up'); }} className="text-gray-500 hover:text-white p-1.5 rounded hover:bg-gray-700" title="Move up">↑</button>
                <button onClick={(e) => { e.stopPropagation(); moveOverlay(overlay.id, 'down'); }} className="text-gray-500 hover:text-white p-1.5 rounded hover:bg-gray-700" title="Move down">↓</button>
                <button onClick={(e) => { e.stopPropagation(); removeOverlay(overlay.id); }} className="text-red-400 hover:text-red-300 hover:bg-red-900/30 p-1.5 rounded" title="Remove">✕</button>
              </div>
            </div>
          </div>
        ))}

        {overlays.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No text overlays yet. Click "+ Add Text" to start.</p>
            <p className="text-sm mt-1">Each text box will appear at a staggered time, just like your ad.</p>
          </div>
        )}
      </div>

      {/* Detail editor for selected overlay */}
      {selected && (
        <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Edit: Text #{overlays.findIndex(o => o.id === selected.id) + 1}</h3>

          <CollapsibleSection title="Text" defaultOpen={true}>
            <textarea
              value={selected.emoji ? `${selected.emoji} ${selected.text}` : selected.text}
              onChange={(e) => updateOverlay(selected.id, { text: e.target.value, emoji: '' })}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              rows={3}
              placeholder="Type your text... emojis work when you paste them 🏠"
            />
          </CollapsibleSection>

          <CollapsibleSection title="Timing" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Appear at (s)</label>
                <input
                  type="number"
                  value={selected.startTime}
                  onChange={(e) => updateOverlay(selected.id, { startTime: parseFloat(e.target.value) || 0 })}
                  min={0}
                  max={videoDuration}
                  step={0.5}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Disappear at (s)</label>
                <input
                  type="number"
                  value={selected.endTime}
                  onChange={(e) => updateOverlay(selected.id, { endTime: parseFloat(e.target.value) || videoDuration })}
                  min={selected.startTime}
                  max={videoDuration}
                  step={0.5}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Style" defaultOpen={false}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Font weight</label>
                <select
                  value={selected.style.fontWeight}
                  onChange={(e) => updateStyle(selected.id, { fontWeight: e.target.value as 'normal' | 'bold' | 'extrabold' })}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="normal">Regular</option>
                  <option value="bold">Bold</option>
                  <option value="extrabold">Extra Bold</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Font size</label>
                <input
                  type="number"
                  value={selected.style.fontSize}
                  onChange={(e) => updateStyle(selected.id, { fontSize: parseInt(e.target.value) || 28 })}
                  min={12}
                  max={72}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Text color</label>
                <input
                  type="color"
                  value={selected.style.textColor}
                  onChange={(e) => updateStyle(selected.id, { textColor: e.target.value })}
                  className="w-full h-9 bg-gray-900 border border-gray-600 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Box color</label>
                <input
                  type="color"
                  value={selected.style.bgColor}
                  onChange={(e) => updateStyle(selected.id, { bgColor: e.target.value })}
                  className="w-full h-9 bg-gray-900 border border-gray-600 rounded-lg cursor-pointer"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Box opacity: {(selected.style.bgOpacity * 100).toFixed(0)}%</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={selected.style.bgOpacity}
                onChange={(e) => updateStyle(selected.id, { bgOpacity: parseFloat(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
