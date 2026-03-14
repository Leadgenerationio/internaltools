'use client';

import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { GeneratedAd, FunnelStage } from '@/lib/types';
import { FUNNEL_LABELS, FUNNEL_DESCRIPTIONS } from '@/lib/types';
import Tooltip from '@/components/Tooltip';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-gray-400 hover:text-blue-400 transition-colors"
      title="Copy ad text to clipboard"
    >
      {copied ? 'Copied!' : 'Copy text'}
    </button>
  );
}

interface Props {
  ads: GeneratedAd[];
  onUpdateAds: (ads: GeneratedAd[]) => void;
  onRegenerateAd: (adId: string) => void;
  regeneratingId: string | null;
}

const TABS: FunnelStage[] = ['tofu', 'mofu', 'bofu'];

const FUNNEL_TOOLTIPS: Record<FunnelStage, string> = {
  tofu: 'Top of Funnel — Awareness ads that hook attention and spark curiosity. These are for people who have never heard of you.',
  mofu: 'Middle of Funnel — Trust-building ads with social proof and education. These warm up people who are already interested.',
  bofu: 'Bottom of Funnel — Conversion ads with urgency, offers, and strong CTAs. These close the deal.',
  longform: 'Longform Script — One continuous narrative with many text segments that build a complete story over your video.',
};

