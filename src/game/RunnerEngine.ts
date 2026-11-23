import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { NeonAudioEngine } from './audio';
import {
  createCoinMesh,
  createObstacleMesh,
  createProceduralTextures,
  createRoadSegment,
  createRunnerRig,
  type ProceduralTextureSet,
  type RunnerRig,
} from './proceduralAssets';
import {
  BASE_SPEED,
  calculateScore,
  checkObstacleCollision,
  computeTargetSpeed,
  createInitialPlayerState,
  createObstacleBox,
  generateRowPattern,
  getDifficultyTier,
  getSkinById,
  laneToWorldX,
  shiftLane,
  stepPlayerPhysics,
} from './runnerLogic';
import type {
  CoinItem,
  GamePhase,
  GameSettings,
  HudSnapshot,
  ObstacleBox,
  ObstacleKind,
  PlayerSimState,
  RunSummary,
  SkinId,
} from './types';

// Pre-allocated scratch math objects (Zero-GC render loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scaleVec = new THREE.Vector3();
const _color = new THREE.Color();

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

interface ActiveObstacleEntry {
  box: ObstacleBox;
  mesh: THREE.Group;
}

interface ActiveCoinEntry {
  item: CoinItem;
  mesh: THREE.Group;
}

export interface RunnerEngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onGameOver: (summary: RunSummary) => void;
}

const SEGMENT_LENGTH = 18;
const SEGMENT_COUNT = 10;
const PARTICLE_POOL_SIZE = 96;

export class RunnerEngine {
  private container: HTMLElement;
  private audio: NeonAudioEngine;
  private callbacks: RunnerEngineCallbacks;

  private isSoftwareGl = false;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private keyLight!: THREE.DirectionalLight;
  private textures!: ProceduralTextureSet;
  private runnerRig!: RunnerRig;

  private segments: THREE.Group[] = [];
  private obstaclePool: Record<ObstacleKind, THREE.Group[]> = {
    barrier: [],
    laser_gate: [],
    monolith: [],
    drone: [],
  };
  private coinMeshPool: THREE.Group[] = [];
  private activeObstacles: ActiveObstacleEntry[] = [];
  private activeCoins: ActiveCoinEntry[] = [];

  private particleMesh!: THREE.InstancedMesh;
  private particles: PooledParticle[] = [];
  private particleCursor = 0;

  private phase: GamePhase = 'title';
  private settings: GameSettings;
  private bestScore = 0;

  private player: PlayerSimState = createInitialPlayerState();
  private speed = BASE_SPEED;
  private distance = 0;
  private coinsThisRun = 0;
  private combo = 0;
  private comboTimer = 0;
  private elapsedRunTime = 0;
  private titleClock = 0;

  private nextSpawnZ = -44;
  private nextEntityId = 1;

  private trauma = 0;
  private hitstopTimer = 0;
  private crashDelayTimer = -1;
  private pendingSummary: RunSummary | null = null;
  private runnerTumble = 0;

  // Camera state
  private camPos = new THREE.Vector3(2.1, 2.3, 4.6);
  private camLook = new THREE.Vector3(-0.9, 1.35, -3.5);

  // Edge-triggered inputs
  private keysDown = new Set<string>();
  private queuedLaneDelta = 0;
  private queuedJump = false;
  private queuedSlide = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchActive = false;

