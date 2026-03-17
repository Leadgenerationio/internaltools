'use client';

import { useState, useEffect } from 'react';
import type { AdBrief, GeneratedAd } from '@/lib/types';
import { AD_LANGUAGES } from '@/lib/types';

interface Props {
  onGenerate: (brief: AdBrief) => void;
  /** Called when user pastes their own script (skips AI) */
  onPasteScript?: (ads: GeneratedAd[], brief: AdBrief) => void;
  generating: boolean;
  initialBrief?: AdBrief | null;
}

const EMPTY_BRIEF: AdBrief = {
  productService: '',
  brief: '',
  exclusions: '',
  pastedScript: '',
  targetAudience: '',
  sellingPoints: '',
  adExamples: '',
  toneStyle: '',
  additionalContext: '',
  addEmojis: true,
  language: 'English',
  isLongform: false,
};

export default function AdBriefForm({ onGenerate, onPasteScript, generating, initialBrief }: Props) {
  const [brief, setBrief] = useState<AdBrief>(initialBrief || EMPTY_BRIEF);
  const [mode, setMode] = useState<'generate' | 'paste'>('generate');

  useEffect(() => {
    if (initialBrief) setBrief(initialBrief);
  }, [initialBrief]);

  const update = (field: keyof AdBrief, value: string) => {
    setBrief((prev) => ({ ...prev, [field]: value }));
  };

  const canGenerate = brief.productService.trim().length > 0 && !generating;
  const canPaste = brief.pastedScript?.trim() && brief.pastedScript.trim().length > 10;

  const handlePasteSubmit = () => {
    if (!canPaste || !onPasteScript) return;
    const lines = brief.pastedScript!.trim().split('\n').filter((l) => l.trim());
    // Create a single ad from the pasted script
    const ad: GeneratedAd = {
      id: crypto.randomUUID(),
      funnelStage: brief.isLongform ? 'longform' : 'tofu',
      variationLabel: 'Pasted Script',
      textBoxes: lines.map((line) => ({ id: crypto.randomUUID(), text: line.trim() })),
      approved: true,
    };
    onPasteScript([ad], brief);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Ad Brief</h2>
        <p className="text-sm text-gray-400 mt-1">
          Describe your product and what you want. Keep it simple.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('generate')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'generate' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          Generate with AI
        </button>
        <button
          onClick={() => setMode('paste')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'paste' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          Paste Your Own Script
        </button>
      </div>

      {mode === 'generate' ? (
        <div className="space-y-4">
          {/* Product / Service */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Product / Service <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={brief.productService}
              onChange={(e) => update('productService', e.target.value)}
              placeholder="e.g. BeatQuote — AI-powered insurance comparison"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Brief — single freeform field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Brief
            </label>
            <textarea
              value={brief.brief || ''}
              onChange={(e) => update('brief', e.target.value)}
              placeholder="Who is your audience, what are the key selling points, what tone do you want, any examples of ads that work well..."
              rows={5}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* Exclusions */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Exclusions
            </label>
            <textarea
              value={brief.exclusions || ''}
              onChange={(e) => update('exclusions', e.target.value)}
              placeholder="Things to avoid — e.g. no competitor mentions, don't say 'cheap', avoid medical claims..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* Options row */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            {/* Language */}
            <div className="relative">
              <select
                value={brief.language}
                onChange={(e) => update('language', e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-white text-sm focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
              >
                {AD_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Emoji toggle */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={brief.addEmojis}
                  onChange={(e) => setBrief((prev) => ({ ...prev, addEmojis: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-blue-600 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-400 group-hover:text-gray-300">Emojis</span>
            </label>

            {/* Longform toggle */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={brief.isLongform || false}
                  onChange={(e) => setBrief((prev) => ({ ...prev, isLongform: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-purple-600 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-400 group-hover:text-gray-300">
                {brief.isLongform ? 'Longform script' : 'Short funnel ads'}
              </span>
            </label>
          </div>

          {/* Generate button */}
          <button
            onClick={() => canGenerate && onGenerate(brief)}
            disabled={!canGenerate}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
              canGenerate
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {brief.isLongform ? 'Generating longform script...' : 'Generating ad copy...'}
              </span>
            ) : brief.isLongform ? (
              'Generate Longform Script (FREE)'
            ) : (
              'Generate Ad Copy (FREE)'
            )}
          </button>
        </div>
      ) : (
        /* ── Paste mode ── */
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Paste your script
            </label>
            <textarea
              value={brief.pastedScript || ''}
              onChange={(e) => update('pastedScript', e.target.value)}
              placeholder={"Paste your ad copy here.\nEach line becomes a separate text box overlay.\n\nLine 1: Hook — grab attention\nLine 2: Problem or context\nLine 3: Solution\nLine 4: Proof or benefit\nLine 5: Call to action"}
              rows={10}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none font-mono"
            />
            <p className="text-xs text-gray-500 mt-1.5">Each line becomes a text box that appears on the video. Keep lines short.</p>
          </div>

          <button
            onClick={handlePasteSubmit}
            disabled={!canPaste}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
              canPaste
                ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            Use This Script
          </button>
        </div>
      )}
    </div>
  );
}
