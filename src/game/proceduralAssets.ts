import * as THREE from 'three';
import type { CharacterSkin, ObstacleKind } from './types';

export interface ProceduralTextureSet {
  roadColor: THREE.CanvasTexture;
  roadBump: THREE.CanvasTexture;
  buildingWindowsCyan: THREE.CanvasTexture;
  buildingWindowsMagenta: THREE.CanvasTexture;
  hazardStripes: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Futuristic 3-lane asphalt texture
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 512;
  roadCanvas.height = 512;
  const rctx = roadCanvas.getContext('2d')!;
  rctx.fillStyle = '#12182b';
  rctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt grain + micro-grid
  for (let i = 0; i < 3600; i++) {
    const x = (i * 73) % 512;
    const y = (i * 137) % 512;
    const v = 16 + ((i * 29) % 18);
    rctx.fillStyle = `rgb(${v}, ${v + 5}, ${v + 16})`;
    rctx.fillRect(x, y, 2, 2);
  }

  // Subtle longitudinal track panel seams
  rctx.strokeStyle = 'rgba(72, 180, 255, 0.14)';
  rctx.lineWidth = 2;
  [48, 464].forEach((x) => {
    rctx.beginPath();
    rctx.moveTo(x, 0);
    rctx.lineTo(x, 512);
    rctx.stroke();
  });

  // Lane divider dashed lines (at 1/3 and 2/3 across the 3-lane track)
  rctx.fillStyle = '#3ef2ff';
  const laneX1 = 171;
  const laneX2 = 341;
  for (let y = 16; y < 512; y += 64) {
    rctx.fillRect(laneX1 - 3, y, 6, 34);
    rctx.fillRect(laneX2 - 3, y, 6, 34);
  }

  // Outer edge warning neon strips
  rctx.fillStyle = '#ff2f8b';
  rctx.fillRect(10, 0, 8, 512);
  rctx.fillRect(494, 0, 8, 512);

  const roadColor = new THREE.CanvasTexture(roadCanvas);
  roadColor.colorSpace = THREE.SRGBColorSpace;
  roadColor.wrapS = THREE.ClampToEdgeWrapping;
  roadColor.wrapT = THREE.RepeatWrapping;
  roadColor.repeat.set(1, 3);
  roadColor.anisotropy = maxAnisotropy;

