'use client';

import { useState, useRef, useEffect } from 'react';
import type { AdBrief, TextStyle } from '@/lib/types';

const CATEGORY_OPTIONS = [
  'E-commerce',
  'SaaS',
  'Local Business',
  'Events',
  'Mobile Apps',
  'Real Estate',
  'Education',
  'Health & Fitness',
  'Finance',
  'Other',
];

interface Props {
  open: boolean;
  onClose: () => void;
  brief: AdBrief;
  overlayStyle?: TextStyle | null;
  staggerSeconds?: number;
}

export default function SaveAsTemplateModal({
  open,
  onClose,
  brief,
  overlayStyle,
  staggerSeconds,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setCategory('');
      setError('');
      setSuccess('');
    }
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, saving, onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      if (!saving) onClose();
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          category: category || undefined,
          brief,
          overlayStyle: overlayStyle ?? undefined,
          staggerSeconds,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to save template');
        return;
      }

      setSuccess('Template saved! Your team can now use it for new projects.');

      // Auto-close after success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch {
      setError('Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Save as Template
            </h2>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Save this brief as a reusable template for your team.
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Template name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product Launch Campaign"
              maxLength={200}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of when to use this template..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select a category...</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Preview of what will be saved */}
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <p className="text-xs text-gray-400 mb-1">This template will include:</p>
            <ul className="text-xs text-gray-500 space-y-0.5">
              <li>
                Brief: {brief.productService ? brief.productService.slice(0, 60) + (brief.productService.length > 60 ? '...' : '') : 'Empty'}
              </li>
              {overlayStyle && <li>Overlay style settings</li>}
              {staggerSeconds !== undefined && (
                <li>Stagger timing: {staggerSeconds}s</li>
              )}
            </ul>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-400">{success}</p>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !!success}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              'Save Template'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
