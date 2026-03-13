'use client';

import { useState } from 'react';

interface Props {
  prompt: string;
  numScripts: number;
  language: string;
  onPromptChange: (prompt: string) => void;
  onNumScriptsChange: (n: number) => void;
  onLanguageChange: (lang: string) => void;
  onGenerate: () => Promise<void>;
  isGenerating: boolean;
}

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Polish', 'Arabic', 'Hindi', 'Japanese', 'Korean', 'Chinese'];

export default function PromptStep({
  prompt, numScripts, language,
  onPromptChange, onNumScriptsChange, onLanguageChange,
  onGenerate, isGenerating,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt describing your product or service.');
      return;
    }
    setError(null);
    try {
      await onGenerate();
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Create Your Ad Scripts</h2>
        <p className="text-gray-400">
          Describe your product, service, or offer in your own words. The AI will generate
          unique ad scripts, each taking a different creative angle.
        </p>
      </div>

      {/* Prompt textarea */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Your Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g. We sell premium dog food made from organic ingredients. Our target audience is health-conscious pet owners aged 25-45. We offer a 30-day money-back guarantee and free delivery..."
          rows={6}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          disabled={isGenerating}
        />
      </div>

      {/* Options row */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Number of Scripts
          </label>
          <select
            value={numScripts}
            onChange={(e) => onNumScriptsChange(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white"
            disabled={isGenerating}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n} script{n !== 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Language
          </label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white"
            disabled={isGenerating}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-green-400">Script generation is free</span>
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </span>
          ) : (
            `Generate ${numScripts} Script${numScripts !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </div>
  );
}