  // 2. Road bump/roughness texture (linear)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const x = (i * 53) % 256;
    const y = (i * 97) % 256;
    const g = 96 + ((i * 19) % 64);
    bctx.fillStyle = `rgb(${g},${g},${g})`;
    bctx.fillRect(x, y, 2, 2);
  }
  const roadBump = new THREE.CanvasTexture(bumpCanvas);
  roadBump.wrapS = THREE.RepeatWrapping;
  roadBump.wrapT = THREE.RepeatWrapping;
  roadBump.repeat.set(2, 6);

  // 3. Skyscraper window textures
  const makeBuildingTex = (glowHex: string, altHex: string) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0c1122';
    ctx.fillRect(0, 0, 256, 512);

    const cols = 8;
    const rows = 24;
    const padX = 6;
    const padY = 5;
    const cellW = 256 / cols;
    const cellH = 512 / rows;

    for (let r = 0; r < rows; r++) {
      const floorLit = (r * 7) % 5 !== 0;
      for (let col = 0; col < cols; col++) {
        const hash = (r * 31 + col * 17) % 11;
        if (floorLit && hash < 7) {
          ctx.fillStyle = hash === 1 ? altHex : glowHex;
        } else {
          ctx.fillStyle = '#151d36';
        }
        ctx.fillRect(
          col * cellW + padX,
          r * cellH + padY,
          cellW - padX * 2,
          cellH - padY * 2,
        );
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  const buildingWindowsCyan = makeBuildingTex('#32e8ff', '#ff4fa3');
  const buildingWindowsMagenta = makeBuildingTex('#ff4fa3', '#7c6bff');

  // 4. Diagonal hazard stripe texture
  const hazCanvas = document.createElement('canvas');
  hazCanvas.width = 256;
  hazCanvas.height = 128;
  const hctx = hazCanvas.getContext('2d')!;
  hctx.fillStyle = '#141824';
  hctx.fillRect(0, 0, 256, 128);
  hctx.fillStyle = '#ffaa1d';
  for (let x = -128; x < 384; x += 48) {
    hctx.beginPath();
    hctx.moveTo(x, 0);
    hctx.lineTo(x + 24, 0);
    hctx.lineTo(x + 24 + 128, 128);
    hctx.lineTo(x + 128, 128);
    hctx.closePath();
    hctx.fill();
  }
  const hazardStripes = new THREE.CanvasTexture(hazCanvas);
  hazardStripes.colorSpace = THREE.SRGBColorSpace;
  hazardStripes.wrapS = THREE.RepeatWrapping;
  hazardStripes.wrapT = THREE.RepeatWrapping;
  hazardStripes.anisotropy = maxAnisotropy;

  // 5. Soft radial contact shadow disc
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 128;
  shCanvas.height = 128;
  const sctx = shCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(2, 4, 12, 0.72)');
  grad.addColorStop(0.6, 'rgba(2, 4, 12, 0.32)');
  grad.addColorStop(1, 'rgba(2, 4, 12, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shCanvas);

  return {
    roadColor,
    roadBump,
    buildingWindowsCyan,
    buildingWindowsMagenta,
    hazardStripes,
    contactShadow,
    dispose: () => {
      roadColor.dispose();
      roadBump.dispose();
      buildingWindowsCyan.dispose();
      buildingWindowsMagenta.dispose();
      hazardStripes.dispose();
      contactShadow.dispose();
    },
  };
}

export interface RunnerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  contactShadow: THREE.Mesh;
  applySkin: (skin: CharacterSkin) => void;
}

export function createRunnerRig(
  skin: CharacterSkin,
  shadowTex: THREE.CanvasTexture,
): RunnerRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const primaryMat = new THREE.MeshStandardMaterial({
    color: skin.primaryHex,
    metalness: skin.metalness,
    roughness: skin.roughness,
  });
  const darkJointMat = new THREE.MeshStandardMaterial({
    color: 0x0b0f1c,
    metalness: 0.2,
    roughness: 0.78,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: skin.accentHex,
    emissive: skin.accentHex,
    emissiveIntensity: 1.65,
    roughness: 0.25,
    metalness: 0.3,
  });
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: skin.visorHex,
    emissive: skin.visorHex,
    emissiveIntensity: 1.25,
    roughness: 0.1,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });

  // Contact shadow disc grounded on floor
  const shadowGeo = new THREE.CircleGeometry(0.62, 24);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  // Pelvis
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.28), darkJointMat);
  pelvis.position.y = 0.86;
  pelvis.castShadow = true;
  bodyPivot.add(pelvis);

  // Torso group
  const torso = new THREE.Group();
  torso.position.y = 0.96;
  bodyPivot.add(torso);

  const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.56, 0.34), primaryMat);
  chestMesh.position.y = 0.28;
  chestMesh.castShadow = true;
  torso.add(chestMesh);

  // Shoulder armor pauldrons
  const pauldronGeo = new THREE.BoxGeometry(0.22, 0.16, 0.36);
  const leftPauldron = new THREE.Mesh(pauldronGeo, primaryMat);
  leftPauldron.position.set(-0.33, 0.48, 0);
  leftPauldron.rotation.z = 0.18;
  leftPauldron.castShadow = true;
  torso.add(leftPauldron);

  const rightPauldron = new THREE.Mesh(pauldronGeo, primaryMat);
  rightPauldron.position.set(0.33, 0.48, 0);
  rightPauldron.rotation.z = -0.18;
  rightPauldron.castShadow = true;
  torso.add(rightPauldron);

  // Spine jetpack / neon reactor core
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.16), darkJointMat);
  backpack.position.set(0, 0.3, 0.22);
  backpack.castShadow = true;
  torso.add(backpack);

  const coreStrip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.06), accentMat);
  coreStrip.position.set(0, 0.3, 0.3);
  torso.add(coreStrip);

  const chestStrip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.04), accentMat);
  chestStrip.position.set(0, 0.36, -0.17);
  torso.add(chestStrip);

  // Head + Helmet + Visor + Aero Fins
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0);
  torso.add(head);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.36), primaryMat);
  helmet.position.y = 0.16;
  helmet.castShadow = true;
  head.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), visorMat);
  visor.position.set(0, 0.17, -0.16);
  head.add(visor);

  const finGeo = new THREE.BoxGeometry(0.04, 0.14, 0.26);
  const leftFin = new THREE.Mesh(finGeo, accentMat);
  leftFin.position.set(-0.18, 0.24, 0.04);
  leftFin.rotation.x = 0.22;
  head.add(leftFin);

  const rightFin = new THREE.Mesh(finGeo, accentMat);
  rightFin.position.set(0.18, 0.24, 0.04);
  rightFin.rotation.x = 0.22;
  head.add(rightFin);

  // Articulated Arms
  const makeArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.36, 0.48, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), darkJointMat);
    upper.position.y = -0.15;
    upper.castShadow = true;
    pivot.add(upper);

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.16), primaryMat);
    forearm.position.y = -0.41;
    forearm.castShadow = true;
    pivot.add(forearm);

    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.17), accentMat);
    cuff.position.y = -0.5;
    pivot.add(cuff);
    torso.add(pivot);
    return pivot;
  };

  const leftArmPivot = makeArm(-1);
  const rightArmPivot = makeArm(1);

  // Articulated Legs + Cyber Boots
  const makeLeg = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.84, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), primaryMat);
    thigh.position.y = -0.2;
    thigh.castShadow = true;
    pivot.add(thigh);

    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.17), darkJointMat);
    shin.position.y = -0.54;
    shin.castShadow = true;
    pivot.add(shin);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.3), primaryMat);
    boot.position.set(0, -0.76, -0.05);
    boot.castShadow = true;
    pivot.add(boot);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.31), accentMat);
    sole.position.set(0, -0.82, -0.05);
    pivot.add(sole);

    bodyPivot.add(pivot);
    return pivot;
  };

  const leftLegPivot = makeLeg(-1);
  const rightLegPivot = makeLeg(1);

  const applySkin = (nextSkin: CharacterSkin) => {
    primaryMat.color.set(nextSkin.primaryHex);
    primaryMat.metalness = nextSkin.metalness;
    primaryMat.roughness = nextSkin.roughness;
    accentMat.color.set(nextSkin.accentHex);
    accentMat.emissive.set(nextSkin.accentHex);
    visorMat.color.set(nextSkin.visorHex);
    visorMat.emissive.set(nextSkin.visorHex);
  };

  return {
    root,
    bodyPivot,
    torso,
    head,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    contactShadow,
    applySkin,
  };
}

