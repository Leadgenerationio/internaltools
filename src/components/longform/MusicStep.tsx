'use client';

import type { MusicTrack } from '@/lib/types';
import MusicSelector from '@/components/MusicSelector';

interface Props {
  music: MusicTrack | null;
  onMusicChange: (music: MusicTrack | null) => void;
  onNext: () => void;
}

export default function MusicStep({ music, onMusicChange, onNext }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Background Music</h2>
        <p className="text-gray-400 text-sm">
          Add background music to your video. The music will be mixed at a lower volume behind the voiceover.
          This step is optional.
        </p>
      </div>

      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
        {/* No music option */}
        <button
          onClick={() => onMusicChange(null)}
          className={`w-full mb-4 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
            !music
              ? 'border-blue-600 bg-blue-600/10 text-blue-400'
              : 'border-gray-700 text-gray-400 hover:text-gray-300 hover:border-gray-600'
          }`}
        >
          No Background Music
        </button>

        <MusicSelector music={music} onChange={onMusicChange} />
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-800">
        <button
          onClick={onNext}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
        >
          Next: Captions
        </button>
      </div>
    </div>
  );
}