export default function FunnelReview({ ads, onUpdateAds, onRegenerateAd, regeneratingId }: Props) {
  const isLongform = ads.length > 0 && ads[0].funnelStage === 'longform';
  const [activeTab, setActiveTab] = useState<FunnelStage>(isLongform ? 'longform' : 'tofu');

  const stageAds = isLongform ? ads : ads.filter((a) => a.funnelStage === activeTab);
  const approvedCount = ads.filter((a) => a.approved).length;

  const toggleApproval = (adId: string) => {
    onUpdateAds(
      ads.map((a) => (a.id === adId ? { ...a, approved: !a.approved } : a))
    );
  };

  const updateTextBox = (adId: string, boxId: string, newText: string) => {
    onUpdateAds(
      ads.map((a) =>
        a.id === adId
          ? {
              ...a,
              textBoxes: a.textBoxes.map((b) =>
                b.id === boxId ? { ...b, text: newText } : b
              ),
            }
          : a
      )
    );
  };

  // Track cursor positions for split functionality
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const splitTextBox = (adId: string, boxId: string) => {
    const textarea = textareaRefs.current[boxId];
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const text = textarea.value;

    // If cursor is at start or end, split in the middle
    const splitAt = (cursorPos > 0 && cursorPos < text.length) ? cursorPos : Math.floor(text.length / 2);

    const before = text.slice(0, splitAt).trimEnd();
    const after = text.slice(splitAt).trimStart();

    onUpdateAds(
      ads.map((a) =>
        a.id === adId
          ? {
              ...a,
              textBoxes: a.textBoxes.flatMap((b) =>
                b.id === boxId
                  ? [
                      { ...b, text: before },
                      { id: uuidv4(), text: after },
                    ]
                  : [b]
              ),
            }
          : a
      )
    );
  };

  const deleteTextBox = (adId: string, boxId: string) => {
    onUpdateAds(
      ads.map((a) =>
        a.id === adId
          ? { ...a, textBoxes: a.textBoxes.filter((b) => b.id !== boxId) }
          : a
      )
    );
  };

  const addTextBox = (adId: string) => {
    onUpdateAds(
      ads.map((a) =>
        a.id === adId
          ? { ...a, textBoxes: [...a.textBoxes, { id: uuidv4(), text: '' }] }
          : a
      )
    );
  };

  const approveAll = () => {
    onUpdateAds(ads.map((a) => ({ ...a, approved: true })));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Review Ad Copy</h2>
          <p className="text-sm text-gray-400 mt-1">
            {approvedCount} of {ads.length} approved — edit text, then approve the ones you want to render.
          </p>
        </div>
        <button
          onClick={approveAll}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Approve All
        </button>
      </div>

      {/* Funnel stage tabs — hidden in longform mode */}
      {!isLongform && (
        <>
          <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
            {TABS.map((stage) => {
              const count = ads.filter((a) => a.funnelStage === stage).length;
              const approved = ads.filter((a) => a.funnelStage === stage && a.approved).length;
              return (
                <button
                  key={stage}
                  onClick={() => setActiveTab(stage)}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === stage
                      ? 'bg-gray-700 text-white shadow'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <span className="inline-flex items-center">
                    {FUNNEL_LABELS[stage]}
                    <Tooltip text={FUNNEL_TOOLTIPS[stage]} position="bottom" />
                  </span>
                  <span className="ml-2 text-xs opacity-60">
                    {approved}/{count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Stage description */}
          <p className="text-sm text-gray-500">{FUNNEL_DESCRIPTIONS[activeTab]}</p>
        </>
      )}

      {/* Longform description */}
      {isLongform && (
        <div className="p-3 bg-purple-950/30 border border-purple-800/50 rounded-xl">
          <p className="text-sm text-purple-300">
            Longform Script — {ads[0]?.textBoxes.length || 0} text blocks. Each block appears as a paragraph overlay on your video. Use <strong>Split</strong> to break a block at your cursor, or <strong>Delete</strong> / <strong>Add</strong> blocks to adjust the flow.
          </p>
        </div>
      )}

      {/* Ad cards grid */}
      <div className={`grid gap-4 ${isLongform ? 'grid-cols-1 max-w-2xl mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
        {stageAds.map((ad) => (
          <div
            key={ad.id}
            className={`rounded-xl border transition-all ${
              ad.approved
                ? 'border-green-600/50 bg-green-950/20'
                : 'border-gray-700 bg-gray-800/50'
            }`}
          >
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
              <span className="text-sm font-medium text-gray-300">
                {ad.variationLabel}
              </span>
              <div className="flex items-center gap-3">
                <CopyButton text={ad.textBoxes.map((b) => b.text).join('\n')} />
                {regeneratingId === ad.id ? (
                  <span className="flex items-center gap-1.5 text-xs text-blue-400">
                    <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Regenerating...
                  </span>
                ) : (
                  <button
                    onClick={() => onRegenerateAd(ad.id)}
                    className="text-xs text-gray-400 hover:text-blue-400 transition-colors"
                  >
                    Regenerate
                  </button>
                )}
              </div>
            </div>

            {/* Text boxes */}
            <div className="p-4 space-y-2">
              {ad.textBoxes.map((box, i) => (
                <div key={box.id} className="space-y-1">
                  <div className="flex gap-2">
                    <span className="text-xs text-gray-500 font-mono pt-2.5 shrink-0 w-5">
                      {i + 1}.
                    </span>
                    <textarea
                      ref={(el) => { textareaRefs.current[box.id] = el; }}
                      value={box.text}
                      onChange={(e) => updateTextBox(ad.id, box.id, e.target.value)}
                      rows={isLongform ? 4 : 2}
                      className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-vertical focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  {isLongform && (
                    <div className="flex gap-2 ml-7">
                      <button
                        onClick={() => splitTextBox(ad.id, box.id)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        title="Split this block at cursor position into two blocks"
                      >
                        Split
                      </button>
                      {ad.textBoxes.length > 1 && (
                        <button
                          onClick={() => deleteTextBox(ad.id, box.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {isLongform && (
                <button
                  onClick={() => addTextBox(ad.id)}
                  className="ml-7 mt-2 text-xs text-gray-400 hover:text-white border border-dashed border-gray-600 hover:border-gray-400 rounded-lg px-3 py-1.5 transition-colors"
                >
                  + Add text block
                </button>
              )}
            </div>

            {/* Approve/reject */}
            <div className="px-4 pb-4">
              <button
                onClick={() => toggleApproval(ad.id)}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
                  ad.approved
                    ? 'bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-red-600/20 hover:text-red-400 hover:border-red-600/30'
                    : 'bg-gray-700 text-gray-300 hover:bg-green-600/20 hover:text-green-400'
                }`}
              >
                {ad.approved ? 'Approved — click to remove' : 'Approve'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
