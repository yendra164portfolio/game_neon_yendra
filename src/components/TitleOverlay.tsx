import React from 'react';
import { Play, Settings, Shirt, Volume2, VolumeX } from 'lucide-react';
import type { PersistedProgress } from '../game/types';
import { CoinSvgIcon, NeonRushLogo, TrophySvgIcon } from './GameIcons';

interface TitleOverlayProps {
  progress: PersistedProgress;
  onStart: () => void;
  onOpenSkins: () => void;
  onOpenSettings: () => void;
  onToggleMute: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  progress,
  onStart,
  onOpenSkins,
  onOpenSettings,
  onToggleMute,
}) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-20 flex flex-col justify-between p-5 sm:p-8 lg:p-12">
      {/* Top utility mute */}
      <div className="flex justify-end">
        <button
          type="button"
          aria-label={progress.settings.muted ? 'Unmute Audio' : 'Mute Audio'}
          onClick={onToggleMute}
          className="pointer-events-auto w-11 h-11 rounded-lg border border-cyan-400/35 flex items-center justify-center text-cyan-200 hover:text-white hover:border-cyan-300 transition"
          style={{ backgroundColor: 'rgba(8, 12, 26, 0.82)' }}
        >
          {progress.settings.muted ? (
            <VolumeX className="w-5 h-5 text-pink-400" />
          ) : (
            <Volume2 className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Left-third negative-space Title Lockup & Menu Actions */}
      <div className="max-w-md w-full my-auto pointer-events-auto">
        <NeonRushLogo className="w-full max-w-[380px] mb-6 drop-shadow-lg" />

        {/* Best Score & Coin Balance Readouts */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div
            className="px-4 py-3 rounded-lg border border-cyan-400/25 flex items-center gap-3"
            style={{ backgroundColor: 'rgba(8, 12, 26, 0.84)' }}
          >
            <TrophySvgIcon className="w-6 h-6 shrink-0" />
            <div>
              <div className="text-[11px] uppercase tracking-widest text-cyan-300">
                Best Score
              </div>
              <div
                data-testid="title-best-score"
                className="font-mono-num text-xl font-bold text-white"
              >
                {progress.bestScore.toLocaleString()}
              </div>
            </div>
          </div>

          <div
            className="px-4 py-3 rounded-lg border border-amber-400/30 flex items-center gap-3"
            style={{ backgroundColor: 'rgba(8, 12, 26, 0.84)' }}
          >
            <CoinSvgIcon className="w-6 h-6 shrink-0" />
            <div>
              <div className="text-[11px] uppercase tracking-widest text-amber-300">
                Coins
              </div>
              <div
                data-testid="title-coin-balance"
                className="font-mono-num text-xl font-bold text-amber-300"
              >
                {progress.totalCoins.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Primary Play CTA + Secondary Actions */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="w-full h-14 rounded-lg bg-cyan-400 hover:bg-cyan-300 active:scale-[0.99] text-slate-950 font-display font-bold text-xl tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-[0_0_28px_rgba(34,230,255,0.45)] transition cursor-pointer"
          >
            <Play className="w-5 h-5 fill-slate-950" />
            Play Run
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onOpenSkins}
              className="h-12 rounded-lg border border-cyan-400/40 hover:border-cyan-300 text-slate-100 font-display font-semibold tracking-wider uppercase text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              style={{ backgroundColor: 'rgba(10, 15, 32, 0.88)' }}
            >
              <Shirt className="w-4 h-4 text-cyan-300" />
              Skins
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="h-12 rounded-lg border border-pink-400/35 hover:border-pink-300 text-slate-100 font-display font-semibold tracking-wider uppercase text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              style={{ backgroundColor: 'rgba(10, 15, 32, 0.88)' }}
            >
              <Settings className="w-4 h-4 text-pink-400" />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Single flat bottom control-hint line */}
      <div className="flex justify-center sm:justify-start">
        <p className="hidden sm:block text-xs tracking-wider text-slate-300/85 uppercase hud-stroke whitespace-nowrap">
          A/D Move · Space/↑ Jump · S/↓ Slide · Esc Pause
        </p>
        <p className="sm:hidden text-[11px] tracking-wider text-slate-300/85 uppercase hud-stroke whitespace-nowrap">
          Swipe Left/Right Move · Up Jump · Down Slide
        </p>
      </div>
    </div>
  );
};