export function createObstacleMesh(
  kind: ObstacleKind,
  textures: ProceduralTextureSet,
): THREE.Group {
  const group = new THREE.Group();
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x151b2e,
    metalness: 0.72,
    roughness: 0.35,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.hazardStripes,
    roughness: 0.45,
    metalness: 0.25,
  });
  const redBeaconMat = new THREE.MeshStandardMaterial({
    color: 0xff2a5f,
    emissive: 0xff1e56,
    emissiveIntensity: 2.0,
    roughness: 0.2,
  });

  if (kind === 'barrier') {
    // Low Neon Barrier (Jump over)
    const footGeo = new THREE.BoxGeometry(0.22, 0.16, 0.68);
    const leftFoot = new THREE.Mesh(footGeo, darkMetal);
    leftFoot.position.set(-0.78, 0.08, 0);
    leftFoot.castShadow = true;
    group.add(leftFoot);

    const rightFoot = new THREE.Mesh(footGeo, darkMetal);
    rightFoot.position.set(0.78, 0.08, 0);
    rightFoot.castShadow = true;
    group.add(rightFoot);

    const postGeo = new THREE.BoxGeometry(0.14, 0.92, 0.16);
    const leftPost = new THREE.Mesh(postGeo, darkMetal);
    leftPost.position.set(-0.78, 0.54, 0);
    leftPost.castShadow = true;
    group.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, darkMetal);
    rightPost.position.set(0.78, 0.54, 0);
    rightPost.castShadow = true;
    group.add(rightPost);

    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.36, 0.14), hazardMat);
    crossBeam.position.set(0, 0.78, 0);
    crossBeam.castShadow = true;
    group.add(crossBeam);

    const neonBar = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.08, 0.18), redBeaconMat);
    neonBar.position.set(0, 1.0, 0);
    group.add(neonBar);
  } else if (kind === 'laser_gate') {
    // High Laser Gate (Slide under)
    const pillarGeo = new THREE.BoxGeometry(0.22, 2.75, 0.32);
    const leftPillar = new THREE.Mesh(pillarGeo, darkMetal);
    leftPillar.position.set(-0.96, 1.375, 0);
    leftPillar.castShadow = true;
    group.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, darkMetal);
    rightPillar.position.set(0.96, 1.375, 0);
    rightPillar.castShadow = true;
    group.add(rightPillar);

    const topHeader = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.42, 0.38), hazardMat);
    topHeader.position.set(0, 2.55, 0);
    topHeader.castShadow = true;
    group.add(topHeader);

    const laserPanel = new THREE.Mesh(
      new THREE.BoxGeometry(1.74, 1.05, 0.14),
      new THREE.MeshStandardMaterial({
        color: 0xff2266,
        emissive: 0xff1655,
        emissiveIntensity: 1.85,
        transparent: true,
        opacity: 0.78,
        roughness: 0.15,
      }),
    );
    laserPanel.position.set(0, 1.75, 0);
    group.add(laserPanel);

    const lowerLip = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.1, 0.22), redBeaconMat);
    lowerLip.position.set(0, 1.18, 0);
    group.add(lowerLip);
  } else if (kind === 'monolith') {
    // Full Roadblock Monolith (Switch lanes)
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.35, 1.52), darkMetal);
    base.position.set(0, 0.175, 0);
    base.castShadow = true;
    group.add(base);

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.76, 1.95, 1.32), darkMetal);
    body.position.set(0, 1.3, 0);
    body.castShadow = true;
    group.add(body);

    const frontHazard = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.44, 0.08), hazardMat);
    frontHazard.position.set(0, 0.78, 0.68);
    group.add(frontHazard);

    const xBar1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.08), redBeaconMat);
    xBar1.position.set(0, 1.65, 0.68);
    xBar1.rotation.z = Math.PI / 4;
    group.add(xBar1);

    const xBar2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.08), redBeaconMat);
    xBar2.position.set(0, 1.65, 0.68);
    xBar2.rotation.z = -Math.PI / 4;
    group.add(xBar2);

    const roofBeacon = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.9), redBeaconMat);
    roofBeacon.position.set(0, 2.34, 0);
    group.add(roofBeacon);
  } else {
    // Moving Hover Patrol Drone (composite 6-part model + ground scanner ring)
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1c233b,
      metalness: 0.85,
      roughness: 0.22,
    });
    const chassis = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 1), coreMat);
    chassis.position.set(0, 1.15, 0);
    chassis.scale.set(1.25, 0.75, 1.05);
    chassis.castShadow = true;
    group.add(chassis);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), redBeaconMat);
    eye.position.set(0, 1.14, 0.42);
    group.add(eye);

    const wingGeo = new THREE.BoxGeometry(0.46, 0.1, 0.34);
    const leftWing = new THREE.Mesh(wingGeo, coreMat);
    leftWing.position.set(-0.62, 1.18, 0);
    leftWing.rotation.z = 0.22;
    group.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, coreMat);
    rightWing.position.set(0.62, 1.18, 0);
    rightWing.rotation.z = -0.22;
    group.add(rightWing);

    const rotorGeo = new THREE.TorusGeometry(0.24, 0.04, 8, 18);
    const leftRotor = new THREE.Mesh(rotorGeo, redBeaconMat);
    leftRotor.rotation.x = Math.PI / 2;
    leftRotor.position.set(-0.74, 1.28, 0);
    group.add(leftRotor);

    const rightRotor = new THREE.Mesh(rotorGeo, redBeaconMat);
    rightRotor.rotation.x = Math.PI / 2;
    rightRotor.position.set(0.74, 1.28, 0);
    group.add(rightRotor);

    // Ground target telegraph ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.56, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff2a5f,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);
  }

  return group;
}

