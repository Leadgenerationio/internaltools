'use client';

import { useState } from 'react';

interface InfoBannerProps {
  title?: string;
  children: React.ReactNode;
  variant?: 'info' | 'tip' | 'warning';
  dismissible?: boolean;
}

const variantStyles = {
  info: {
    bg: 'bg-blue-500/10 border-blue-500/20',
    icon: 'text-blue-400',
    title: 'text-blue-300',
    text: 'text-blue-200/80',
  },
  tip: {
    bg: 'bg-green-500/10 border-green-500/20',
    icon: 'text-green-400',
    title: 'text-green-300',
    text: 'text-green-200/80',
  },
  warning: {
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    icon: 'text-yellow-400',
    title: 'text-yellow-300',
    text: 'text-yellow-200/80',
  },
};

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 20 20" width="18" height="18">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <text
        x="10"
        y="14.5"
        textAnchor="middle"
        fill="currentColor"
        fontSize="11"
        fontWeight="600"
        fontFamily="system-ui, sans-serif"
      >
        i
      </text>
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 20 20" width="18" height="18" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 2a5.5 5.5 0 0 0-2 10.63V14a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1.37A5.5 5.5 0 0 0 10 2Z" />
      <path strokeLinecap="round" d="M8 16.5h4M8.5 18h3" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 20 20" width="18" height="18" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.57 3.22 1.75 15a1.5 1.5 0 0 0 1.3 2.25h13.66a1.5 1.5 0 0 0 1.3-2.25L11.43 3.22a1.5 1.5 0 0 0-2.86 0Z" />
      <path strokeLinecap="round" d="M10 8v3M10 14h.01" />
    </svg>
  );
}

export default function InfoBanner({ title, children, variant = 'info', dismissible = false }: InfoBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const styles = variantStyles[variant];

  const Icon = variant === 'tip' ? LightbulbIcon : variant === 'warning' ? WarningIcon : InfoIcon;

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${styles.bg}`}>
      <Icon className={`shrink-0 mt-0.5 ${styles.icon}`} />
      <div className="flex-1 min-w-0">
        {title && (
          <p className={`text-sm font-medium ${styles.title} mb-0.5`}>{title}</p>
        )}
        <div className={`text-sm ${styles.text}`}>{children}</div>
      </div>
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors p-0.5"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