  private frameId = 0;
  private disposed = false;
  private lastTimestamp = 0;
  private hudEmitAccum = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    container: HTMLElement,
    audio: NeonAudioEngine,
    initialSkin: SkinId,
    initialSettings: GameSettings,
    initialBestScore: number,
    callbacks: RunnerEngineCallbacks,
  ) {
    this.container = container;
    this.audio = audio;
    this.settings = { ...initialSettings };
    this.bestScore = initialBestScore;
    this.callbacks = callbacks;

    this.initThree(initialSkin);
    this.bindEvents();
    this.lastTimestamp = performance.now();
    this.scheduleNextTick();
  }

  private detectSoftwareGl(): boolean {
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private initThree(initialSkin: SkinId): void {
    this.isSoftwareGl = this.detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const bgHex = 0x070b1a;
    this.scene.background = new THREE.Color(bgHex);
    this.scene.fog = new THREE.FogExp2(bgHex, 0.0115);

    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 220);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // Mandatory Studio Environment Map
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;
    pmremGenerator.dispose();

    // Warm/cool 3-point lighting rig (1 shadow caster)
    const hemi = new THREE.HemisphereLight(0x52c7ff, 0x1a0b2e, 0.85);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff1dc, 2.1);
    this.keyLight.position.set(12, 22, 14);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 70;
    const d = 18;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const rimLight = new THREE.DirectionalLight(0xff3898, 0.95);
    rimLight.position.set(-10, 8, -16);
    this.scene.add(rimLight);

    // Horizon Neon Sun / Cyber Moon Disc
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(24, 36),
      new THREE.MeshBasicMaterial({
        color: 0xff3b9a,
        transparent: true,
        opacity: 0.24,
        fog: false,
      }),
    );
    sunDisc.position.set(0, 14, -155);
    this.scene.add(sunDisc);

    // Procedural Textures
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    // Road Segments Pool
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = createRoadSegment(SEGMENT_LENGTH, this.textures, i);
      seg.position.z = -i * SEGMENT_LENGTH;
      this.scene.add(seg);
      this.segments.push(seg);
    }

    // Player Rig
    this.runnerRig = createRunnerRig(getSkinById(initialSkin), this.textures.contactShadow);
    this.scene.add(this.runnerRig.root);

    // Pre-allocate Obstacle & Coin Pools
    (['barrier', 'laser_gate', 'monolith', 'drone'] as ObstacleKind[]).forEach((kind) => {
      for (let i = 0; i < 8; i++) {
        const mesh = createObstacleMesh(kind, this.textures);
        mesh.visible = false;
        this.scene.add(mesh);
        this.obstaclePool[kind].push(mesh);
      }
    });

    for (let i = 0; i < 36; i++) {
      const coin = createCoinMesh(this.textures.contactShadow);
      coin.visible = false;
      this.scene.add(coin);
      this.coinMeshPool.push(coin);
    }

    // Pooled Zero-GC Particle InstancedMesh
    const pGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_POOL_SIZE);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0,
        r: 1,
        g: 1,
        b: 1,
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setRGB(1, 1, 1));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleBlur = (): void => {
    this.keysDown.clear();
  };

  private handleVisibility = (): void => {
    if (document.hidden) {
      this.keysDown.clear();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.phase !== 'playing' || this.crashDelayTimer >= 0) return;
    const code = e.code;
    if (
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'Space'
    ) {
      e.preventDefault();
    }
    if (this.keysDown.has(code)) return;
    this.keysDown.add(code);

    if (code === 'ArrowLeft' || code === 'KeyA') {
      this.queuedLaneDelta = -1;
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      this.queuedLaneDelta = 1;
    } else if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') {
      this.queuedJump = true;
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.queuedSlide = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private handleTouchStart = (e: TouchEvent): void => {
    if (this.phase !== 'playing') return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchActive = true;
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (this.phase !== 'playing' || !this.touchActive) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;

    const threshold = this.settings.touchSensitivity === 'high' ? 22 : 34;
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    this.touchActive = false;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.queuedLaneDelta = dx > 0 ? 1 : -1;
    } else if (dy < 0) {
      this.queuedJump = true;
    } else {
      this.queuedSlide = true;
    }
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    if (this.phase !== 'playing') return;
    e.preventDefault();
    this.touchActive = false;
  };

  public setSkin(skinId: SkinId): void {
    this.runnerRig.applySkin(getSkinById(skinId));
  }

  public setSettings(next: GameSettings): void {
    this.settings = { ...next };
  }

  public setBestScore(best: number): void {
    this.bestScore = best;
  }

  public startNewRun(): void {
    this.clearWorldEntities();
    this.player = createInitialPlayerState();
    this.speed = BASE_SPEED;
    this.distance = 0;
    this.coinsThisRun = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.elapsedRunTime = 0;
    this.nextSpawnZ = -28;
    this.trauma = 0;
    this.hitstopTimer = 0;
    this.crashDelayTimer = -1;
    this.pendingSummary = null;
    this.runnerTumble = 0;

    this.keysDown.clear();
    this.queuedLaneDelta = 0;
    this.queuedJump = false;
    this.queuedSlide = false;

    this.phase = 'playing';
    this.emitHud();
  }

  public setPhase(nextPhase: GamePhase): void {
    this.phase = nextPhase;
    if (nextPhase === 'title') {
      this.clearWorldEntities();
      this.player = createInitialPlayerState();
      this.runnerTumble = 0;
      this.crashDelayTimer = -1;
      this.hitstopTimer = 0;
    }
  }

  private clearWorldEntities(): void {
    for (const entry of this.activeObstacles) {
      entry.mesh.visible = false;
      this.obstaclePool[entry.box.kind].push(entry.mesh);
    }
    this.activeObstacles.length = 0;

    for (const entry of this.activeCoins) {
      entry.mesh.visible = false;
      this.coinMeshPool.push(entry.mesh);
    }
    this.activeCoins.length = 0;
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    speedScale: number,
  ): void {
    _color.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
      const angle = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.15) * 1.6;
      const spd = (2.5 + Math.random() * 5.5) * speedScale;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.abs(Math.sin(elev)) * spd + 1.5;
      p.vz = Math.sin(angle) * spd;
      p.life = 0;
      p.maxLife = 0.28 + Math.random() * 0.28;
      p.size = 0.7 + Math.random() * 0.85;
      p.r = _color.r;
      p.g = _color.g;
      p.b = _color.b;
    }
  }

  private spawnRow(zPos: number): void {
    const pattern = generateRowPattern(this.distance);

    for (const obsSpec of pattern.obstacles) {
      const pool = this.obstaclePool[obsSpec.kind];
      const mesh = pool.pop() ?? createObstacleMesh(obsSpec.kind, this.textures);
      if (!mesh.parent) this.scene.add(mesh);
      const box = createObstacleBox(this.nextEntityId++, obsSpec, zPos);
      mesh.position.set(box.x, 0, box.z);
      mesh.visible = true;
      this.activeObstacles.push({ box, mesh });
    }

    for (const coinSpec of pattern.coins) {
      const mesh = this.coinMeshPool.pop() ?? createCoinMesh(this.textures.contactShadow);
      if (!mesh.parent) this.scene.add(mesh);
      const item: CoinItem = {
        id: this.nextEntityId++,
        lane: coinSpec.lane,
        x: laneToWorldX(coinSpec.lane),
        y: coinSpec.y,
        z: zPos + coinSpec.zOffset,
        collected: false,
        active: true,
      };
      mesh.position.set(item.x, item.y, item.z);
      mesh.scale.setScalar(1);
      mesh.visible = true;
      const sh = mesh.getObjectByName('coin-shadow');
      if (sh) sh.position.y = -item.y + 0.025;
      this.activeCoins.push({ item, mesh });
    }
  }

  private emitHud(): void {
    const tier = getDifficultyTier(this.distance);
    const score = calculateScore(this.distance, this.coinsThisRun);
    this.callbacks.onHudUpdate({
      score,
      distance: Math.floor(this.distance),
      coins: this.coinsThisRun,
      speed: Math.round(this.speed * 3.6),
      tierLabel: tier.label,
      tierLevel: tier.level,
      bestScore: Math.max(this.bestScore, score),
      combo: this.combo,
    });
  }

  private updateParticles(dt: number): void {
    let anyUpdated = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyUpdated = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.35;
      }
      const t = 1 - p.life / p.maxLife;
      const s = p.size * t;
      _vec3A.set(p.x, p.y, p.z);
      _euler.set(p.life * 6, p.life * 8, 0);
      _quat.setFromEuler(_euler);
      _scaleVec.set(s, s, s);
      _mat4.compose(_vec3A, _quat, _scaleVec);
      this.particleMesh.setMatrixAt(i, _mat4);
      _color.setRGB(p.r, p.g, p.b);
      this.particleMesh.setColorAt(i, _color);
    }
    if (anyUpdated) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private animateRunnerRig(dt: number, isTitleMode: boolean): void {
    const p = this.player;
    this.runnerRig.root.position.set(p.x, p.y, 0);
    this.runnerRig.bodyPivot.scale.set(p.squashX, p.squashY, p.squashX);

    // Contact shadow stays on ground y=0.02 and shrinks slightly with jump height
    const shadowScale = Math.max(0.45, 1 - p.y * 0.22);
    this.runnerRig.contactShadow.position.y = -p.y + 0.02;
    this.runnerRig.contactShadow.scale.setScalar(shadowScale);

    if (this.crashDelayTimer >= 0) {
      // Dramatic crash tumble
      this.runnerTumble += dt * 7;
      this.runnerRig.bodyPivot.rotation.set(-0.65, this.runnerTumble * 0.3, 0.45);
      this.runnerRig.bodyPivot.position.y = -0.35;
      return;
    }

    if (isTitleMode) {
      // Confident brisk cyber-jog on the title showcase
      const cycle = this.titleClock * 7.5;
      this.runnerRig.bodyPivot.position.y = Math.abs(Math.sin(cycle)) * 0.06;
      this.runnerRig.bodyPivot.rotation.set(0.12, 0.28, 0);
      this.runnerRig.torso.rotation.x = 0.08;
      this.runnerRig.leftLegPivot.rotation.x = Math.sin(cycle) * 0.65;
      this.runnerRig.rightLegPivot.rotation.x = -Math.sin(cycle) * 0.65;
      this.runnerRig.leftArmPivot.rotation.x = -Math.sin(cycle) * 0.6;
      this.runnerRig.rightArmPivot.rotation.x = Math.sin(cycle) * 0.6;
      return;
    }

    if (p.slideTimer > 0 && p.isGrounded) {
      // Low aerodynamic backward-lean power slide (head & torso stay cleanly above road)
      this.runnerRig.bodyPivot.position.y = 0.28;
      this.runnerRig.bodyPivot.rotation.set(-1.08, p.leanAngle * 0.4, p.leanAngle);
      this.runnerRig.torso.rotation.x = 0.22;
      this.runnerRig.leftLegPivot.rotation.x = 0.18;
      this.runnerRig.rightLegPivot.rotation.x = -0.35;
      this.runnerRig.leftArmPivot.rotation.x = 0.72;
      this.runnerRig.rightArmPivot.rotation.x = 0.72;
    } else if (!p.isGrounded) {
      // Mid-air heroic leap pose
      this.runnerRig.bodyPivot.position.y = 0;
      this.runnerRig.bodyPivot.rotation.set(0.12 - p.vy * 0.015, 0, p.leanAngle);
      this.runnerRig.torso.rotation.x = 0.18;
      this.runnerRig.leftLegPivot.rotation.x = 0.55;
      this.runnerRig.rightLegPivot.rotation.x = -0.45;
      this.runnerRig.leftArmPivot.rotation.x = -0.75;
      this.runnerRig.rightArmPivot.rotation.x = 0.45;
    } else {
      // Sprint gait synced to distance traveled
      const s = Math.sin(p.runCycle);
      this.runnerRig.bodyPivot.position.y = Math.abs(s) * 0.08;
      this.runnerRig.bodyPivot.rotation.set(0.18, 0, p.leanAngle);
      this.runnerRig.torso.rotation.x = 0.12;
      this.runnerRig.leftLegPivot.rotation.x = s * 0.92;
      this.runnerRig.rightLegPivot.rotation.x = -s * 0.92;
      this.runnerRig.leftArmPivot.rotation.x = -s * 0.85;
      this.runnerRig.rightArmPivot.rotation.x = s * 0.85;
    }
  }

  private scrollHighway(moveZ: number): void {
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      seg.position.z += moveZ;
      if (seg.position.z > SEGMENT_LENGTH * 1.5) {
        seg.position.z -= SEGMENT_COUNT * SEGMENT_LENGTH;
      }
    }
  }

  private stepSimulation(rawDt: number): void {
    const dt = Math.min(rawDt, 0.05);
    this.titleClock += dt;

    // Hitstop freeze (rendering + particles + camera shake continue ticking)
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateParticles(dt);
      this.updateCamera(dt);
      return;
    }

    if (this.phase === 'title') {
      // Live scenic city fly-by behind title menu
      this.scrollHighway(11 * dt);
      this.animateRunnerRig(dt, true);
      this.updateParticles(dt);
      this.updateCamera(dt);
      return;
    }

    if (this.phase === 'paused' || this.phase === 'gameover') {
      this.updateParticles(dt);
      this.updateCamera(dt);
      return;
    }

    // Brief defeat beat after collision before Game Over modal opens
    if (this.crashDelayTimer >= 0) {
      this.crashDelayTimer -= dt;
      this.animateRunnerRig(dt, false);
      this.updateParticles(dt);
      this.updateCamera(dt);
      if (this.crashDelayTimer <= 0 && this.pendingSummary) {
        const summary = this.pendingSummary;
        this.pendingSummary = null;
        this.phase = 'gameover';
        this.callbacks.onGameOver(summary);
      }
      return;
    }

    // Active Playing Loop
    this.elapsedRunTime += dt;
    const targetSpeed = computeTargetSpeed(this.elapsedRunTime, this.distance);
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-3 * dt));

    const moveZ = this.speed * dt;
    this.distance += moveZ;

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // Consume queued one-shot inputs
    if (this.queuedLaneDelta !== 0) {
      const nextLane = shiftLane(this.player.targetLane, this.queuedLaneDelta as -1 | 1);
      if (nextLane !== this.player.targetLane) {
        this.player.targetLane = nextLane;
        this.audio.playLaneShift();
        this.spawnParticles(this.player.x, this.player.y + 0.35, 0.1, 4, 0x22e6ff, 0.55);
      }
      this.queuedLaneDelta = 0;
    }

    const physEvents = stepPlayerPhysics(this.player, dt, this.speed, {
      jumpPressed: this.queuedJump,
      slidePressed: this.queuedSlide,
    });
    this.queuedJump = false;
    this.queuedSlide = false;

    if (physEvents.jumped) {
      this.audio.playJump();
      this.spawnParticles(this.player.x, 0.1, 0.15, 6, 0x38bdf8, 0.7);
    }
    if (physEvents.landed) {
      this.spawnParticles(this.player.x, 0.08, 0.1, 5, 0x7dd3fc, 0.5);
    }
    if (physEvents.slid) {
      this.audio.playSlide();
      this.spawnParticles(this.player.x, 0.15, 0.25, 6, 0xff4fa3, 0.65);
    }

    this.scrollHighway(moveZ);
    this.animateRunnerRig(dt, false);

    // Spawn ahead continuously
    this.nextSpawnZ += moveZ;
    const tier = getDifficultyTier(this.distance);
    while (this.nextSpawnZ > -115) {
      this.spawnRow(this.nextSpawnZ);
      this.nextSpawnZ -= tier.minRowSpacing + Math.random() * 8;
    }

    // Update obstacles & collision
    for (let i = this.activeObstacles.length - 1; i >= 0; i--) {
      const entry = this.activeObstacles[i];
      const box = entry.box;
      box.z += moveZ;

      if (box.oscillateRange > 0) {
        box.oscillatePhase += box.oscillateSpeed * dt;
        const baseX = laneToWorldX(box.baseLane);
        box.x = Math.max(
          -2.65,
          Math.min(2.65, baseX + Math.sin(box.oscillatePhase) * box.oscillateRange),
        );
      }
      entry.mesh.position.set(box.x, 0, box.z);

      if (box.kind === 'drone') {
        entry.mesh.children[0].rotation.y += dt * 4;
      }

      if (checkObstacleCollision(this.player, box)) {
        this.triggerCollision();
        break;
      }

      if (box.z > 14) {
        entry.mesh.visible = false;
        this.obstaclePool[box.kind].push(entry.mesh);
        this.activeObstacles.splice(i, 1);
      }
    }

    // Update coins & pickup
    for (let i = this.activeCoins.length - 1; i >= 0; i--) {
      const entry = this.activeCoins[i];
      const c = entry.item;
      c.z += moveZ;
      entry.mesh.position.set(
        c.x,
        c.y + Math.sin(this.titleClock * 4.5 + c.id) * 0.1,
        c.z,
      );
      entry.mesh.rotation.y += dt * 3.4;

      if (!c.collected) {
        const dx = Math.abs(this.player.x - c.x);
        const dy = Math.abs(this.player.y + 0.85 - c.y);
        const dz = Math.abs(c.z);
        if (dx < 0.88 && dy < 1.05 && dz < 0.95) {
          c.collected = true;
          this.coinsThisRun += 1;
          this.combo += 1;
          this.comboTimer = 1.6;
          this.audio.playCoin(this.combo);
          this.spawnParticles(c.x, c.y, c.z, 8, 0xffd33d, 0.85);
          entry.mesh.visible = false;
          this.coinMeshPool.push(entry.mesh);
          this.activeCoins.splice(i, 1);
          this.emitHud();
          continue;
        }
      }

      if (c.z > 12) {
        entry.mesh.visible = false;
        this.coinMeshPool.push(entry.mesh);
        this.activeCoins.splice(i, 1);
      }
    }

    this.updateParticles(dt);
    this.updateCamera(dt);

    // Throttle HUD React updates to ~12Hz for smooth 60fps Canvas
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.08) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private triggerCollision(): void {
    this.audio.stopMusic();
    this.audio.playCollision();
    this.hitstopTimer = 0.065;
    this.trauma = 0.85;
    this.crashDelayTimer = 0.44;
    this.spawnParticles(this.player.x, this.player.y + 0.9, 0, 26, 0xff3b7f, 1.45);

    const finalScore = calculateScore(this.distance, this.coinsThisRun);
    const tier = getDifficultyTier(this.distance);
    const isNewBest = finalScore > this.bestScore;
    const nextBest = Math.max(this.bestScore, finalScore);
    this.bestScore = nextBest;

    this.pendingSummary = {
      score: finalScore,
      distance: Math.floor(this.distance),
      coins: this.coinsThisRun,
      bestScore: nextBest,
      isNewBest,
      tierLabel: tier.label,
    };
    this.emitHud();
  }

  private updateCamera(dt: number): void {
    if (this.phase === 'title') {
      // Showcase camera: right-center runner on desktop, elevated highway vista on portrait mobile
      const isPortrait = this.camera.aspect < 0.9;
      const swayX = Math.sin(this.titleClock * 0.55) * 0.35;
      const swayY = Math.cos(this.titleClock * 0.42) * 0.12;
      if (isPortrait) {
        _vec3A.set(0.4 + swayX * 0.5, 2.75 + swayY, 5.4);
        _vec3B.set(0, 1.5, -5.5);
      } else {
        _vec3A.set(2.15 + swayX, 2.25 + swayY, 4.7);
        _vec3B.set(-0.85, 1.35, -3.5);
      }
      const alpha = 1 - Math.exp(-5 * dt);
      this.camPos.lerp(_vec3A, alpha);
      this.camLook.lerp(_vec3B, alpha);
      this.camera.fov += (56 - this.camera.fov) * alpha;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      return;
    }

    // Dynamic chase camera
    const targetCamX = this.player.x * 0.65;
    const targetCamY = 3.55 + this.player.y * 0.42;
    const targetCamZ = 6.35;
    _vec3A.set(targetCamX, targetCamY, targetCamZ);
    _vec3B.set(this.player.x * 0.45, 1.45 + this.player.y * 0.35, -8.5);

    const alpha = 1 - Math.exp(-9.5 * dt);
    this.camPos.lerp(_vec3A, alpha);
    this.camLook.lerp(_vec3B, alpha);

    // Speed-based FOV kick
    const speedRatio = Math.max(0, Math.min(1, (this.speed - BASE_SPEED) / 26));
    const desiredFov = 62 + speedRatio * 10;
    this.camera.fov += (desiredFov - this.camera.fov) * (1 - Math.exp(-6 * dt));
    this.camera.updateProjectionMatrix();

    // Decaying trauma*trauma camera shake
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const shake = this.settings.cameraShake ? this.trauma * this.trauma : 0;
    const shakeX = (Math.random() * 2 - 1) * 0.42 * shake;
    const shakeY = (Math.random() * 2 - 1) * 0.32 * shake;

    this.camera.position.set(this.camPos.x + shakeX, this.camPos.y + shakeY, this.camPos.z);
    this.camera.lookAt(this.camLook);
    this.camera.rotation.z += this.player.leanAngle * 0.14;

    // Keep shadow frustum anchored to player
    this.keyLight.position.set(this.player.x + 12, 22, 14);
    this.keyLight.target.position.set(this.player.x, 0, -4);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = Math.max(0.001, (now - this.lastTimestamp) / 1000);
    this.lastTimestamp = now;

    this.stepSimulation(rawDt);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('touchstart', this.handleTouchStart);
    canvas.removeEventListener('touchmove', this.handleTouchMove);
    canvas.removeEventListener('touchend', this.handleTouchEnd);

    this.textures.dispose();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
