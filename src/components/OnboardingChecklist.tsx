'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type AppStep = 'brief' | 'review' | 'media' | 'render';

interface OnboardingStatus {
  hasAds: boolean;
  hasApprovedAds: boolean;
  hasVideos: boolean;
  hasRenders: boolean;
  accountCreatedAt: string | null;
}

interface Props {
  onNavigate: (step: AppStep) => void;
}

const STORAGE_KEY = 'onboarding_dismissed';
const DOWNLOAD_KEY = 'onboarding_downloaded';
const ACCOUNT_AGE_DAYS = 7;

export default function OnboardingChecklist({ onNavigate }: Props) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(true); // Start hidden until we know
  const [loading, setLoading] = useState(true);
  const [celebrating, setCelebrating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hasDownloaded =
    typeof window !== 'undefined' &&
    localStorage.getItem(DOWNLOAD_KEY) === 'true';

  // Check dismissal and account age
  useEffect(() => {
    const wasDismissed = localStorage.getItem(STORAGE_KEY) === 'true';
    setDismissed(wasDismissed);
  }, []);

  // Fetch onboarding status
  const fetchStatus = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/onboarding', {
        signal: controller.signal,
      });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data: OnboardingStatus = await res.json();
      setStatus(data);

      // Check account age — only show for accounts < 7 days old
      if (data.accountCreatedAt) {
        const createdAt = new Date(data.accountCreatedAt);
        const daysSinceCreation =
          (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation > ACCOUNT_AGE_DAYS) {
          setDismissed(true);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!dismissed) {
      fetchStatus();
    } else {
      setLoading(false);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [dismissed, fetchStatus]);

  // Compute checklist items
  const items = status
    ? [
        {
          label: 'Create your first brief',
          done: status.hasAds,
          action: () => onNavigate('brief'),
        },
        {
          label: 'Review AI-generated scripts',
          done: status.hasApprovedAds,
          action: () => onNavigate('review'),
        },
        {
          label: 'Upload a background video',
          done: status.hasVideos,
          action: () => onNavigate('media'),
        },
        {
          label: 'Render your first ad',
          done: status.hasRenders,
          action: () => onNavigate('render'),
        },
        {
          label: 'Download your video',
          done: hasDownloaded,
          action: () => onNavigate('render'),
        },
      ]
    : [];

  const completedCount = items.filter((i) => i.done).length;
  const allDone = completedCount === 5 && items.length === 5;

  // Celebration when all complete
  useEffect(() => {
    if (allDone && !celebrating) {
      setCelebrating(true);
      const timer = setTimeout(() => {
        setDismissed(true);
        localStorage.setItem(STORAGE_KEY, 'true');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [allDone, celebrating]);

  // Don't render if dismissed, loading, or no status
  if (dismissed || loading || !status) return null;

  const progressPct = (completedCount / 5) * 100;

  return (
    <div className="mb-6 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">
              {celebrating
                ? 'You did it! All steps complete.'
                : 'Getting Started'}
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              {celebrating
                ? 'You are ready to create professional video ads.'
                : `${completedCount} of 5 steps complete`}
            </p>
          </div>
          {!celebrating && (
            <button
              onClick={() => {
                setDismissed(true);
                localStorage.setItem(STORAGE_KEY, 'true');
              }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-700/50"
            >
              Skip tour
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-3 w-full bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${
              allDone ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Celebration overlay */}
      {celebrating && (
        <div className="px-5 pb-5 pt-2 text-center">
          <p className="text-green-400 text-sm font-medium">
            Your onboarding is complete. This checklist will dismiss automatically.
          </p>
        </div>
      )}

      {/* Checklist */}
      {!celebrating && (
        <div className="px-5 pb-5 pt-1 space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                item.done
                  ? 'bg-green-950/20 border border-green-800/30'
                  : 'bg-gray-900/50 border border-gray-700/50 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Checkbox */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    item.done
                      ? 'bg-green-600'
                      : 'border-2 border-gray-600'
                  }`}
                >
                  {item.done && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <span
                  className={`text-sm ${
                    item.done ? 'text-gray-400 line-through' : 'text-white'
                  }`}
                >
                  {item.label}
                </span>
              </div>

              {!item.done && (
                <button
                  onClick={item.action}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors px-2 py-1 rounded hover:bg-blue-950/30"
                >
                  Start &rarr;
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
