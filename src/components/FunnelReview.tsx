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

    if (!text.trim()) return;

    // If cursor is at start or end, split in the middle
    const splitAt = (cursorPos > 0 && cursorPos < text.length) ? cursorPos : Math.floor(text.length / 2);

    const before = text.slice(0, splitAt).trimEnd();
    const after = text.slice(splitAt).trimStart();

    if (!before && !after) return;

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

  const mergeWithPrevious = (adId: string, boxIndex: number) => {
    if (boxIndex === 0) return;
    onUpdateAds(
      ads.map((a) => {
        if (a.id !== adId) return a;
        const newBoxes = [...a.textBoxes];
        const merged = newBoxes[boxIndex - 1].text + '\n' + newBoxes[boxIndex].text;
        newBoxes[boxIndex - 1] = { ...newBoxes[boxIndex - 1], text: merged };
        newBoxes.splice(boxIndex, 1);
        return { ...a, textBoxes: newBoxes };
      })
    );
  };

  const approveAll = () => {
    onUpdateAds(ads.map((a) => ({ ...a, approved: true })));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">
            {isLongform ? 'Review Longform Script' : 'Review Ad Copy'}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {isLongform
              ? `${ads[0]?.textBoxes.length || 0} text block${(ads[0]?.textBoxes.length || 0) !== 1 ? 's' : ''} — place your cursor and press Split to break into separate overlay boxes.`
              : `${approvedCount} of ${ads.length} approved — edit text, then approve the ones you want to render.`}
          </p>
        </div>
        <button
          onClick={approveAll}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isLongform ? 'Approve' : 'Approve All'}
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

      {/* Longform editor */}
      {isLongform && ads[0] && (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <CopyButton text={ads[0].textBoxes.map((b) => b.text).join('\n\n')} />
            <div className="flex items-center gap-3">
              {regeneratingId === ads[0].id ? (
                <span className="flex items-center gap-1.5 text-xs text-blue-400">
                  <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Regenerating...
                </span>
              ) : (
                <button
                  onClick={() => onRegenerateAd(ads[0].id)}
                  className="text-xs text-gray-400 hover:text-blue-400 transition-colors"
                >
                  Regenerate
                </button>
              )}
            </div>
          </div>

          {/* Text blocks with split controls */}
          <div className="space-y-0">
            {ads[0].textBoxes.map((box, i) => (
              <div key={box.id}>
                {/* Text block */}
                <div className="relative group">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 font-mono pt-3 shrink-0 w-6 text-right">
                      {i + 1}.
                    </span>
                    <textarea
                      ref={(el) => { textareaRefs.current[box.id] = el; }}
                      value={box.text}
                      onChange={(e) => updateTextBox(ads[0].id, box.id, e.target.value)}
                      rows={Math.max(3, Math.ceil(box.text.length / 60))}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm resize-vertical focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      placeholder="Type or paste your script text here..."
                    />
                  </div>

                  {/* Action buttons for this block */}
                  <div className="flex items-center gap-2 mt-1 ml-8">
                    <button
                      onClick={() => splitTextBox(ads[0].id, box.id)}
                      className="text-xs px-2 py-1 text-blue-400 hover:text-blue-300 hover:bg-blue-950/30 rounded transition-colors"
                      title="Place your cursor where you want to split, then click"
                    >
                      Split at cursor
                    </button>
                    {i > 0 && (
                      <button
                        onClick={() => mergeWithPrevious(ads[0].id, i)}
                        className="text-xs px-2 py-1 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
                      >
                        Merge up
                      </button>
                    )}
                    {ads[0].textBoxes.length > 1 && (
                      <button
                        onClick={() => deleteTextBox(ads[0].id, box.id)}
                        className="text-xs px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Divider between blocks */}
                {i < ads[0].textBoxes.length - 1 && (
                  <div className="flex items-center gap-2 ml-8 my-2">
                    <div className="flex-1 border-t border-dashed border-gray-700" />
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider">next overlay</span>
                    <div className="flex-1 border-t border-dashed border-gray-700" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Approve */}
          <button
            onClick={() => toggleApproval(ads[0].id)}
            className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
              ads[0].approved
                ? 'bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-red-600/20 hover:text-red-400 hover:border-red-600/30'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
          >
            {ads[0].approved ? 'Approved — click to unapprove' : 'Approve Script'}
          </button>
        </div>
      )}

      {/* Ad cards grid — funnel mode only */}
      {!isLongform && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
                  <div key={box.id} className="flex gap-2">
                    <span className="text-xs text-gray-500 font-mono pt-2.5 shrink-0 w-5">
                      {i + 1}.
                    </span>
                    <textarea
                      value={box.text}
                      onChange={(e) => updateTextBox(ad.id, box.id, e.target.value)}
                      rows={2}
                      className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                ))}
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
      )}
    </div>
  );
}
