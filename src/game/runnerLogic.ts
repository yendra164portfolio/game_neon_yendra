import type {
  CharacterSkin,
  GameSettings,
  LaneIndex,
  ObstacleBox,
  ObstacleKind,
  PersistedProgress,
  PlayerSimState,
  RowPattern,
  SkinId,
  SpawnedCoinSpec,
  SpawnedObstacleSpec,
} from './types';

export const LANE_WIDTH = 2.45;
export const LANES: readonly LaneIndex[] = [-1, 0, 1] as const;

export const BASE_SPEED = 19;
export const MAX_SPEED = 45;
export const SPEED_ACCEL_PER_SEC = 0.42;

export const GRAVITY = 42;
export const JUMP_VELOCITY = 14.8;
export const FAST_FALL_VELOCITY = -24;
export const SLIDE_DURATION = 0.68;
export const INPUT_BUFFER_TIME = 0.13;
export const COYOTE_TIME = 0.09;

export const PLAYER_STAND_HEIGHT = 1.75;
export const PLAYER_SLIDE_HEIGHT = 0.82;
export const PLAYER_HALF_WIDTH = 0.36;
export const PLAYER_HALF_DEPTH = 0.36;

export const STORAGE_KEY = 'neon_rush_3d_save_v1';

export const CHARACTER_SKINS: readonly CharacterSkin[] = [
  {
    id: 'volt',
    name: 'VOLT-01',
    tagline: 'Cyan intercept rig with balanced aero vents',
    cost: 0,
    primaryHex: '#1a2744',
    accentHex: '#22e6ff',
    visorHex: '#6df5ff',
    metalness: 0.45,
    roughness: 0.38,
  },
  {
    id: 'crimson',
    name: 'BLAZE MK-II',
    tagline: 'Crimson assault armor with dual blade fins',
    cost: 50,
    primaryHex: '#2b1224',
    accentHex: '#ff2e7a',
    visorHex: '#ff70a6',
    metalness: 0.55,
    roughness: 0.32,
  },
  {
    id: 'solar',
    name: 'SOLAR APEX',
    tagline: 'Brushed gold alloy & cobalt arc reactor',
    cost: 120,
    primaryHex: '#e6ecf5',
    accentHex: '#ffbe2e',
    visorHex: '#38bdf8',
    metalness: 0.82,
    roughness: 0.22,
  },
  {
    id: 'phantom',
    name: 'PHANTOM VOID',
    tagline: 'Obsidian stealth carbon & emerald plasma trim',
    cost: 220,
    primaryHex: '#141724',
    accentHex: '#10f5a0',
    visorHex: '#7dffcd',
    metalness: 0.65,
    roughness: 0.28,
  },
] as const;

export const DEFAULT_SETTINGS: GameSettings = {
  muted: false,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  cameraShake: true,
  touchSensitivity: 'normal',
};

export const DEFAULT_PROGRESS: PersistedProgress = {
  bestScore: 0,
  totalCoins: 0,
  unlockedSkins: ['volt'],
  selectedSkin: 'volt',
  settings: { ...DEFAULT_SETTINGS },
};

export function createInitialPlayerState(): PlayerSimState {
  return {
    targetLane: 0,
    x: 0,
    y: 0,
    vy: 0,
    isGrounded: true,
    slideTimer: 0,
    jumpBufferTimer: 0,
    slideBufferTimer: 0,
    coyoteTimer: COYOTE_TIME,
    squashX: 1,
    squashY: 1,
    leanAngle: 0,
    runCycle: 0,
  };
}

export function laneToWorldX(lane: LaneIndex): number {
  return lane * LANE_WIDTH;
}

export function clampLane(lane: number): LaneIndex {
  if (lane <= -1) return -1;
  if (lane >= 1) return 1;
  return 0;
}

export function shiftLane(current: LaneIndex, delta: -1 | 1): LaneIndex {
  return clampLane(current + delta);
}

export function getDifficultyTier(distance: number): {
  level: number;
  label: string;
  speedCap: number;
  minRowSpacing: number;
} {
  if (distance < 220) {
    return { level: 1, label: 'CRUISE', speedCap: 25, minRowSpacing: 26 };
  }
  if (distance < 550) {
    return { level: 2, label: 'OVERDRIVE', speedCap: 32, minRowSpacing: 23 };
  }
  if (distance < 1050) {
    return { level: 3, label: 'HYPERDRIVE', speedCap: 39, minRowSpacing: 21 };
  }
  return { level: 4, label: 'VELOCITY MAX', speedCap: MAX_SPEED, minRowSpacing: 19 };
}

export function computeTargetSpeed(elapsedRunTime: number, distance: number): number {
  const tier = getDifficultyTier(distance);
  const ramp = BASE_SPEED + elapsedRunTime * SPEED_ACCEL_PER_SEC + distance * 0.008;
  return Math.min(tier.speedCap, Math.min(MAX_SPEED, ramp));
}

