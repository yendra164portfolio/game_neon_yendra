import React from 'react';
import { Pause, Volume2, VolumeX } from 'lucide-react';
import type { HudSnapshot } from '../game/types';
import { CoinSvgIcon } from './GameIcons';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  muted,
  onToggleMute,
  onPause,
}) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-20 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Perimeter Clusters */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-Left: Score + Distance + Tier */}
        <div
          className="px-3.5 py-2.5 rounded-lg border border-cyan-400/30"
          style={{ backgroundColor: 'rgba(6, 10, 24, 0.78)' }}
        >
          <div className="flex items-baseline gap-2.5">
            <span className="text-[11px] font-semibold tracking-widest text-cyan-300 uppercase">
              Score
            </span>
            <span className="text-[11px] font-semibold tracking-wider text-pink-400 uppercase">
              {hud.tierLabel}
            </span>
          </div>
          <div
            data-testid="hud-score"
            className="font-mono-num text-2xl sm:text-3xl font-bold text-white leading-none mt-0.5 hud-stroke"
          >
            {hud.score.toLocaleString()}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-300 font-mono-num">
            <span data-testid="hud-distance">{hud.distance} m</span>
            <span className="text-slate-500">·</span>
            <span className="text-cyan-300">{hud.speed} km/h</span>
          </div>
        </div>

        {/* Top-Right: Run Coins + Utility Buttons */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-400/35"
            style={{ backgroundColor: 'rgba(6, 10, 24, 0.78)' }}
          >
            <CoinSvgIcon className="w-5 h-5 shrink-0" />
            <span
              data-testid="hud-coins"
              className="font-mono-num text-lg sm:text-xl font-bold text-amber-300 hud-stroke"
            >
              {hud.coins}
            </span>
          </div>

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="pointer-events-auto w-11 h-11 rounded-lg border border-cyan-400/35 flex items-center justify-center text-cyan-200 hover:text-white hover:border-cyan-300 active:scale-95 transition"
            style={{ backgroundColor: 'rgba(6, 10, 24, 0.84)' }}
          >
            {muted ? <VolumeX className="w-5 h-5 text-pink-400" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Game"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="pointer-events-auto w-11 h-11 rounded-lg border border-cyan-400/35 flex items-center justify-center text-cyan-200 hover:text-white hover:border-cyan-300 active:scale-95 transition"
            style={{ backgroundColor: 'rgba(6, 10, 24, 0.84)' }}
          >
            <Pause className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom subtle hint on mobile/desktop without obstructing playfield */}
      <div className="flex justify-center">
        <p className="text-[11px] sm:text-xs tracking-wider text-slate-300/75 uppercase hud-stroke">
          A/D Move · Space/W Jump · S Slide · Esc Pause
        </p>
      </div>
    </div>
  );
};
