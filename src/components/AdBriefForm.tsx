'use client';

import { useState } from 'react';
import type { AdBrief } from '@/lib/types';

interface Props {
  onGenerate: (brief: AdBrief) => void;
  generating: boolean;
  initialBrief?: AdBrief | null;
}

const EMPTY_BRIEF: AdBrief = {
  productService: '',
  targetAudience: '',
  sellingPoints: '',
  adExamples: '',
  toneStyle: '',
  additionalContext: '',
  addEmojis: true,
};

export default function AdBriefForm({ onGenerate, generating, initialBrief }: Props) {
  const [brief, setBrief] = useState<AdBrief>(initialBrief || EMPTY_BRIEF);

  const update = (field: keyof AdBrief, value: string) => {
    setBrief((prev) => ({ ...prev, [field]: value }));
  };

  const canSubmit = brief.productService.trim().length > 0 && !generating;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Ad Brief</h2>
        <p className="text-sm text-gray-400 mt-1">
          Give as much detail as possible — the better the brief, the better the ad copy.
        </p>
      </div>

      <div className="space-y-4">
        {/* Product / Service */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            What are you advertising? <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={brief.productService}
            onChange={(e) => update('productService', e.target.value)}
            placeholder="e.g. BeatQuote — an AI-powered insurance comparison tool"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Target audience
          </label>
          <input
            type="text"
            value={brief.targetAudience}
            onChange={(e) => update('targetAudience', e.target.value)}
            placeholder="e.g. Homeowners aged 30-55, UK-based, looking to save on bills"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Key Selling Points */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Key selling points
          </label>
          <textarea
            value={brief.sellingPoints}
            onChange={(e) => update('sellingPoints', e.target.value)}
            placeholder="e.g. Save up to 40% on energy bills, free no-obligation quotes, takes 60 seconds, trusted by 10,000+ customers"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
          />
        </div>

        {/* Examples of Ads That Have Worked */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Examples of ads that have worked well
          </label>
          <textarea
            value={brief.adExamples}
            onChange={(e) => update('adExamples', e.target.value)}
            placeholder="Paste in text from winning ads, describe what's worked before, or link references..."
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
          />
        </div>

        {/* Tone & Style */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Tone & style
          </label>
          <input
            type="text"
            value={brief.toneStyle}
            onChange={(e) => update('toneStyle', e.target.value)}
            placeholder="e.g. Conversational, urgent, educational, funny, professional..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Additional Context */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Anything else
          </label>
          <textarea
            value={brief.additionalContext}
            onChange={(e) => update('additionalContext', e.target.value)}
            placeholder="Any other info — offers, deadlines, brand guidelines, things to avoid..."
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
          />
        </div>
      </div>

      {/* Emoji toggle */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <div className="relative">
          <input
            type="checkbox"
            checked={brief.addEmojis}
            onChange={(e) => setBrief((prev) => ({ ...prev, addEmojis: e.target.checked }))}
            className="sr-only peer"
          />
          <div className="w-10 h-6 bg-gray-700 rounded-full peer-checked:bg-blue-600 transition-colors" />
          <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
        </div>
        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
          Add emojis to start of text boxes
        </span>
      </label>

      {/* Generate button */}
      <button
        onClick={() => canSubmit && onGenerate(brief)}
        disabled={!canSubmit}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
          canSubmit
            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
        }`}
      >
        {generating ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating ad copy...
          </span>
        ) : (
          'Generate Ad Copy (4 TOFU + 4 MOFU + 2 BOFU)'
        )}
      </button>
    </div>
  );
}