export function calculateScore(distance: number, coins: number): number {
  return Math.floor(distance * 10) + coins * 50;
}

export function getPlayerBounds(player: PlayerSimState) {
  const height = player.slideTimer > 0 && player.isGrounded ? PLAYER_SLIDE_HEIGHT : PLAYER_STAND_HEIGHT;
  return {
    minX: player.x - PLAYER_HALF_WIDTH,
    maxX: player.x + PLAYER_HALF_WIDTH,
    minY: player.y + 0.05,
    maxY: player.y + height - 0.05,
    minZ: -PLAYER_HALF_DEPTH,
    maxZ: PLAYER_HALF_DEPTH,
  };
}

export function checkObstacleCollision(player: PlayerSimState, obstacle: ObstacleBox): boolean {
  if (!obstacle.active) return false;
  const p = getPlayerBounds(player);
  const halfW = obstacle.width * 0.5;
  const halfD = obstacle.depth * 0.5;
  const obsMinX = obstacle.x - halfW;
  const obsMaxX = obstacle.x + halfW;
  const obsMinZ = obstacle.z - halfD;
  const obsMaxZ = obstacle.z + halfD;

  const overlapX = p.maxX > obsMinX && p.minX < obsMaxX;
  const overlapY = p.maxY > obstacle.minY && p.minY < obstacle.maxY;
  const overlapZ = p.maxZ > obsMinZ && p.minZ < obsMaxZ;

  return overlapX && overlapY && overlapZ;
}

export function stepPlayerPhysics(
  player: PlayerSimState,
  dt: number,
  speed: number,
  actions: { jumpPressed?: boolean; slidePressed?: boolean },
): { jumped: boolean; landed: boolean; slid: boolean } {
  let jumped = false;
  let landed = false;
  let slid = false;

  if (actions.jumpPressed) {
    player.jumpBufferTimer = INPUT_BUFFER_TIME;
  } else {
    player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);
  }

  if (actions.slidePressed) {
    player.slideBufferTimer = INPUT_BUFFER_TIME;
  } else {
    player.slideBufferTimer = Math.max(0, player.slideBufferTimer - dt);
  }

  if (player.isGrounded) {
    player.coyoteTimer = COYOTE_TIME;
  } else {
    player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);
  }

  // Trigger buffered jump if grounded or within coyote time
  if (player.jumpBufferTimer > 0 && (player.isGrounded || player.coyoteTimer > 0)) {
    player.vy = JUMP_VELOCITY;
    player.isGrounded = false;
    player.coyoteTimer = 0;
    player.jumpBufferTimer = 0;
    player.slideTimer = 0;
    player.squashX = 0.84;
    player.squashY = 1.2;
    jumped = true;
  }

  // Trigger slide or fast-fall
  if (player.slideBufferTimer > 0) {
    if (player.isGrounded) {
      if (player.slideTimer <= 0.12) {
        slid = true;
      }
      player.slideTimer = SLIDE_DURATION;
      player.slideBufferTimer = 0;
      player.squashX = 1.18;
      player.squashY = 0.78;
    } else if (player.vy > FAST_FALL_VELOCITY) {
      player.vy = FAST_FALL_VELOCITY;
    }
  }

  if (player.slideTimer > 0) {
    player.slideTimer = Math.max(0, player.slideTimer - dt);
  }

  // Vertical integration
  if (!player.isGrounded) {
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) {
      player.y = 0;
      player.vy = 0;
      player.isGrounded = true;
      landed = true;
      player.squashX = 1.22;
      player.squashY = 0.78;
      if (player.slideBufferTimer > 0) {
        player.slideTimer = SLIDE_DURATION;
        player.slideBufferTimer = 0;
        slid = true;
      }
    }
  }

  // Smooth lateral lane interpolation + banking lean
  const targetX = laneToWorldX(player.targetLane);
  const prevX = player.x;
  const lateralAlpha = 1 - Math.exp(-15 * dt);
  player.x += (targetX - player.x) * lateralAlpha;
  const vx = (player.x - prevX) / Math.max(dt, 0.0001);
  const desiredLean = Math.max(-0.34, Math.min(0.34, -vx * 0.024));
  player.leanAngle += (desiredLean - player.leanAngle) * (1 - Math.exp(-14 * dt));

  // Squash & stretch recovery
  const squashAlpha = 1 - Math.exp(-12 * dt);
  player.squashX += (1 - player.squashX) * squashAlpha;
  player.squashY += (1 - player.squashY) * squashAlpha;

  // Distance-synced gait cycle
  if (player.isGrounded && player.slideTimer <= 0) {
    player.runCycle += speed * dt * 0.56;
  }

  return { jumped, landed, slid };
}

