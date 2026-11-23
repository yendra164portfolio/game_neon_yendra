import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import {
  GameOverModal,
  PauseModal,
  SettingsModal,
  SkinsModal,
} from './components/GameModals';
import { TitleOverlay } from './components/TitleOverlay';
import { NeonAudioEngine } from './game/audio';
import { RunnerEngine } from './game/RunnerEngine';
import {
  BASE_SPEED,
  loadProgress,
  saveProgress,
  unlockOrSelectSkin,
} from './game/runnerLogic';
import type {
  GamePhase,
  GameSettings,
  HudSnapshot,
  PersistedProgress,
  RunSummary,
  SkinId,
} from './game/types';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RunnerEngine | null>(null);
  const audioRef = useRef<NeonAudioEngine | null>(null);

  const [progress, setProgress] = useState<PersistedProgress>(() => loadProgress());
  const progressRef = useRef<PersistedProgress>(progress);
  progressRef.current = progress;

  const [phase, setPhase] = useState<GamePhase>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'playing';
    }
    return 'title';
  });
  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;

  const [showSkins, setShowSkins] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [crashFlash, setCrashFlash] = useState(false);

  const [hud, setHud] = useState<HudSnapshot>(() => ({
    score: 0,
    distance: 0,
    coins: 0,
    speed: Math.round(BASE_SPEED * 3.6),
    tierLabel: 'CRUISE',
    tierLevel: 1,
    bestScore: progress.bestScore,
    combo: 0,
  }));

  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);

  // Sync game state to body attribute
  useEffect(() => {
    document.body.dataset.state = phase;
  }, [phase]);

  // Persist progress changes
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const startNewRun = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setShowSkins(false);
    setShowSettings(false);
    setRunSummary(null);
    setCrashFlash(false);
    setPhase('playing');
    document.body.dataset.state = 'playing';

    audioRef.current?.playUiClick();
    audioRef.current?.startMusic();
    engineRef.current?.startNewRun();
  }, []);

  const pauseRun = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    setPhase('paused');
    document.body.dataset.state = 'paused';
    audioRef.current?.stopMusic();
    audioRef.current?.playUiClick();
    engineRef.current?.setPhase('paused');
  }, []);

  const resumeRun = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    setShowSettings(false);
    setPhase('playing');
    document.body.dataset.state = 'playing';
    audioRef.current?.playUiClick();
    audioRef.current?.startMusic();
    engineRef.current?.setPhase('playing');
  }, []);

  const returnToTitle = useCallback(() => {
    setShowSettings(false);
    setShowSkins(false);
    setRunSummary(null);
    setPhase('title');
    document.body.dataset.state = 'title';
    audioRef.current?.stopMusic();
    audioRef.current?.playUiClick();
    engineRef.current?.setPhase('title');
  }, []);

  const updateSettings = useCallback((next: GameSettings) => {
    setProgress((prev) => ({ ...prev, settings: next }));
    audioRef.current?.updateSettings(next);
    engineRef.current?.setSettings(next);
  }, []);

  const toggleMute = useCallback(() => {
    const cur = progressRef.current.settings;
    updateSettings({ ...cur, muted: !cur.muted });
  }, [updateSettings]);

  const handleSelectOrUnlockSkin = useCallback((skinId: SkinId) => {
    const result = unlockOrSelectSkin(progressRef.current, skinId);
    if (result.action === 'insufficient') return;
    setProgress(result.next);
    engineRef.current?.setSkin(skinId);
    if (result.action === 'unlocked') {
      audioRef.current?.playUnlock();
    } else {
      audioRef.current?.playUiClick();
    }
  }, []);

  const handleResetBest = useCallback(() => {
    setProgress((prev) => ({ ...prev, bestScore: 0 }));
    engineRef.current?.setBestScore(0);
    audioRef.current?.playUiClick();
  }, []);

  // Mount Three.js engine once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new NeonAudioEngine(progressRef.current.settings);
    audioRef.current = audio;

    const engine = new RunnerEngine(
      container,
      audio,
      progressRef.current.selectedSkin,
      progressRef.current.settings,
      progressRef.current.bestScore,
      {
        onHudUpdate: (snapshot) => {
          setHud(snapshot);
        },
        onGameOver: (summary) => {
          setCrashFlash(true);
          setTimeout(() => setCrashFlash(false), 380);
          setRunSummary(summary);
          setPhase('gameover');
          document.body.dataset.state = 'gameover';
          setProgress((prev) => ({
            ...prev,
            bestScore: Math.max(prev.bestScore, summary.bestScore),
            totalCoins: prev.totalCoins + summary.coins,
          }));
        },
      },
    );
    engineRef.current = engine;

    if (phaseRef.current === 'playing') {
      engine.startNewRun();
    }

    return () => {
      engine.dispose();
      audio.dispose();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  // Global keyboard shortcuts (Title Start, Pause, Mute, Restart)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'KeyM') {
        toggleMute();
        return;
      }

      if (phaseRef.current === 'title' && !showSkins && !showSettings) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startNewRun();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        if (showSkins) {
          setShowSkins(false);
          return;
        }
        if (phaseRef.current === 'playing') {
          e.preventDefault();
          pauseRun();
        } else if (phaseRef.current === 'paused') {
          e.preventDefault();
          resumeRun();
        }
        return;
      }

      if (e.code === 'KeyR' && (phaseRef.current === 'paused' || phaseRef.current === 'gameover')) {
        e.preventDefault();
        startNewRun();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pauseRun, resumeRun, showSettings, showSkins, startNewRun, toggleMute]);

  return (
    <main className="relative w-full h-full overflow-hidden select-none">
      {/* Isolated WebGL Canvas Container */}
      <div
        ref={mountRef}
        data-testid="game-viewport"
        className="fixed inset-0 w-full h-full"
      />

      {/* Brief Collision Impact Vignette */}
      {crashFlash && (
        <div
          className="fixed inset-0 pointer-events-none z-25 animate-damage-flash"
          style={{
            background:
              'radial-gradient(circle at center, transparent 42%, rgba(255, 36, 96, 0.52) 100%)',
          }}
        />
      )}

      {/* Title Screen */}
      {phase === 'title' && (
        <TitleOverlay
          progress={progress}
          onStart={startNewRun}
          onOpenSkins={() => {
            audioRef.current?.playUiClick();
            setShowSkins(true);
          }}
          onOpenSettings={() => {
            audioRef.current?.playUiClick();
            setShowSettings(true);
          }}
          onToggleMute={toggleMute}
        />
      )}

      {/* Active Gameplay HUD */}
      {phase === 'playing' && (
        <GameHud
          hud={hud}
          muted={progress.settings.muted}
          onToggleMute={toggleMute}
          onPause={pauseRun}
        />
      )}

      {/* Pause Modal */}
      {phase === 'paused' && !showSettings && (
        <PauseModal
          hud={hud}
          onResume={resumeRun}
          onRestart={startNewRun}
          onOpenSettings={() => {
            audioRef.current?.playUiClick();
            setShowSettings(true);
          }}
          onMainMenu={returnToTitle}
        />
      )}

      {/* Game Over Modal */}
      {phase === 'gameover' && runSummary && (
        <GameOverModal
          summary={runSummary}
          onPlayAgain={startNewRun}
          onMainMenu={returnToTitle}
        />
      )}

      {/* Character Skins Garage */}
      {showSkins && (
        <SkinsModal
          progress={progress}
          onSelectOrUnlock={handleSelectOrUnlockSkin}
          onClose={() => {
            audioRef.current?.playUiClick();
            setShowSkins(false);
          }}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={progress.settings}
          onUpdateSettings={updateSettings}
          onResetBest={handleResetBest}
          onClose={() => {
            audioRef.current?.playUiClick();
            setShowSettings(false);
          }}
        />
      )}
    </main>
  );
}
