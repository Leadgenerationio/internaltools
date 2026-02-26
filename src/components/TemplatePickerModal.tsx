'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  brief: {
    productService?: string;
    targetAudience?: string;
  };
  isSystem: boolean;
  useCount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  onStartFromScratch: () => void;
  loading: boolean;
}

export default function TemplatePickerModal({
  open,
  onClose,
  onSelectTemplate,
  onStartFromScratch,
  loading: externalLoading,
}: Props) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fetching, setFetching] = useState(false);
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const fetchTemplates = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetching(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.set('category', selectedCategory);
      if (search.trim()) params.set('search', search.trim());
      params.set('pageSize', '50');

      const res = await fetch(`/api/templates?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(data.templates);
      setCategories(data.categories || []);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
    } finally {
      setFetching(false);
    }
  }, [selectedCategory, search]);

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [open, fetchTemplates]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleUseTemplate = (templateId: string) => {
    setUsingTemplateId(templateId);
    onSelectTemplate(templateId);
  };

  if (!open) return null;

  const isLoading = externalLoading || usingTemplateId !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">New Project</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                Start from scratch or use a template to get going faster
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
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
        </div>

        {/* Start from scratch option */}
        <div className="px-6 pt-5">
          <button
            onClick={onStartFromScratch}
            disabled={isLoading}
            className="w-full p-4 rounded-xl border-2 border-dashed border-gray-700 hover:border-blue-500 hover:bg-blue-950/10 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-800 group-hover:bg-blue-900/30 flex items-center justify-center transition-colors">
                <svg
                  className="w-5 h-5 text-gray-400 group-hover:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  Start from scratch
                </p>
                <p className="text-xs text-gray-400">
                  Blank project with empty brief
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Templates section */}
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">
              Or use a template
            </h3>
          </div>

          {/* Search + filter */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            {categories.length > 0 && (
              <select
                value={selectedCategory ?? ''}
                onChange={(e) =>
                  setSelectedCategory(e.target.value || null)
                }
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {fetching && templates.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-400 text-sm">Loading templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-500 text-sm">
                {search || selectedCategory
                  ? 'No templates match your filters'
                  : 'No templates available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleUseTemplate(template.id)}
                  disabled={isLoading}
                  className="p-4 rounded-xl bg-gray-800 border border-gray-700 hover:border-blue-500 hover:bg-gray-800/80 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                      {template.name}
                    </h4>
                    {template.category && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 whitespace-nowrap">
                        {template.category}
                      </span>
                    )}
                  </div>

                  {template.description && (
                    <p className="text-xs text-gray-400 leading-relaxed mb-2 line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  {template.brief?.productService && (
                    <p className="text-xs text-gray-500 truncate mb-2">
                      Product: {template.brief.productService}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    {template.isSystem && (
                      <span className="flex items-center gap-1">
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        System template
                      </span>
                    )}
                    {template.useCount > 0 && (
                      <span>
                        Used {template.useCount} time
                        {template.useCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {usingTemplateId === template.id && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-400">
                      <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Creating project...
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