export function createObstacleBox(
  id: number,
  spec: SpawnedObstacleSpec,
  z: number,
): ObstacleBox {
  const x = laneToWorldX(spec.lane);
  switch (spec.kind) {
    case 'barrier':
      return {
        id,
        kind: spec.kind,
        lane: spec.lane,
        baseLane: spec.lane,
        x,
        z,
        width: 1.75,
        minY: 0,
        maxY: 1.08,
        depth: 0.72,
        oscillatePhase: spec.oscillatePhase,
        oscillateSpeed: spec.oscillateSpeed,
        oscillateRange: spec.oscillateRange,
        active: true,
      };
    case 'laser_gate':
      return {
        id,
        kind: spec.kind,
        lane: spec.lane,
        baseLane: spec.lane,
        x,
        z,
        width: 1.95,
        minY: 1.08, // Slide height is 0.82 -> passes safely underneath!
        maxY: 2.85,
        depth: 0.65,
        oscillatePhase: spec.oscillatePhase,
        oscillateSpeed: spec.oscillateSpeed,
        oscillateRange: spec.oscillateRange,
        active: true,
      };
    case 'monolith':
      return {
        id,
        kind: spec.kind,
        lane: spec.lane,
        baseLane: spec.lane,
        x,
        z,
        width: 1.85,
        minY: 0,
        maxY: 2.55,
        depth: 1.5,
        oscillatePhase: spec.oscillatePhase,
        oscillateSpeed: spec.oscillateSpeed,
        oscillateRange: spec.oscillateRange,
        active: true,
      };
    case 'drone':
      return {
        id,
        kind: spec.kind,
        lane: spec.lane,
        baseLane: spec.lane,
        x,
        z,
        width: 1.35,
        minY: 0.35,
        maxY: 1.75,
        depth: 1.1,
        oscillatePhase: spec.oscillatePhase,
        oscillateSpeed: spec.oscillateSpeed,
        oscillateRange: spec.oscillateRange,
        active: true,
      };
  }
}

export function generateRowPattern(distance: number, rng: () => number = Math.random): RowPattern {
  const tier = getDifficultyTier(distance);
  const obstacles: SpawnedObstacleSpec[] = [];
  const coins: SpawnedCoinSpec[] = [];

  const shuffledLanes: LaneIndex[] = [...LANES];
  for (let i = shuffledLanes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffledLanes[i];
    shuffledLanes[i] = shuffledLanes[j];
    shuffledLanes[j] = tmp;
  }

  // Decide how many lanes have obstacles:
  // Always keep at least 1 completely open lane OR passable jump/slide lane.
  // In tier 1, mostly 1-2 obstacles; in higher tiers, up to 2 full monoliths + 1 jumpable/slideable,
  // guaranteeing at least 1 passable lane!
  const allowDrone = distance >= 160;
  const maxBlocked = tier.level === 1 ? (rng() < 0.35 ? 2 : 1) : tier.level === 2 ? 2 : 3;

  const pickKind = (allowFullBlock: boolean): ObstacleKind => {
    const r = rng();
    if (allowDrone && r < 0.22) return 'drone';
    if (allowFullBlock && r < 0.56) return 'monolith';
    if (r < 0.78) return 'barrier';
    return 'laser_gate';
  };

  if (maxBlocked === 1) {
    const lane = shuffledLanes[0];
    const kind = pickKind(true);
    obstacles.push({
      kind,
      lane,
      oscillateRange: kind === 'drone' ? LANE_WIDTH * 0.85 : 0,
      oscillateSpeed: kind === 'drone' ? 2.1 + tier.level * 0.25 : 0,
      oscillatePhase: rng() * Math.PI * 2,
    });

    // Place coin line in an open lane or arc over barrier
    const coinLane = kind === 'barrier' && rng() < 0.5 ? lane : shuffledLanes[1];
    if (kind === 'barrier' && coinLane === lane) {
      coins.push(
        { lane, y: 1.45, zOffset: 2.2 },
        { lane, y: 2.1, zOffset: 0 },
        { lane, y: 1.45, zOffset: -2.2 },
      );
    } else {
      for (let k = -1; k <= 1; k++) {
        coins.push({ lane: coinLane, y: 0.78, zOffset: k * 2.4 });
      }
    }
  } else if (maxBlocked === 2) {
    const laneA = shuffledLanes[0];
    const laneB = shuffledLanes[1];
    const openLane = shuffledLanes[2];

    const kindA = pickKind(true);
    // Avoid spawning two oscillating drones side-by-side so openLane stays guaranteed clear
    const kindB = kindA === 'drone' ? (rng() < 0.5 ? 'barrier' : 'laser_gate') : pickKind(true);

    obstacles.push({
      kind: kindA,
      lane: laneA,
      oscillateRange: kindA === 'drone' ? LANE_WIDTH * 0.48 : 0,
      oscillateSpeed: kindA === 'drone' ? 2.2 : 0,
      oscillatePhase: rng() * Math.PI * 2,
    });
    obstacles.push({
      kind: kindB,
      lane: laneB,
      oscillateRange: 0,
      oscillateSpeed: 0,
      oscillatePhase: 0,
    });

    // Safe coins in open lane (unless drone oscillates close, still safe within lane center)
    for (let k = -1; k <= 2; k++) {
      coins.push({ lane: openLane, y: 0.78, zOffset: k * 2.3 });
    }
  } else {
    // 3-lane formation: at least 2 lanes must be jumpable/slideable (never 3 monoliths!)
    const l0 = shuffledLanes[0];
    const l1 = shuffledLanes[1];
    const l2 = shuffledLanes[2];
    const k0: ObstacleKind = rng() < 0.5 ? 'monolith' : 'barrier';
    const k1: ObstacleKind = rng() < 0.5 ? 'barrier' : 'laser_gate';
    const k2: ObstacleKind = rng() < 0.5 ? 'laser_gate' : 'barrier';

    obstacles.push(
      { kind: k0, lane: l0, oscillateRange: 0, oscillateSpeed: 0, oscillatePhase: 0 },
      { kind: k1, lane: l1, oscillateRange: 0, oscillateSpeed: 0, oscillatePhase: 0 },
      { kind: k2, lane: l2, oscillateRange: 0, oscillateSpeed: 0, oscillatePhase: 0 },
    );

    if (k1 === 'barrier') {
      coins.push(
        { lane: l1, y: 1.55, zOffset: 2.0 },
        { lane: l1, y: 2.15, zOffset: 0 },
        { lane: l1, y: 1.55, zOffset: -2.0 },
      );
    } else {
      coins.push(
        { lane: l1, y: 0.55, zOffset: 2.0 },
        { lane: l1, y: 0.55, zOffset: 0 },
        { lane: l1, y: 0.55, zOffset: -2.0 },
      );
    }
  }

  return { obstacles, coins };
}

