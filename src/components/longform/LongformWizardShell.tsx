'use client';

import type { LongformWizardStep } from '@/lib/longform-types';

const STEPS: { key: LongformWizardStep; label: string }[] = [
  { key: 'prompt', label: 'Prompt' },
  { key: 'voice-edit', label: 'Voice & Edit' },
  { key: 'build-scenes', label: 'Build Scenes' },
  { key: 'music', label: 'Music' },
  { key: 'captions', label: 'Captions' },
  { key: 'finalize', label: 'Finalize' },
];

interface Props {
  currentStep: LongformWizardStep;
  completedSteps: Set<LongformWizardStep>;
  onStepClick: (step: LongformWizardStep) => void;
  children: React.ReactNode;
}

export default function LongformWizardShell({ currentStep, completedSteps, onStepClick, children }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Step bar */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
            {STEPS.map((step, idx) => {
              const isCompleted = completedSteps.has(step.key);
              const isCurrent = step.key === currentStep;
              const isClickable = isCompleted || idx <= currentIdx;

              return (
                <button
                  key={step.key}
                  onClick={() => isClickable && onStepClick(step.key)}
                  disabled={!isClickable}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all
                    ${isCurrent
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                        ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30 cursor-pointer'
                        : isClickable
                          ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 cursor-pointer'
                          : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                    }
                  `}
                >
                  <span className={`
                    w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                    ${isCurrent
                      ? 'bg-white text-blue-600'
                      : isCompleted
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }
                  `}>
                    {isCompleted ? '\u2713' : idx + 1}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  );
}
