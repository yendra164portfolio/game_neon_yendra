import React, { useState } from 'react';
import { Check, Home, Lock, Play, RotateCcw, Settings, Volume2, VolumeX, X } from 'lucide-react';
import { CHARACTER_SKINS } from '../game/runnerLogic';
import type {
  GameSettings,
  HudSnapshot,
  PersistedProgress,
  RunSummary,
  SkinId,
} from '../game/types';
import { CoinSvgIcon, TrophySvgIcon } from './GameIcons';

interface PauseModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onMainMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  hud,
  onResume,
  onRestart,
  onOpenSettings,
  onMainMenu,
}) => (
  <div
    className="fixed inset-0 z-30 flex items-center justify-center p-4"
    style={{ backgroundColor: 'rgba(4, 7, 18, 0.68)' }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game Paused"
      className="panel-surface w-full max-w-sm rounded-xl p-6"
    >
      <div className="text-xs font-semibold tracking-widest text-cyan-300 uppercase mb-1">
        Simulation Halted
      </div>
      <h2 className="font-display text-3xl font-bold text-white tracking-wide mb-5">
        PAUSED
      </h2>

      <div className="grid grid-cols-3 gap-2.5 mb-6">
        <div className="rounded-lg p-2.5 border border-slate-700/80 bg-slate-900/75 text-center">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Score</div>
          <div className="font-mono-num text-base font-bold text-white mt-0.5">
            {hud.score.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg p-2.5 border border-slate-700/80 bg-slate-900/75 text-center">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Distance</div>
          <div className="font-mono-num text-base font-bold text-cyan-300 mt-0.5">
            {hud.distance}m
          </div>
        </div>
        <div className="rounded-lg p-2.5 border border-slate-700/80 bg-slate-900/75 text-center">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Coins</div>
          <div className="font-mono-num text-base font-bold text-amber-300 mt-0.5">
            {hud.coins}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onResume}
          className="h-12 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Play className="w-4 h-4 fill-slate-950" />
          Resume
        </button>

        <button
          type="button"
          onClick={onRestart}
          className="h-11 rounded-lg border border-cyan-400/40 hover:border-cyan-300 bg-slate-900/80 text-white font-display font-semibold uppercase tracking-wider text-sm flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-cyan-300" />
          Restart Run
        </button>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="h-11 rounded-lg border border-slate-600 hover:border-slate-400 bg-slate-900/80 text-slate-200 font-display font-semibold uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>

          <button
            type="button"
            onClick={onMainMenu}
            className="h-11 rounded-lg border border-pink-500/40 hover:border-pink-400 bg-slate-900/80 text-slate-200 font-display font-semibold uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Home className="w-4 h-4 text-pink-400" />
            Main Menu
          </button>
        </div>
      </div>
    </div>
  </div>
);

interface GameOverModalProps {
  summary: RunSummary;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  summary,
  onPlayAgain,
  onMainMenu,
}) => (
  <div
    className="fixed inset-0 z-30 flex items-center justify-center p-4"
    style={{ backgroundColor: 'rgba(4, 7, 18, 0.72)' }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game Over"
      className="panel-surface w-full max-w-md rounded-xl p-6"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold tracking-widest text-pink-400 uppercase">
          Run Terminated · {summary.tierLabel}
        </span>
        {summary.isNewBest && (
          <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-400/60 text-amber-300 text-[11px] font-bold tracking-wider uppercase">
            New Best!
          </span>
        )}
      </div>

      <h2 className="font-display text-3xl font-bold text-white tracking-wide mb-5">
        GAME OVER
      </h2>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-lg p-3.5 border border-cyan-400/30 bg-slate-900/80">
          <div className="text-[11px] uppercase tracking-wider text-cyan-300">Final Score</div>
          <div
            data-testid="gameover-score"
            className="font-mono-num text-2xl font-bold text-white mt-0.5"
          >
            {summary.score.toLocaleString()}
          </div>
        </div>

        <div className="rounded-lg p-3.5 border border-slate-700 bg-slate-900/80">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <TrophySvgIcon className="w-3.5 h-3.5" />
            Best Score
          </div>
          <div
            data-testid="gameover-best"
            className="font-mono-num text-2xl font-bold text-cyan-300 mt-0.5"
          >
            {summary.bestScore.toLocaleString()}
          </div>
        </div>

        <div className="rounded-lg p-3.5 border border-slate-700 bg-slate-900/80">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Total Distance</div>
          <div
            data-testid="gameover-distance"
            className="font-mono-num text-xl font-bold text-white mt-0.5"
          >
            {summary.distance.toLocaleString()} m
          </div>
        </div>

        <div className="rounded-lg p-3.5 border border-amber-400/30 bg-slate-900/80">
          <div className="text-[11px] uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
            <CoinSvgIcon className="w-3.5 h-3.5" />
            Coins Collected
          </div>
          <div
            data-testid="gameover-coins"
            className="font-mono-num text-xl font-bold text-amber-300 mt-0.5"
          >
            +{summary.coins}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          data-start="true"
          onClick={onPlayAgain}
          className="h-13 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-lg uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(34,230,255,0.4)] transition cursor-pointer"
        >
          <RotateCcw className="w-5 h-5" />
          Play Again
        </button>

        <button
          type="button"
          onClick={onMainMenu}
          className="h-11 rounded-lg border border-slate-600 hover:border-slate-400 bg-slate-900/80 text-slate-200 font-display font-semibold uppercase tracking-wider text-sm flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Home className="w-4 h-4" />
          Main Menu
        </button>
      </div>
    </div>
  </div>
);

interface SkinsModalProps {
  progress: PersistedProgress;
  onSelectOrUnlock: (skinId: SkinId) => void;
  onClose: () => void;
}

export const SkinsModal: React.FC<SkinsModalProps> = ({
  progress,
  onSelectOrUnlock,
  onClose,
}) => (
  <div
    className="fixed inset-0 z-40 flex items-center justify-center p-4"
    style={{ backgroundColor: 'rgba(4, 7, 18, 0.76)' }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Character Skins"
      className="panel-surface w-full max-w-lg rounded-xl p-6 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-semibold tracking-widest text-cyan-300 uppercase">
            Runner Hangar
          </div>
          <h2 className="font-display text-2xl font-bold text-white tracking-wide">
            CHARACTER SKINS
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400/35 bg-slate-900/80">
            <CoinSvgIcon className="w-4 h-4" />
            <span className="font-mono-num text-sm font-bold text-amber-300">
              {progress.totalCoins}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close Skins"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-slate-700 hover:border-slate-500 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {CHARACTER_SKINS.map((skin) => {
          const unlocked = progress.unlockedSkins.includes(skin.id);
          const selected = progress.selectedSkin === skin.id;
          const canAfford = progress.totalCoins >= skin.cost;

          return (
            <div
              key={skin.id}
              className={`rounded-xl p-3.5 border flex items-center justify-between gap-3 transition ${
                selected
                  ? 'border-cyan-400 bg-cyan-950/35'
                  : 'border-slate-700/80 bg-slate-900/75'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className="w-11 h-11 rounded-lg border border-white/20 shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: skin.primaryHex }}
                >
                  <div
                    className="w-5 h-5 rounded-sm"
                    style={{
                      backgroundColor: skin.accentHex,
                      boxShadow: `0 0 10px ${skin.accentHex}`,
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-white text-base tracking-wide">
                    {skin.name}
                  </div>
                  <div className="text-xs text-slate-400 truncate">{skin.tagline}</div>
                </div>
              </div>

              {selected ? (
                <span className="px-3 py-2 rounded-lg bg-cyan-400/20 border border-cyan-400/50 text-cyan-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                  Equipped
                </span>
              ) : unlocked ? (
                <button
                  type="button"
                  onClick={() => onSelectOrUnlock(skin.id)}
                  className="px-4 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-xs uppercase tracking-wider shrink-0 cursor-pointer"
                >
                  Equip
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canAfford}
                  onClick={() => onSelectOrUnlock(skin.id)}
                  className={`px-3.5 py-2 rounded-lg font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition ${
                    canAfford
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  {skin.cost} Coins
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

interface SettingsModalProps {
  settings: GameSettings;
  onUpdateSettings: (next: GameSettings) => void;
  onResetBest: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onResetBest,
  onClose,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(4, 7, 18, 0.76)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Game Settings"
        className="panel-surface w-full max-w-md rounded-xl p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xs font-semibold tracking-widest text-pink-400 uppercase">
              System Configuration
            </div>
            <h2 className="font-display text-2xl font-bold text-white tracking-wide">
              SETTINGS
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close Settings"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-slate-700 hover:border-slate-500 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Master Mute */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Master Audio</span>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, muted: !settings.muted })}
              className={`px-3.5 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer ${
                settings.muted
                  ? 'border-pink-500/50 bg-pink-950/40 text-pink-300'
                  : 'border-cyan-400/50 bg-cyan-950/40 text-cyan-200'
              }`}
            >
              {settings.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {settings.muted ? 'Muted' : 'Active'}
            </button>
          </div>

          {/* Music Volume */}
          <label className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Music Volume</span>
              <span className="font-mono-num">{Math.round(settings.musicVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.musicVolume * 100)}
              onChange={(e) =>
                onUpdateSettings({ ...settings, musicVolume: Number(e.target.value) / 100 })
              }
              className="accent-cyan-400 cursor-pointer"
            />
          </label>

          {/* SFX Volume */}
          <label className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-slate-300">
              <span>SFX Volume</span>
              <span className="font-mono-num">{Math.round(settings.sfxVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.sfxVolume * 100)}
              onChange={(e) =>
                onUpdateSettings({ ...settings, sfxVolume: Number(e.target.value) / 100 })
              }
              className="accent-pink-400 cursor-pointer"
            />
          </label>

          {/* Camera Shake */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Camera Shake</span>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ ...settings, cameraShake: !settings.cameraShake })
              }
              className={`px-3.5 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider cursor-pointer ${
                settings.cameraShake
                  ? 'border-cyan-400/50 bg-cyan-950/40 text-cyan-200'
                  : 'border-slate-700 bg-slate-900 text-slate-400'
              }`}
            >
              {settings.cameraShake ? 'Enabled' : 'Off'}
            </button>
          </div>

          {/* Touch Sensitivity */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Swipe Sensitivity</span>
            <div className="flex gap-1.5">
              {(['normal', 'high'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, touchSensitivity: mode })}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider cursor-pointer ${
                    settings.touchSensitivity === mode
                      ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Reset Best Score */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">Reset Saved Best Score</span>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-3 py-1.5 rounded-lg border border-pink-500/40 text-pink-300 hover:bg-pink-950/40 text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                Reset
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetBest();
                    setConfirmReset(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-pink-500 text-white text-xs font-bold uppercase cursor-pointer"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
