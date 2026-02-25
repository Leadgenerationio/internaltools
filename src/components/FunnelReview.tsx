'use client';

import { useState } from 'react';
import type { GeneratedAd, FunnelStage } from '@/lib/types';
import { FUNNEL_LABELS, FUNNEL_DESCRIPTIONS } from '@/lib/types';

interface Props {
  ads: GeneratedAd[];
  onUpdateAds: (ads: GeneratedAd[]) => void;
  onRegenerateAd: (adId: string) => void;
  regeneratingId: string | null;
}

const TABS: FunnelStage[] = ['tofu', 'mofu', 'bofu'];

export default function FunnelReview({ ads, onUpdateAds, onRegenerateAd, regeneratingId }: Props) {
  const [activeTab, setActiveTab] = useState<FunnelStage>('tofu');

  const stageAds = ads.filter((a) => a.funnelStage === activeTab);
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

      {/* Funnel stage tabs */}
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
              <span>{FUNNEL_LABELS[stage]}</span>
              <span className="ml-2 text-xs opacity-60">
                {approved}/{count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stage description */}
      <p className="text-sm text-gray-500">{FUNNEL_DESCRIPTIONS[activeTab]}</p>

      {/* Ad cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="flex items-center gap-2">
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
    </div>
  );
}