export function isRowPassable(row: RowPattern): boolean {
  // At least one lane must either have no monolith/drone OR be jumpable/slideable
  const blockedBySolidWall = new Set<LaneIndex>();
  for (const obs of row.obstacles) {
    if (obs.kind === 'monolith' || obs.kind === 'drone') {
      blockedBySolidWall.add(obs.lane);
    }
  }
  return blockedBySolidWall.size < 3;
}

export function getSkinById(id: SkinId): CharacterSkin {
  return CHARACTER_SKINS.find((s) => s.id === id) ?? CHARACTER_SKINS[0];
}

export function unlockOrSelectSkin(
  progress: PersistedProgress,
  skinId: SkinId,
): { next: PersistedProgress; action: 'selected' | 'unlocked' | 'insufficient' } {
  if (progress.unlockedSkins.includes(skinId)) {
    return {
      next: { ...progress, selectedSkin: skinId },
      action: 'selected',
    };
  }
  const skin = getSkinById(skinId);
  if (progress.totalCoins < skin.cost) {
    return { next: progress, action: 'insufficient' };
  }
  return {
    next: {
      ...progress,
      totalCoins: progress.totalCoins - skin.cost,
      unlockedSkins: [...progress.unlockedSkins, skinId],
      selectedSkin: skinId,
    },
    action: 'unlocked',
  };
}

export function loadProgress(): PersistedProgress {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_PROGRESS, settings: { ...DEFAULT_SETTINGS } };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS, settings: { ...DEFAULT_SETTINGS } };
    const parsed = JSON.parse(raw) as Partial<PersistedProgress>;
    const validSkinIds = new Set<SkinId>(CHARACTER_SKINS.map((s) => s.id));
    const unlocked: SkinId[] = Array.isArray(parsed.unlockedSkins)
      ? parsed.unlockedSkins.filter((s): s is SkinId => validSkinIds.has(s as SkinId))
      : ['volt'];
    if (!unlocked.includes('volt')) unlocked.unshift('volt');
    const selected =
      parsed.selectedSkin && unlocked.includes(parsed.selectedSkin)
        ? parsed.selectedSkin
        : 'volt';
    return {
      bestScore: typeof parsed.bestScore === 'number' && Number.isFinite(parsed.bestScore) ? Math.max(0, Math.floor(parsed.bestScore)) : 0,
      totalCoins: typeof parsed.totalCoins === 'number' && Number.isFinite(parsed.totalCoins) ? Math.max(0, Math.floor(parsed.totalCoins)) : 0,
      unlockedSkins: unlocked,
      selectedSkin: selected,
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_PROGRESS, settings: { ...DEFAULT_SETTINGS } };
  }
}

export function saveProgress(progress: PersistedProgress): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors
  }
}