export function createCoinMesh(shadowTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();

  const goldMat = new THREE.MeshPhysicalMaterial({
    color: 0xffcc29,
    emissive: 0x6b4300,
    emissiveIntensity: 0.55,
    metalness: 0.92,
    roughness: 0.16,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
  });

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xfff3a1,
    emissive: 0xffc824,
    emissiveIntensity: 1.25,
    metalness: 0.6,
    roughness: 0.2,
  });

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.11, 20), goldMat);
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = true;
  group.add(rim);

  const innerHex = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 6), coreMat);
  innerHex.rotation.x = Math.PI / 2;
  group.add(innerHex);

  const auraRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.025, 8, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffe46b,
      transparent: true,
      opacity: 0.55,
    }),
  );
  group.add(auraRing);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.35, 16),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.65;
  shadow.name = 'coin-shadow';
  group.add(shadow);

  return group;
}

export function createRoadSegment(
  segmentLength: number,
  textures: ProceduralTextureSet,
  segmentIdx: number,
): THREE.Group {
  const seg = new THREE.Group();

  // Main 3-lane highway deck
  const roadGeo = new THREE.PlaneGeometry(8.2, segmentLength);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.roadColor,
    bumpMap: textures.roadBump,
    bumpScale: 0.02,
    roughness: 0.52,
    metalness: 0.28,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  seg.add(road);

  // Raised side curbs (offset >= 0.02 on Y to prevent Z-fighting)
  const curbGeo = new THREE.BoxGeometry(0.85, 0.24, segmentLength);
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x161f38,
    metalness: 0.65,
    roughness: 0.38,
  });
  const leftCurb = new THREE.Mesh(curbGeo, curbMat);
  leftCurb.position.set(-4.52, 0.12, 0);
  leftCurb.receiveShadow = true;
  seg.add(leftCurb);

  const rightCurb = new THREE.Mesh(curbGeo, curbMat);
  rightCurb.position.set(4.52, 0.12, 0);
  rightCurb.receiveShadow = true;
  seg.add(rightCurb);

  // Glowing side rail strips
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x22e6ff,
    emissive: 0x1ad8ff,
    emissiveIntensity: 1.5,
    roughness: 0.25,
  });
  const railGeo = new THREE.BoxGeometry(0.1, 0.08, segmentLength);
  const leftRail = new THREE.Mesh(railGeo, railMat);
  leftRail.position.set(-4.15, 0.26, 0);
  seg.add(leftRail);

  const rightRail = new THREE.Mesh(railGeo, railMat);
  rightRail.position.set(4.15, 0.26, 0);
  seg.add(rightRail);

  // Outer cyber-city plaza ground plane extending outward
  const plazaGeo = new THREE.PlaneGeometry(54, segmentLength);
  const plazaMat = new THREE.MeshStandardMaterial({
    color: 0x090d1c,
    roughness: 0.85,
    metalness: 0.1,
  });
  const leftPlaza = new THREE.Mesh(plazaGeo, plazaMat);
  leftPlaza.rotation.x = -Math.PI / 2;
  leftPlaza.position.set(-31.8, -0.05, 0);
  seg.add(leftPlaza);

  const rightPlaza = new THREE.Mesh(plazaGeo, plazaMat);
  rightPlaza.rotation.x = -Math.PI / 2;
  rightPlaza.position.set(31.8, -0.05, 0);
  seg.add(rightPlaza);

  // Street lights on both sides (multi-part poles)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x202b47, metalness: 0.78, roughness: 0.32 });
  const lampColor = segmentIdx % 2 === 0 ? 0x22e6ff : 0xff4fa3;
  const lampMat = new THREE.MeshStandardMaterial({
    color: lampColor,
    emissive: lampColor,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });

  [-1, 1].forEach((side) => {
    const poleGroup = new THREE.Group();
    poleGroup.position.set(side * 4.55, 0.24, 0);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5.2, 8), poleMat);
    post.position.y = 2.6;
    poleGroup.add(post);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.14), poleMat);
    arm.position.set(-side * 0.5, 5.15, 0);
    poleGroup.add(arm);

    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.18), lampMat);
    bulb.position.set(-side * 0.68, 5.06, 0);
    poleGroup.add(bulb);

    seg.add(poleGroup);
  });

  // Neon overhead highway gantry arch every 2nd segment
  if (segmentIdx % 2 === 0) {
    const archMat = new THREE.MeshStandardMaterial({ color: 0x172038, metalness: 0.72, roughness: 0.3 });
    const archGlowMat = new THREE.MeshStandardMaterial({
      color: segmentIdx % 4 === 0 ? 0x22e6ff : 0xff3b9a,
      emissive: segmentIdx % 4 === 0 ? 0x22e6ff : 0xff3b9a,
      emissiveIntensity: 1.7,
      roughness: 0.2,
    });
    const leftColumn = new THREE.Mesh(new THREE.BoxGeometry(0.38, 7.2, 0.45), archMat);
    leftColumn.position.set(-4.85, 3.6, -segmentLength * 0.35);
    seg.add(leftColumn);

    const rightColumn = new THREE.Mesh(new THREE.BoxGeometry(0.38, 7.2, 0.45), archMat);
    rightColumn.position.set(4.85, 3.6, -segmentLength * 0.35);
    seg.add(rightColumn);

    const span = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.42, 0.5), archMat);
    span.position.set(0, 7.1, -segmentLength * 0.35);
    seg.add(span);

    const neonTrim = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.12, 0.54), archGlowMat);
    neonTrim.position.set(0, 6.92, -segmentLength * 0.35);
    seg.add(neonTrim);
  }

  // Futuristic flanking skyscrapers (composite multi-tier towers + rooftop beacons)
  [-1, 1].forEach((side, sIdx) => {
    const seed = segmentIdx * 13 + sIdx * 7;
    const width = 5.4 + (seed % 4) * 1.1;
    const depth = segmentLength * 0.78;
    const height = 14 + ((seed * 5) % 18);
    const xPos = side * (8.6 + width * 0.5 + (seed % 3) * 1.3);
    const useCyan = (segmentIdx + sIdx) % 2 === 0;

    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: useCyan ? textures.buildingWindowsCyan : textures.buildingWindowsMagenta,
      emissive: 0xffffff,
      emissiveMap: useCyan ? textures.buildingWindowsCyan : textures.buildingWindowsMagenta,
      emissiveIntensity: 0.65,
      roughness: 0.38,
      metalness: 0.45,
    });

    const tower = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bldgMat);
    tower.position.set(xPos, height * 0.5 - 0.05, 0);
    seg.add(tower);

    // Rooftop crown setback + neon strip
    const crownH = 2.2 + (seed % 3);
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.68, crownH, depth * 0.68),
      curbMat,
    );
    crown.position.set(xPos, height + crownH * 0.5 - 0.05, 0);
    seg.add(crown);

    const roofNeon = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.72, 0.22, depth * 0.72),
      useCyan ? railMat : lampMat,
    );
    roofNeon.position.set(xPos, height + 0.12, 0);
    seg.add(roofNeon);

    // Holographic street-facing neon billboard on alternating towers (framed multi-part)
    if ((segmentIdx + sIdx) % 3 === 0) {
      const signColor = useCyan ? 0xff4fa3 : 0x22e6ff;
      const signGlow = new THREE.MeshStandardMaterial({
        color: signColor,
        emissive: signColor,
        emissiveIntensity: 1.4,
        roughness: 0.25,
      });
      const signX = xPos - side * (width * 0.5 + 0.26);
      const signFrame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.9, 4.5), curbMat);
      signFrame.position.set(signX, 5.6, 0);
      seg.add(signFrame);

      const signBarTop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 3.9), signGlow);
      signBarTop.position.set(signX, 6.45, 0);
      seg.add(signBarTop);

      const signBarMid = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.52, 3.2), railMat);
      signBarMid.position.set(signX, 5.6, 0);
      seg.add(signBarMid);

      const signBarBot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 3.9), signGlow);
      signBarBot.position.set(signX, 4.75, 0);
      seg.add(signBarBot);
    }
  });

  return seg;
}
