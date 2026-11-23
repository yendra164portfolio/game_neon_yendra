export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type LaneIndex = -1 | 0 | 1;

export type ObstacleKind = 'barrier' | 'laser_gate' | 'monolith' | 'drone';

export type SkinId = 'volt' | 'crimson' | 'solar' | 'phantom';

export interface CharacterSkin {
  id: SkinId;
  name: string;
  tagline: string;
  cost: number;
  primaryHex: string;
  accentHex: string;
  visorHex: string;
  metalness: number;
  roughness: number;
}

export interface GameSettings {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  cameraShake: boolean;
  touchSensitivity: 'normal' | 'high';
}

export interface PersistedProgress {
  bestScore: number;
  totalCoins: number;
  unlockedSkins: SkinId[];
  selectedSkin: SkinId;
  settings: GameSettings;
}

export interface HudSnapshot {
  score: number;
  distance: number;
  coins: number;
  speed: number;
  tierLabel: string;
  tierLevel: number;
  bestScore: number;
  combo: number;
}

export interface RunSummary {
  score: number;
  distance: number;
  coins: number;
  bestScore: number;
  isNewBest: boolean;
  tierLabel: string;
}

export interface PlayerSimState {
  targetLane: LaneIndex;
  x: number;
  y: number;
  vy: number;
  isGrounded: boolean;
  slideTimer: number;
  jumpBufferTimer: number;
  slideBufferTimer: number;
  coyoteTimer: number;
  squashX: number;
  squashY: number;
  leanAngle: number;
  runCycle: number;
}

export interface ObstacleBox {
  id: number;
  kind: ObstacleKind;
  lane: LaneIndex;
  baseLane: LaneIndex;
  x: number;
  z: number;
  width: number;
  minY: number;
  maxY: number;
  depth: number;
  oscillatePhase: number;
  oscillateSpeed: number;
  oscillateRange: number;
  active: boolean;
}

export interface CoinItem {
  id: number;
  lane: LaneIndex;
  x: number;
  y: number;
  z: number;
  collected: boolean;
  active: boolean;
}

export interface SpawnedObstacleSpec {
  kind: ObstacleKind;
  lane: LaneIndex;
  oscillateRange: number;
  oscillateSpeed: number;
  oscillatePhase: number;
}

export interface SpawnedCoinSpec {
  lane: LaneIndex;
  y: number;
  zOffset: number;
}

export interface RowPattern {
  obstacles: SpawnedObstacleSpec[];
  coins: SpawnedCoinSpec[];
}
