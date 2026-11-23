import * as THREE from 'three';
import type { AgentId, AgentStatus } from '../office/types';

let cachedIsSoftwareGl: boolean | null = null;

export function detectSoftwareGl(): boolean {
  if (cachedIsSoftwareGl !== null) return cachedIsSoftwareGl;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      cachedIsSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedIsSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedIsSoftwareGl;
  } catch {
    cachedIsSoftwareGl = false;
    return false;
  }
}

export function createOakFloorTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#c8a67d';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#9a9a9a';
  bctx.fillRect(0, 0, size, size);

  const planksY = 8;
  const plankH = size / planksY;
  const plankW = size / 2;

  for (let row = 0; row < planksY; row++) {
    const offset = (row % 2) * (plankW * 0.5);
    for (let col = -1; col < 3; col++) {
      const x = col * plankW + offset;
      const y = row * plankH;
      const shade = ((row * 7 + col * 13) % 5) * 6 - 12;
      const r = Math.min(255, Math.max(0, 198 + shade));
      const g = Math.min(255, Math.max(0, 162 + shade));
      const b = Math.min(255, Math.max(0, 120 + shade));
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x + 1, y + 1, plankW - 2, plankH - 2);

      // Subtle wood grain lines
      ctx.strokeStyle = 'rgba(110, 74, 42, 0.14)';
      ctx.lineWidth = 1;
      for (let gLine = 0; gLine < 5; gLine++) {
        const gy = y + 8 + gLine * (plankH / 5);
        ctx.beginPath();
        ctx.moveTo(x + 2, gy);
        ctx.lineTo(x + plankW - 2, gy + ((gLine % 2 === 0 ? 1 : -1) * 2));
        ctx.stroke();
      }

      // Plank seams in bump map
      bctx.strokeStyle = '#383838';
      bctx.lineWidth = 2;
      bctx.strokeRect(x, y, plankW, plankH);
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 4.5);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 4.5);

  return { map, bumpMap };
}

export function createAcousticWallTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, size, size);

  const slatCount = 16;
  const slatW = size / slatCount;
  for (let i = 0; i < slatCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#78553a' : '#8a6345';
    ctx.fillRect(i * slatW + 2, 0, slatW - 5, size);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(i * slatW + slatW - 3, 0, 3, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createRugTexture(baseHex: string, stripeHex: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  for (let y = 0; y < size; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  ctx.strokeStyle = stripeHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, size - 28, size - 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWhiteboardTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, h);

  // Subtle dot grid
  ctx.fillStyle = '#cbd5e1';
  for (let x = 24; x < w; x += 24) {
    for (let y = 24; y < h; y += 24) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('YENDRA AI · VIDEO PIPELINE', 24, 38);

  // Flow boxes
  const steps = ['1. Research', '2. Script', '3. Assets', '4. Cut', '5. Subs', '6. Audio', '7. Render', '8. QA'];
  const colors = ['#0f766e', '#b45309', '#be123c', '#4338ca', '#b45309', '#4338ca', '#4338ca', '#1d4ed8'];
  steps.forEach((label, idx) => {
    const row = Math.floor(idx / 4);
    const col = idx % 4;
    const bx = 26 + col * 118;
    const by = 64 + row * 82;
    ctx.fillStyle = colors[idx];
    ctx.fillRect(bx, by, 102, 46);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(label, bx + 10, by + 28);

    if (col < 3) {
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx + 104, by + 23);
      ctx.lineTo(bx + 116, by + 23);
      ctx.stroke();
    }
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createScreenTexture(
  agentId: AgentId,
  status: AgentStatus,
  accentHex: string,
): THREE.CanvasTexture {
  const w = 320;
  const h = 180;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = status === 'Error' ? '#240b0e' : '#0b1220';
  ctx.fillRect(0, 0, w, h);

  // Header bar
  ctx.fillStyle = status === 'Error' ? '#7f1d1d' : '#162033';
  ctx.fillRect(0, 0, w, 24);
  ctx.fillStyle = status === 'Error' ? '#fca5a5' : '#94a3b8';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(
    status === 'Error' ? 'ALERT · PIPELINE INTERRUPTED' : `YENDRA OS · ${agentId.toUpperCase()}`,
    10,
    16,
  );

  if (status === 'Error') {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(22, 48, w - 44, 96);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('TASK EXECUTION HALTED', 42, 86);
    ctx.font = '12px monospace';
    ctx.fillText('Click employee to inspect & retry', 42, 114);
  } else if (agentId === 'video_editor') {
    // NLE multi-track timeline
    ctx.fillStyle = '#111a2e';
    ctx.fillRect(10, 32, 180, 74);
    ctx.fillStyle = '#312e81';
    ctx.fillRect(16, 38, 168, 62);
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(198, 32, 112, 74);

    // Timeline tracks
    const trackColors = ['#6366f1', '#22d3ee', '#10b981'];
    trackColors.forEach((tc, idx) => {
      const ty = 116 + idx * 18;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, ty, 300, 12);
      ctx.fillStyle = tc;
      ctx.fillRect(18 + idx * 18, ty + 2, 130 - idx * 12, 8);
      ctx.fillRect(165 + idx * 8, ty + 2, 95, 8);
    });
  } else if (agentId === 'designer') {
    // Color artboard + swatches
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(14, 34, 210, 130);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(28, 48, 88, 64);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(126, 48, 84, 30);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(126, 86, 84, 26);

    const swatches = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#e2e8f0'];
    swatches.forEach((sw, i) => {
      ctx.fillStyle = sw;
      ctx.fillRect(240, 36 + i * 26, 64, 18);
    });
  } else if (agentId === 'researcher') {
    // Bar chart & trend line
    for (let i = 0; i < 6; i++) {
      const bh = 30 + ((i * 27) % 75);
      ctx.fillStyle = i % 2 === 0 ? '#14b8a6' : '#0ea5e9';
      ctx.fillRect(20 + i * 28, 150 - bh, 18, bh);
    }
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(198, 38, 108, 114);
    ctx.fillStyle = '#cbd5e1';
    for (let l = 0; l < 5; l++) {
      ctx.fillRect(208, 52 + l * 18, 84 - (l % 2) * 18, 6);
    }
  } else if (agentId === 'scriptwriter') {
    // Script lines
    for (let l = 0; l < 7; l++) {
      ctx.fillStyle = l % 3 === 0 ? '#f59e0b' : '#94a3b8';
      const lw = l % 3 === 0 ? 110 : 210 - (l % 2) * 45;
      ctx.fillRect(20, 40 + l * 18, lw, 7);
    }
  } else if (agentId === 'qc') {
    // QA Verification Checklist & Resolution Matrix
    const checks = ['1080x1920 9:16 OK', 'ID Subtitles OK', 'Audio -14 LUFS OK', 'Tech Accuracy OK'];
    checks.forEach((chk, i) => {
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(16, 36 + i * 32, 288, 24);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`[PASS] ${chk}`, 26, 52 + i * 32);
    });
  } else {
    // Command matrix / publisher calendar
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 3 === 0 ? accentHex : '#1e293b';
        ctx.fillRect(16 + c * 74, 38 + r * 42, 64, 32);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
