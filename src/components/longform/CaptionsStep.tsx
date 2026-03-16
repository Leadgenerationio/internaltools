'use client';

import { useState, useEffect } from 'react';
import type { CaptionConfig } from '@/lib/longform-types';

interface Props {
  captionConfig: CaptionConfig;
  onConfigChange: (config: CaptionConfig) => void;
  onNext: () => void;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
];

export default function CaptionsStep({ captionConfig, onConfigChange, onNext }: Props) {
  const [templates, setTemplates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!captionConfig.enabled) return;
    setLoading(true);
    fetch('/api/longform/caption-templates')
      .then((r) => r.json())
      .then((data) => {
        // API returns string[] — normalize in case of objects
        const raw = data.templates || [];
        setTemplates(raw.map((t: any) => typeof t === 'string' ? t : t.name || String(t)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [captionConfig.enabled]);

  const update = (partial: Partial<CaptionConfig>) => {
    onConfigChange({ ...captionConfig, ...partial });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Captions</h2>
        <p className="text-gray-400 text-sm">
          Add auto-generated captions to your video via Submagic.
          Choose a caption style template.
        </p>
      </div>

      {/* Enable/disable toggle */}
      <div className="flex items-center justify-between bg-gray-800/50 rounded-xl px-5 py-4 border border-gray-700/50">
        <div>
          <span className="font-medium">Enable Captions</span>
          <p className="text-xs text-gray-500 mt-0.5">Requires cloud storage for processing</p>
        </div>
        <button
          onClick={() => update({ enabled: !captionConfig.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            captionConfig.enabled ? 'bg-blue-600' : 'bg-gray-700'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            captionConfig.enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {captionConfig.enabled && (
        <div className="space-y-4">
          {/* Template selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Caption Template</label>
            {loading ? (
              <div className="text-sm text-gray-500">Loading templates...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {templates.map((name) => (
                  <button
                    key={name}
                    onClick={() => update({ template: name })}
                    className={`px-3 py-3 rounded-lg border text-sm font-medium text-left transition-colors ${
                      captionConfig.template === name
                        ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                        : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Caption Language</label>
            <select
              value={captionConfig.language}
              onChange={(e) => update({ language: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={captionConfig.magicZooms}
                onChange={(e) => update({ magicZooms: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium">Magic Zooms</span>
                <p className="text-xs text-gray-500">Add dynamic zooms synced to speech emphasis</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={captionConfig.cleanAudio}
                onChange={(e) => update({ cleanAudio: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium">Clean Audio</span>
                <p className="text-xs text-gray-500">Remove background noise from audio</p>
              </div>
            </label>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-gray-800">
        <button
          onClick={onNext}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
        >
          Next: Finalize
        </button>
      </div>
    </div>
  );
}
