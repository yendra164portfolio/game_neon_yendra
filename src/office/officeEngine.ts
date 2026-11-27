import type {
  ActivityLogEntry,
  AgentId,
  AgentStatus,
  DashboardMetrics,
  EmployeeProfile,
  ExternalAgentEvent,
  ManagerPatrolState,
  OfficeState,
  OfficeTask,
  TaskPriority,
  VideoFormat,
  VideoPipelineStage,
  VideoProductionRun,
} from './types';

export const OFFICE_WALK_BOUNDS = {
  minX: -6.3,
  maxX: 6.5,
  minZ: -4.6,
  maxZ: 4.7,
} as const;

export function getChairWorldSpot(emp: Pick<EmployeeProfile, 'deskPosition' | 'deskRotationY'>): {
  position: [number, number, number];
  yaw: number;
} {
  const rot = emp.deskRotationY;
  return {
    position: [
      Number((emp.deskPosition[0] + Math.sin(rot) * 0.45).toFixed(3)),
      0,
      Number((emp.deskPosition[2] + Math.cos(rot) * 0.45).toFixed(3)),
    ],
    yaw: rot + Math.PI,
  };
}

export function isValidSeatPosition(
  x: number,
  z: number,
  movingAgentId: AgentId,
  employees: EmployeeProfile[],
): boolean {
  if (
    x < OFFICE_WALK_BOUNDS.minX ||
    x > OFFICE_WALK_BOUNDS.maxX ||
    z < OFFICE_WALK_BOUNDS.minZ ||
    z > OFFICE_WALK_BOUNDS.maxZ
  ) {
    return false;
  }

  // Front teaching zone & blackboard corridor (reserved for Guru & Papan Tulis)
  if (movingAgentId !== 'manager' && z < -2.1) return false;
  // North-East Classroom Cabinet & Corner Shelf (x > 4.2, z < -2.6)
  if (x > 4.2 && z < -2.6) return false;
  // West Wall Book Cubbies & Water Dispenser strip
  if (x < -5.8) return false;

  // Keep desks spaced neatly apart with clear aisles
  for (const other of employees) {
    if (other.id === movingAgentId) continue;
    const dx = x - other.deskPosition[0];
    const dz = z - other.deskPosition[2];
    if (Math.hypot(dx, dz) < 2.15) {
      return false;
    }
  }

  return true;
}

export function resolveValidSeatPosition(
  targetX: number,
  targetZ: number,
  movingAgentId: AgentId,
  employees: EmployeeProfile[],
): [number, number, number] {
  const clampedX = Math.max(OFFICE_WALK_BOUNDS.minX, Math.min(OFFICE_WALK_BOUNDS.maxX, targetX));
  const clampedZ = Math.max(OFFICE_WALK_BOUNDS.minZ, Math.min(OFFICE_WALK_BOUNDS.maxZ, targetZ));

  if (isValidSeatPosition(clampedX, clampedZ, movingAgentId, employees)) {
    return [Number(clampedX.toFixed(2)), 0, Number(clampedZ.toFixed(2))];
  }

  // Spiral search outward for nearest unobstructed floor spot
  for (let radius = 0.45; radius <= 7.5; radius += 0.45) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      const cx = clampedX + Math.cos(angle) * radius;
      const cz = clampedZ + Math.sin(angle) * radius;
      if (isValidSeatPosition(cx, cz, movingAgentId, employees)) {
        return [Number(cx.toFixed(2)), 0, Number(cz.toFixed(2))];
      }
    }
  }

  const current = employees.find((e) => e.id === movingAgentId);
  return current ? [...current.deskPosition] : [0, 0, 0];
}

function isFloorClearForStanding(x: number, z: number, employees: EmployeeProfile[]): boolean {
  if (x < -6.3 || x > 6.8 || z < -4.9 || z > 5.1) return false;
  if (x > 4.4 && z < -3.0) return false;

  for (const emp of employees) {
    const dx = x - emp.deskPosition[0];
    const dz = z - emp.deskPosition[2];
    if (Math.hypot(dx, dz) < 0.95) return false;
  }
  return true;
}

export function computeInspectionSpotForDesk(
  targetEmp: EmployeeProfile,
  employees: EmployeeProfile[],
): { spot: [number, number, number]; lookAt: [number, number, number] } {
  const rot = targetEmp.deskRotationY;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const candidates: Array<[number, number]> = [
    [1.35, 0.35],
    [-1.35, 0.35],
    [0.0, 1.38],
    [1.15, -0.95],
    [-1.15, -0.95],
  ];

  for (const [lx, lz] of candidates) {
    const wx = targetEmp.deskPosition[0] + lx * cos + lz * sin;
    const wz = targetEmp.deskPosition[2] - lx * sin + lz * cos;
    if (isFloorClearForStanding(wx, wz, employees)) {
      return {
        spot: [Number(wx.toFixed(2)), 0, Number(wz.toFixed(2))],
        lookAt: [targetEmp.deskPosition[0], 0, targetEmp.deskPosition[2]],
      };
    }
  }

  const fallbackX = Math.max(-6.8, Math.min(6.8, targetEmp.deskPosition[0] + sin * 1.35));
  const fallbackZ = Math.max(-5.0, Math.min(5.0, targetEmp.deskPosition[2] + cos * 1.35));
  return {
    spot: [Number(fallbackX.toFixed(2)), 0, Number(fallbackZ.toFixed(2))],
    lookAt: [targetEmp.deskPosition[0], 0, targetEmp.deskPosition[2]],
  };
}

let idCounter = 1000;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function syncEmployeeTaskCounters(
  employees: EmployeeProfile[],
  tasks: OfficeTask[],
): EmployeeProfile[] {
  return employees.map((emp) => {
    let completed = 0;
    let failed = 0;
    for (const task of tasks) {
      if (task.assigneeId !== emp.id) continue;
      if (task.status === 'Completed') completed += 1;
      else if (task.status === 'Error') failed += 1;
    }
    if (emp.tasksCompleted === completed && emp.tasksFailed === failed) {
      return emp;
    }
    return {
      ...emp,
      tasksCompleted: completed,
      tasksFailed: failed,
    };
  });
}

export interface VideoRunSeedInput {
  topic: string;
  format: VideoFormat;
  geminiAssisted?: boolean;
  customArtifacts?: {
    researchNotes?: string;
    scriptText?: string;
    subtitlesSrt?: string;
    musicCue?: string;
  };
}

function buildVideoStages(
  topic: string,
  format: VideoFormat,
  nowMs: number,
  custom?: VideoRunSeedInput['customArtifacts'],
): VideoPipelineStage[] {
  const safeTopic = topic.trim() || 'Alur Kerja Produksi Otomatis';
  return [
    {
      stageNumber: 1,
      title: 'Riset Topik Video',
      description: 'Menganalisis tren audiens, poin inspirasi utama, dan wawasan psikologi terverifikasi.',
      assigneeId: 'researcher',
      status: 'Active',
      progress: 12,
      startedAt: nowMs,
      completedAt: null,
      artifactTitle: 'Ringkasan Topik & Poin Utama',
      artifactContent:
        custom?.researchNotes ??
        `Topik: ${safeTopic}\nFormat: ${format}\n\nPoin Utama:\n1. Pembukaan emosional 3 detik pertama meningkatkan retensi penonton.\n2. Pesan motivasi berbasis langkah nyata mudah diterapkan sehari-hari.\n3. Pemantauan 3D langsung di setiap bangku spesialis studio.`,
    },
    {
      stageNumber: 2,
      title: 'Penulisan Naskah Video',
      description: 'Menyusun narasi per adegan, hook pembuka, dan arahan visual.',
      assigneeId: 'scriptwriter',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Naskah Produksi (4 Adegan)',
      artifactContent:
        custom?.scriptText ??
        `[00:00 - Hook] Selamat datang di ${safeTopic} — enam spesialis berkolaborasi secara langsung.\n[00:08 - Konteks] Asep meriset fakta terverifikasi sementara Abdul menyusun alur cerita.\n[00:18 - Produksi] Caca mendesain grafis dan thumbnail saat Rahman merakit timeline video.\n[00:30 - Penutup] Siap diperiksa Eko dan dijadwalkan publikasi oleh Riko.`,
    },
    {
      stageNumber: 3,
      title: 'Desain Aset Visual',
      description: 'Membuat thumbnail, diagram teknis, B-roll, dan lower third.',
      assigneeId: 'designer',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Daftar Aset Visual',
      artifactContent:
        `• hero_thumbnail_16x9.png (Tata letak arsitektur kontras tinggi)\n• b_roll_isometric_office_01.mp4 (1080p @ 60fps)\n• b_roll_pipeline_diagram_02.mp4 (Diagram alur produksi animasi)\n• lower_third_pack_v2.svg (Tipografi studio Biru & Slate)`,
    },
    {
      stageNumber: 4,
      title: 'Perakitan Klip Video',
      description: 'Memotong B-roll otomatis, menyelaraskan narasi, dan menambahkan transisi.',
      assigneeId: 'video_editor',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Daftar Potongan Timeline NLE',
      artifactContent:
        `Timeline: ${format} · Master 24fps\nTrack V1: Hook Pembuka (00:00–00:08) -> Cross-dissolve 12f\nTrack V2: Tur Studio (00:08–00:20) -> L-cut audio bridge\nTrack V3: Overlay Data & CTA (00:20–00:36)`,
    },
    {
      stageNumber: 5,
      title: 'Pembuatan Subtitle',
      description: 'Menyelaraskan waktu teks dan memformat file SRT multi-platform.',
      assigneeId: 'scriptwriter',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Subtitle Terjadwal (.SRT)',
      artifactContent:
        custom?.subtitlesSrt ??
        `1\n00:00:00,000 --> 00:00:04,200\nDi dalam ${safeTopic}, tim spesialis bekerja secara paralel.\n\n2\n00:00:04,300 --> 00:00:09,500\nSetiap serah terima dari riset hingga render akhir terpantau langsung.`,
    },
    {
      stageNumber: 6,
      title: 'Penambahan Musik Latar',
      description: 'Mencampur musik latar studio dan menyeimbangkan frekuensi dialog.',
      assigneeId: 'video_editor',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Mixing & Mastering Audio',
      artifactContent:
        custom?.musicCue ??
        `Track: "Architectural Pulse (Ambient Tech, 108 BPM)"\nJalur Dialog: -14 LUFS terintegrasi\nDucking Musik: -18 dB di bawah suara narasi`,
    },
    {
      stageNumber: 7,
      title: 'Render Video Final',
      description: 'Menyandikan master H.264/AAC dengan normalisasi tingkat kenyaringan.',
      assigneeId: 'video_editor',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Paket Render Master',
      artifactContent:
        `Codec: H.264 High Profile · 1920x1080 (atau 1080x1920)\nBitrate: 18 Mbps VBR 2-Pass\nAudio: AAC 320 kbps Stereo · Loudness -14.0 LUFS`,
    },
    {
      stageNumber: 8,
      title: 'Tinjau & Setujui Hasil',
      description: 'Pemeriksaan kualitas oleh Yendra Owner sebelum Riko menjadwalkan rilis.',
      assigneeId: 'manager',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Gerbang Persetujuan Pimpinan',
      artifactContent:
        `Menunggu persetujuan akhir dari Yendra Owner. Setelah disetujui, Riko akan menyiapkan metadata dan menjadwalkan publikasi.`,
    },
  ];
}

export function createInitialOfficeState(nowMs: number = Date.now()): OfficeState {
  const employees: EmployeeProfile[] = [
    {
      id: 'manager',
      name: 'Yendra Owner',
      role: 'Guru & Pemilik Studio',
      department: 'Pimpinan & Pengajar',
      workstation: 'Depan Kelas · Meja Guru',
      deskPosition: [0, 0, -4.0],
      deskRotationY: Math.PI,
      appearance: {
        skinColor: '#e8be9e',
        hairColor: '#1e293b',
        shirtColor: '#f8fafc',
        jacketColor: '#1e3a8a',
        pantsColor: '#0f172a',
        accentColor: '#3b82f6',
        hairStyle: 'parted',
        accessory: 'tablet',
      },
      status: 'Working',
      currentActivity: 'Membimbing kelas & mengatur antrean produksi',
      currentTaskId: 'task-101',
      progress: 64,
      statusUpdatedAt: nowMs - 45000,
      tasksCompleted: 14,
      tasksFailed: 0,
      totalActiveSeconds: 1840,
      efficiencyScore: 98,
    },
    {
      id: 'researcher',
      name: 'Asep',
      role: 'Analis Riset & Topik',
      department: 'Divisi Riset',
      workstation: 'Baris 1 Kiri · Bangku 1',
      deskPosition: [-3.6, 0, -0.7],
      deskRotationY: 0,
      appearance: {
        skinColor: '#d9a077',
        hairColor: '#27272a',
        shirtColor: '#e2e8f0',
        jacketColor: '#0f766e',
        pantsColor: '#1e293b',
        accentColor: '#14b8a6',
        hairStyle: 'short',
        accessory: 'glasses',
      },
      status: 'Thinking',
      currentActivity: 'Merangkum riset & fakta teknis',
      currentTaskId: 'task-102',
      progress: 42,
      statusUpdatedAt: nowMs - 22000,
      tasksCompleted: 11,
      tasksFailed: 1,
      totalActiveSeconds: 1560,
      efficiencyScore: 94,
    },
    {
      id: 'scriptwriter',
      name: 'Abdul',
      role: 'Penulis Naskah & Narasi',
      department: 'Divisi Naskah',
      workstation: 'Baris 1 Tengah · Bangku 2',
      deskPosition: [0, 0, -0.7],
      deskRotationY: 0,
      appearance: {
        skinColor: '#f2ccb0',
        hairColor: '#7c2d12',
        shirtColor: '#fef3c7',
        jacketColor: '#b45309',
        pantsColor: '#292524',
        accentColor: '#f59e0b',
        hairStyle: 'waves',
        accessory: 'headset',
      },
      status: 'Working',
      currentActivity: 'Menulis hook & naskah per adegan',
      currentTaskId: 'task-103',
      progress: 78,
      statusUpdatedAt: nowMs - 38000,
      tasksCompleted: 16,
      tasksFailed: 0,
      totalActiveSeconds: 2120,
      efficiencyScore: 97,
    },
    {
      id: 'video_editor',
      name: 'Rahman',
      role: 'Editor Video & Audio',
      department: 'Divisi Produksi Video',
      workstation: 'Baris 2 Kiri · Bangku 4',
      deskPosition: [-3.6, 0, 2.6],
      deskRotationY: 0,
      appearance: {
        skinColor: '#c68b63',
        hairColor: '#09090b',
        shirtColor: '#e0e7ff',
        jacketColor: '#4338ca',
        pantsColor: '#18181b',
        accentColor: '#6366f1',
        hairStyle: 'fade',
        accessory: 'headphones',
      },
      status: 'Working',
      currentActivity: 'Memotong klip B-roll & audio',
      currentTaskId: 'task-104',
      progress: 51,
      statusUpdatedAt: nowMs - 30000,
      tasksCompleted: 19,
      tasksFailed: 1,
      totalActiveSeconds: 2650,
      efficiencyScore: 95,
    },
    {
      id: 'designer',
      name: 'Caca',
      role: 'Desainer Grafis & Visual',
      department: 'Divisi Desain',
      workstation: 'Baris 1 Kanan · Bangku 3',
      deskPosition: [3.6, 0, -0.7],
      deskRotationY: 0,
      appearance: {
        skinColor: '#f5d0b5',
        hairColor: '#581c87',
        shirtColor: '#ffe4e6',
        jacketColor: '#be123c',
        pantsColor: '#1e293b',
        accentColor: '#f43f5e',
        hairStyle: 'bun',
        accessory: 'stylus',
      },
      status: 'Completed',
      currentActivity: 'Mengirim paket thumbnail & diagram',
      currentTaskId: 'task-105',
      progress: 100,
      statusUpdatedAt: nowMs - 8000,
      tasksCompleted: 13,
      tasksFailed: 0,
      totalActiveSeconds: 1490,
      efficiencyScore: 99,
    },
    {
      id: 'publisher',
      name: 'Riko',
      role: 'Koordinator Publikasi Konten',
      department: 'Divisi Publikasi',
      workstation: 'Baris 2 Kanan · Bangku 6',
      deskPosition: [3.6, 0, 2.6],
      deskRotationY: 0,
      appearance: {
        skinColor: '#8d5524',
        hairColor: '#18181b',
        shirtColor: '#ecfdf5',
        jacketColor: '#047857',
        pantsColor: '#0f172a',
        accentColor: '#10b981',
        hairStyle: 'curly',
        accessory: 'watch',
      },
      status: 'Idle',
      currentActivity: 'Menunggu video siap tayang',
      currentTaskId: null,
      progress: 0,
      statusUpdatedAt: nowMs - 15000,
      tasksCompleted: 10,
      tasksFailed: 0,
      totalActiveSeconds: 1120,
      efficiencyScore: 96,
    },
    {
      id: 'qc',
      name: 'Eko',
      role: 'Pemeriksa Kualitas Konten',
      department: 'Divisi Kontrol Kualitas',
      workstation: 'Baris 2 Tengah · Bangku 5',
      deskPosition: [0, 0, 2.6],
      deskRotationY: 0,
      appearance: {
        skinColor: '#e0b394',
        hairColor: '#1e293b',
        shirtColor: '#f8fafc',
        jacketColor: '#7c2d12',
        pantsColor: '#0f172a',
        accentColor: '#f97316',
        hairStyle: 'short',
        accessory: 'glasses',
      },
      status: 'Idle',
      currentActivity: 'Siap memeriksa master 1080x1920',
      currentTaskId: null,
      progress: 0,
      statusUpdatedAt: nowMs - 10000,
      tasksCompleted: 12,
      tasksFailed: 0,
      totalActiveSeconds: 1310,
      efficiencyScore: 99,
    },
  ];

  const tasks: OfficeTask[] = [
    {
      id: 'task-101',
      title: 'Koordinasi Jadwal Produksi Harian',
      description:
        'Meninjau brief produksi, membagi tugas harian, dan memantau kelancaran setiap divisi.',
      assigneeId: 'manager',
      department: 'Pimpinan Utama',
      priority: 'High',
      status: 'Working',
      progress: 64,
      createdAt: nowMs - 90000,
      startedAt: nowMs - 45000,
      completedAt: null,
      estimatedSeconds: 28,
      elapsedSeconds: 18,
    },
    {
      id: 'task-102',
      title: 'Riset Tren Topik Motivasi Harian',
      description:
        'Mengumpulkan referensi psikologi positif, kutipan kuat, dan pesan inspirasi terverifikasi.',
      assigneeId: 'researcher',
      department: 'Divisi Riset',
      priority: 'Normal',
      status: 'Thinking',
      progress: 42,
      createdAt: nowMs - 65000,
      startedAt: nowMs - 22000,
      completedAt: null,
      estimatedSeconds: 26,
      elapsedSeconds: 11,
    },
    {
      id: 'task-103',
      title: 'Tulis Naskah Narasi Peluncuran Produk',
      description:
        'Menyusun hook 3 detik, petunjuk storyboard, dan kalimat penutup yang ringkas.',
      assigneeId: 'scriptwriter',
      department: 'Divisi Naskah',
      priority: 'High',
      status: 'Working',
      progress: 78,
      createdAt: nowMs - 75000,
      startedAt: nowMs - 38000,
      completedAt: null,
      estimatedSeconds: 24,
      elapsedSeconds: 18.7,
    },
    {
      id: 'task-104',
      title: 'Rakit Potongan Video Tur Studio',
      description:
        'Menyelaraskan B-roll multi-kamera, koreksi warna LUT, dan menyeimbangkan suara narasi.',
      assigneeId: 'video_editor',
      department: 'Divisi Produksi Video',
      priority: 'Urgent',
      status: 'Working',
      progress: 51,
      createdAt: nowMs - 60000,
      startedAt: nowMs - 30000,
      completedAt: null,
      estimatedSeconds: 30,
      elapsedSeconds: 15.3,
    },
    {
      id: 'task-105',
      title: 'Desain Thumbnail Isometrik Unggulan',
      description:
        'Membuat 3 variasi thumbnail kontras tinggi dengan tipografi bersih.',
      assigneeId: 'designer',
      department: 'Divisi Desain',
      priority: 'Normal',
      status: 'Completed',
      progress: 100,
      createdAt: nowMs - 140000,
      startedAt: nowMs - 110000,
      completedAt: nowMs - 8000,
      estimatedSeconds: 22,
      elapsedSeconds: 22,
      outputSummary: 'Berhasil ekspor 3 varian PNG (1280x720) + layer PSD.',
    },
    {
      id: 'task-106',
      title: 'Verifikasi Tag SEO & Chapter Kanal',
      description:
        'Menyiapkan chapter YouTube, deskripsi bahasa Indonesia, dan jadwal teaser.',
      assigneeId: 'publisher',
      department: 'Divisi Publikasi',
      priority: 'Normal',
      status: 'Queued',
      progress: 0,
      createdAt: nowMs - 18000,
      startedAt: null,
      completedAt: null,
      estimatedSeconds: 20,
      elapsedSeconds: 0,
    },
    {
      id: 'task-107',
      title: 'Periksa Frame Rate Grafis Gerak',
      description:
        'Memastikan seluruh overlay lower-third diekspor mulus pada 60fps alpha.',
      assigneeId: 'designer',
      department: 'Divisi Desain',
      priority: 'Low',
      status: 'Queued',
      progress: 0,
      createdAt: nowMs - 12000,
      startedAt: null,
      completedAt: null,
      estimatedSeconds: 18,
      elapsedSeconds: 0,
    },
    {
      id: 'task-108',
      title: 'Uji Skema Sinkronisasi Webhook',
      description:
        'Memvalidasi pengiriman payload event Laravel Reverb ke endpoint uji coba.',
      assigneeId: 'researcher',
      department: 'Divisi Riset',
      priority: 'Low',
      status: 'Error',
      progress: 35,
      createdAt: nowMs - 240000,
      startedAt: nowMs - 220000,
      completedAt: null,
      estimatedSeconds: 20,
      elapsedSeconds: 7,
      errorMessage: 'Simulasi demo: Timeout webhook upstream (HTTP 504) — siap diulang.',
    },
    {
      id: 'task-109',
      title: 'Briefing Standar Konten Motivasi Kelas',
      description: 'Menetapkan standar alur kerja harian untuk seluruh anggota tim.',
      assigneeId: 'manager',
      department: 'Pimpinan & Pengajar',
      priority: 'Normal',
      status: 'Completed',
      progress: 100,
      createdAt: nowMs - 320000,
      startedAt: nowMs - 300000,
      completedAt: nowMs - 250000,
      estimatedSeconds: 20,
      elapsedSeconds: 20,
      outputSummary: 'Standar produksi 9:16 disetujui.',
    },
    {
      id: 'task-110',
      title: 'Audit Topik Viral & Hashtag Mingguan',
      description: 'Menyusun daftar topik motivasi dengan retensi tinggi.',
      assigneeId: 'researcher',
      department: 'Divisi Riset',
      priority: 'Normal',
      status: 'Completed',
      progress: 100,
      createdAt: nowMs - 310000,
      startedAt: nowMs - 290000,
      completedAt: nowMs - 240000,
      estimatedSeconds: 22,
      elapsedSeconds: 22,
      outputSummary: 'Referensi topik dan kata kunci siap dipakai.',
    },
    {
      id: 'task-111',
      title: 'Template Hook 3 Detik Pertama',
      description: 'Membuat pola kalimat pembuka yang langsung menarik perhatian.',
      assigneeId: 'scriptwriter',
      department: 'Divisi Naskah',
      priority: 'Normal',
      status: 'Completed',
      progress: 100,
      createdAt: nowMs - 300000,
      startedAt: nowMs - 280000,
      completedAt: nowMs - 230000,
      estimatedSeconds: 18,
      elapsedSeconds: 18,
      outputSummary: 'Pola hook dan CTA tersimpan.',
    },
    {
      id: 'task-112',
      title: 'Preset Ekspor H.264 Vertikal 1080x1920',
      description: 'Menyiapkan profil render MP4 dan subtitle kontras tinggi.',
      assigneeId: 'video_editor',
      department: 'Divisi Produksi Video',
      priority: 'Normal',
      status: 'Completed',
      progress: 100,
      createdAt: nowMs - 290000,
      startedAt: nowMs - 270000,
      completedAt: nowMs - 220000,
      estimatedSeconds: 24,
      elapsedSeconds: 24,
      outputSummary: 'Preset FFmpeg 9:16 terkalibrasi.',
    },
    {
      id: 'task-113',
      title: 'Sinkronisasi Profil Kanal TikTok',
      description: 'Memverifikasi integrasi publikasi dan caption otomatis.',
      assigneeId: 'publisher',
      department: 'Divisi Publikasi',
      priority: 'Normal',
      status: 'Completed',
      progress: 100,
      createdAt: nowMs - 280000,
      startedAt: nowMs - 260000,
      completedAt: nowMs - 210000,
      estimatedSeconds: 16,
      elapsedSeconds: 16,
      outputSummary: 'Kanal publikasi siap mengirim postingan.',
    },
    {
      id: 'task-114',
      title: 'Kalibrasi Checklist QC Audio & Subtitle',
      description: 'Menetapkan ambang batas durasi 5–60d dan rasio 9:16.',
      assigneeId: 'qc',
      department: 'Divisi Kontrol Kualitas',
      priority: 'Normal',
      status: 'Completed',
      progress: 100,
      createdAt: nowMs - 270000,
      startedAt: nowMs - 250000,
      completedAt: nowMs - 200000,
      estimatedSeconds: 16,
      elapsedSeconds: 16,
      outputSummary: 'Standar QC video TikTok aktif.',
    },
  ];

  const initialVideoRun: VideoProductionRun = {
    id: 'vrun-101',
    topic: 'Disiplin Kecil Setiap Hari Mengalahkan Bakat Besar',
    format: '16:9 YouTube',
    status: 'In Progress',
    createdAt: nowMs - 40000,
    completedAt: null,
    currentStage: 1,
    stages: buildVideoStages(
      'Disiplin Kecil Setiap Hari Mengalahkan Bakat Besar',
      '16:9 YouTube',
      nowMs - 40000,
    ),
    geminiAssisted: false,
  };

  const activityLog: ActivityLogEntry[] = [
    {
      id: 'log-1',
      timestamp: nowMs - 8000,
      agentId: 'designer',
      agentName: 'Caca',
      status: 'Completed',
      message: 'Menyelesaikan "Desain Thumbnail Isometrik Unggulan" (100%).',
      taskId: 'task-105',
      source: 'demo-sim',
    },
    {
      id: 'log-2',
      timestamp: nowMs - 22000,
      agentId: 'researcher',
      agentName: 'Asep',
      status: 'Thinking',
      message: 'Menganalisis poin inspirasi untuk "Riset Tren Topik Motivasi Harian".',
      taskId: 'task-102',
      source: 'demo-sim',
    },
    {
      id: 'log-3',
      timestamp: nowMs - 30000,
      agentId: 'video_editor',
      agentName: 'Rahman',
      status: 'Working',
      message: 'Memproses potongan timeline untuk "Rakit Potongan Video Tur Studio".',
      taskId: 'task-104',
      source: 'demo-sim',
    },
    {
      id: 'log-4',
      timestamp: nowMs - 38000,
      agentId: 'scriptwriter',
      agentName: 'Abdul',
      status: 'Working',
      message: 'Menulis adegan naskah untuk "Tulis Naskah Narasi Peluncuran Produk".',
      taskId: 'task-103',
      source: 'demo-sim',
    },
    {
      id: 'log-5',
      timestamp: nowMs - 45000,
      agentId: 'manager',
      agentName: 'Yendra Owner',
      status: 'Working',
      message: 'Membagikan brief produksi video ke tim Riset & Naskah.',
      taskId: 'task-101',
      source: 'demo-sim',
    },
    {
      id: 'log-6',
      timestamp: nowMs - 190000,
      agentId: 'researcher',
      agentName: 'Asep',
      status: 'Error',
      message: 'Tugas "Uji Skema Sinkronisasi Webhook" terhenti karena timeout demo.',
      taskId: 'task-108',
      source: 'demo-sim',
    },
  ];

  const managerEmp = employees.find((e) => e.id === 'manager') ?? employees[0];
  const managerChair = getChairWorldSpot(managerEmp);
  const managerPatrol: ManagerPatrolState = {
    enabled: false,
    phase: 'at_desk',
    targetAgentId: null,
    targetPos: managerChair.position,
    targetLookAt: [managerEmp.deskPosition[0], 0, managerEmp.deskPosition[2]],
    currentPos: managerChair.position,
    currentYaw: managerChair.yaw,
    dwellSeconds: 0,
    visitedOrder: [],
  };

  const syncedEmployees = syncEmployeeTaskCounters(employees, tasks);

  return {
    employees: syncedEmployees,
    tasks,
    activityLog,
    videoRuns: [initialVideoRun],
    activeVideoRunId: initialVideoRun.id,
    simulationRunning: true,
    simulationSpeed: 1,
    modeLabel: 'Simulasi Demo',
    lastTickAt: nowMs,
    managerPatrol,
  };
}

function appendLog(
  logs: ActivityLogEntry[],
  entry: Omit<ActivityLogEntry, 'id'>,
): ActivityLogEntry[] {
  const newEntry: ActivityLogEntry = {
    ...entry,
    id: nextId('log'),
  };
  return [newEntry, ...logs].slice(0, 60);
}

const DEMO_CYCLIC_TOPICS: Record<AgentId, Array<{ title: string; activity: string }>> = {
  manager: [
    { title: 'Tinjau Kinerja Divisi Harian', activity: 'Memeriksa waktu penyelesaian tugas' },
    { title: 'Atur Ulang Prioritas Antrean', activity: 'Menyeimbangkan beban kerja tim' },
  ],
  researcher: [
    { title: 'Kumpulkan Referensi Teknis', activity: 'Memeriksa ulang sumber utama' },
    { title: 'Analisis Daya Tarik Penonton', activity: 'Mengevaluasi hook pembuka' },
  ],
  scriptwriter: [
    { title: 'Rapikan Tempo Narasi Suara', activity: 'Menghaluskan transisi kalimat' },
    { title: 'Buat Naskah Video Pendek 30d', activity: 'Menulis naskah vertikal 9:16' },
  ],
  video_editor: [
    { title: 'Sesuaikan Warna Klip Studio', activity: 'Menerapkan profil warna sinematik' },
    { title: 'Normalisasi Audio Dialog', activity: 'Menyetarakan suara ke -14 LUFS' },
  ],
  designer: [
    { title: 'Buat Grafis Lower Third', activity: 'Mendesain overlay judul tajam' },
    { title: 'Ekspor Kartu Visual Edukasi', activity: 'Merender grafis resolusi tinggi' },
  ],
  publisher: [
    { title: 'Siapkan Metadata Publikasi', activity: 'Menyusun tag & deskripsi video' },
    { title: 'Jadwalkan Rilis Multi-Kanal', activity: 'Mengantrekan kalender tayang' },
  ],
  qc: [
    { title: 'Periksa Sinkronisasi Subtitle', activity: 'Mengaudit ejaan & waktu teks' },
    { title: 'Validasi Audio & Dimensi MP4', activity: 'Memeriksa format 1080x1920' },
  ],
};

function advanceManagerPatrol(
  patrol: ManagerPatrolState,
  employees: EmployeeProfile[],
  activityLog: ActivityLogEntry[],
  scaledDt: number,
  nowMs: number,
): {
  managerPatrol: ManagerPatrolState;
  employees: EmployeeProfile[];
  activityLog: ActivityLogEntry[];
} {
  const managerIdx = employees.findIndex((e) => e.id === 'manager');
  if (managerIdx === -1) {
    return { managerPatrol: patrol, employees, activityLog };
  }

  const managerEmp = employees[managerIdx];
  const managerChair = getChairWorldSpot(managerEmp);

  if (patrol.phase === 'at_desk') {
    if (!patrol.enabled) {
      return {
        managerPatrol: {
          ...patrol,
          currentPos: managerChair.position,
          targetPos: managerChair.position,
          currentYaw: managerChair.yaw,
        },
        employees,
        activityLog,
      };
    }

    const colleagues = employees.filter((e) => e.id !== 'manager');
    if (colleagues.length === 0) {
      return { managerPatrol: patrol, employees, activityLog };
    }
    const nextTarget =
      colleagues.find((c) => !patrol.visitedOrder.includes(c.id)) ?? colleagues[0];
    const nextVisited = patrol.visitedOrder.includes(nextTarget.id)
      ? [nextTarget.id]
      : [...patrol.visitedOrder, nextTarget.id];
    const { spot, lookAt } = computeInspectionSpotForDesk(nextTarget, employees);

    const nextEmployees = employees.map((e, i) =>
      i === managerIdx
        ? {
            ...e,
            currentActivity: `Berjalan memantau ${nextTarget.name}`,
          }
        : e,
    );

    return {
      managerPatrol: {
        ...patrol,
        phase: 'walking_to_colleague',
        targetAgentId: nextTarget.id,
        targetPos: spot,
        targetLookAt: lookAt,
        dwellSeconds: 0,
        visitedOrder: nextVisited,
      },
      employees: nextEmployees,
      activityLog,
    };
  }

  const walkSpeed = 1.95; // meters per simulated second
  if (patrol.phase === 'walking_to_colleague' || patrol.phase === 'returning_to_desk') {
    const dest =
      patrol.phase === 'returning_to_desk' ? managerChair.position : patrol.targetPos;
    const dx = dest[0] - patrol.currentPos[0];
    const dz = dest[2] - patrol.currentPos[2];
    const dist = Math.hypot(dx, dz);
    const step = walkSpeed * scaledDt;

    if (dist <= step + 0.08) {
      if (patrol.phase === 'returning_to_desk') {
        const nextEmployees = employees.map((e, i) =>
          i === managerIdx
            ? {
                ...e,
                currentActivity: 'Mengatur antrean produksi di meja pimpinan',
              }
            : e,
        );
        return {
          managerPatrol: {
            ...patrol,
            phase: 'at_desk',
            targetAgentId: null,
            currentPos: managerChair.position,
            targetPos: managerChair.position,
            currentYaw: managerChair.yaw,
            dwellSeconds: 0,
          },
          employees: nextEmployees,
          activityLog,
        };
      }

      // Arrived at colleague desk -> start inspecting!
      const targetEmp = employees.find((e) => e.id === patrol.targetAgentId);
      const lookYaw = targetEmp
        ? Math.atan2(
            targetEmp.deskPosition[0] - dest[0],
            targetEmp.deskPosition[2] - dest[2],
          )
        : patrol.currentYaw;
      const summary = targetEmp
        ? `Memantau ${targetEmp.name}: ${targetEmp.status} (${targetEmp.progress}%)`
        : 'Memeriksa bangku kelas';

      const nextEmployees = employees.map((e, i) =>
        i === managerIdx
          ? {
              ...e,
              currentActivity: summary,
            }
          : e,
      );
      const nextLog = targetEmp
        ? appendLog(activityLog, {
            timestamp: nowMs,
            agentId: 'manager',
            agentName: managerEmp.name,
            status: 'Working',
            message: `Berhenti di bangku ${targetEmp.name} untuk memantau "${targetEmp.currentActivity}" (${targetEmp.progress}%).`,
            source: 'demo-sim',
          })
        : activityLog;

      return {
        managerPatrol: {
          ...patrol,
          phase: 'inspecting',
          currentPos: dest,
          currentYaw: lookYaw,
          dwellSeconds: 0,
        },
        employees: nextEmployees,
        activityLog: nextLog,
      };
    }

    const ratio = step / dist;
    const nextPos: [number, number, number] = [
      Number((patrol.currentPos[0] + dx * ratio).toFixed(3)),
      0,
      Number((patrol.currentPos[2] + dz * ratio).toFixed(3)),
    ];
    const travelYaw = Math.atan2(dx, dz);

    return {
      managerPatrol: {
        ...patrol,
        targetPos: dest,
        currentPos: nextPos,
        currentYaw: travelYaw,
      },
      employees,
      activityLog,
    };
  }

  // phase === 'inspecting'
  const nextDwell = patrol.dwellSeconds + scaledDt;
  const targetEmp = employees.find((e) => e.id === patrol.targetAgentId);
  const dwellLimit = patrol.enabled ? 4.5 : 5.5;

  if (nextDwell < dwellLimit) {
    const nextEmployees =
      targetEmp
        ? employees.map((e, i) =>
            i === managerIdx
              ? {
                  ...e,
                  currentActivity: `Memantau ${targetEmp.name}: ${targetEmp.status} (${targetEmp.progress}%)`,
                }
              : e,
          )
        : employees;
    return {
      managerPatrol: {
        ...patrol,
        dwellSeconds: nextDwell,
      },
      employees: nextEmployees,
      activityLog,
    };
  }

  if (patrol.enabled) {
    const colleagues = employees.filter((e) => e.id !== 'manager');
    if (colleagues.length > 0) {
      const nextTarget =
        colleagues.find((c) => !patrol.visitedOrder.includes(c.id)) ?? colleagues[0];
      const nextVisited = patrol.visitedOrder.includes(nextTarget.id)
        ? [nextTarget.id]
        : [...patrol.visitedOrder, nextTarget.id];
      const { spot, lookAt } = computeInspectionSpotForDesk(nextTarget, employees);
      const nextEmployees = employees.map((e, i) =>
        i === managerIdx
          ? {
              ...e,
              currentActivity: `Berjalan memantau ${nextTarget.name}`,
            }
          : e,
      );
      return {
        managerPatrol: {
          ...patrol,
          phase: 'walking_to_colleague',
          targetAgentId: nextTarget.id,
          targetPos: spot,
          targetLookAt: lookAt,
          dwellSeconds: 0,
          visitedOrder: nextVisited,
        },
        employees: nextEmployees,
        activityLog,
      };
    }
  }

  const nextEmployees = employees.map((e, i) =>
    i === managerIdx
      ? {
          ...e,
          currentActivity: 'Kembali ke Meja Guru',
        }
      : e,
  );
  return {
    managerPatrol: {
      ...patrol,
      phase: 'returning_to_desk',
      targetAgentId: null,
      targetPos: managerChair.position,
      targetLookAt: [managerEmp.deskPosition[0], 0, managerEmp.deskPosition[2]],
      dwellSeconds: 0,
    },
    employees: nextEmployees,
    activityLog,
  };
}

export function stepOfficeSimulation(
  state: OfficeState,
  dtSeconds: number,
  nowMs: number = Date.now(),
): OfficeState {
  if (!state.simulationRunning || dtSeconds <= 0) {
    return state;
  }

  const scaledDt = Math.min(dtSeconds, 2) * state.simulationSpeed;
  let tasks = state.tasks.map((t) => ({ ...t }));
  let activityLog = [...state.activityLog];
  let employees = state.employees.map((e) => ({ ...e }));

  // 1. Advance active tasks & update corresponding employee state
  employees = employees.map((emp) => {
    if (emp.status === 'Error') {
      return emp;
    }

    const currentTask = emp.currentTaskId
      ? tasks.find((t) => t.id === emp.currentTaskId)
      : undefined;

    if (
      currentTask &&
      (currentTask.status === 'Working' || currentTask.status === 'Thinking')
    ) {
      const nextElapsed = currentTask.elapsedSeconds + scaledDt;
      const pct = Math.min(
        100,
        Math.round((nextElapsed / Math.max(4, currentTask.estimatedSeconds)) * 100),
      );
      const nextStatus: AgentStatus =
        pct < 28 ? 'Thinking' : pct >= 100 ? 'Completed' : 'Working';

      currentTask.elapsedSeconds = nextElapsed;
      currentTask.progress = pct;

      if (pct >= 100) {
        currentTask.status = 'Completed';
        currentTask.completedAt = nowMs;
        currentTask.outputSummary =
          currentTask.outputSummary ?? 'Selesai dengan baik di Simulasi Demo.';

        activityLog = appendLog(activityLog, {
          timestamp: nowMs,
          agentId: emp.id,
          agentName: emp.name,
          status: 'Completed',
          message: `Menyelesaikan "${currentTask.title}" (100%).`,
          taskId: currentTask.id,
          source: 'demo-sim',
        });

        return {
          ...emp,
          status: 'Completed' as AgentStatus,
          currentActivity: `Selesai: ${currentTask.title}`,
          progress: 100,
          statusUpdatedAt: nowMs,
          tasksCompleted: emp.tasksCompleted + 1,
          totalActiveSeconds: emp.totalActiveSeconds + Math.round(scaledDt),
        };
      }

      if (currentTask.status !== nextStatus) {
        currentTask.status = nextStatus;
        activityLog = appendLog(activityLog, {
          timestamp: nowMs,
          agentId: emp.id,
          agentName: emp.name,
          status: nextStatus,
          message:
            nextStatus === 'Working'
              ? `Mengerjakan "${currentTask.title}".`
              : `Menganalisis "${currentTask.title}".`,
          taskId: currentTask.id,
          source: 'demo-sim',
        });
      }

      return {
        ...emp,
        status: nextStatus,
        progress: pct,
        totalActiveSeconds: emp.totalActiveSeconds + Math.round(scaledDt),
      };
    }

    // 2. If Idle or Completed for > 4s (scaled), pick up queued task or spawn a demo cycle task
    const dwellSeconds = (nowMs - emp.statusUpdatedAt) / 1000;
    const readyForNext =
      emp.status === 'Idle'
        ? dwellSeconds >= 2.5 / state.simulationSpeed
        : emp.status === 'Completed'
          ? dwellSeconds >= 3.5 / state.simulationSpeed
          : false;

    if (readyForNext) {
      const queued = tasks.find(
        (t) => t.assigneeId === emp.id && t.status === 'Queued',
      );
      if (queued) {
        queued.status = 'Thinking';
        queued.startedAt = nowMs;
        queued.progress = 5;
        queued.elapsedSeconds = 1;

        activityLog = appendLog(activityLog, {
          timestamp: nowMs,
          agentId: emp.id,
          agentName: emp.name,
          status: 'Thinking',
          message: `Mengambil tugas antrean "${queued.title}".`,
          taskId: queued.id,
          source: 'demo-sim',
        });

        return {
          ...emp,
          status: 'Thinking' as AgentStatus,
          currentTaskId: queued.id,
          currentActivity: queued.title,
          progress: 5,
          statusUpdatedAt: nowMs,
        };
      }

      // If agent finished and has no queued tasks, transition Completed -> Idle -> subtle next autonomous demo task
      if (emp.status === 'Completed') {
        return {
          ...emp,
          status: 'Idle' as AgentStatus,
          currentTaskId: null,
          currentActivity: 'Siap menerima tugas berikutnya',
          progress: 0,
          statusUpdatedAt: nowMs,
        };
      }

      if (emp.status === 'Idle' && dwellSeconds >= 5 / state.simulationSpeed) {
        const templates = DEMO_CYCLIC_TOPICS[emp.id];
        const pick = templates[emp.tasksCompleted % templates.length];
        const newTask: OfficeTask = {
          id: nextId('task'),
          title: pick.title,
          description: `Rutinitas kerja otomatis oleh ${emp.name}.`,
          assigneeId: emp.id,
          department: emp.department,
          priority: 'Normal',
          status: 'Working',
          progress: 8,
          createdAt: nowMs,
          startedAt: nowMs,
          completedAt: null,
          estimatedSeconds: 22,
          elapsedSeconds: 1.8,
        };
        tasks = [newTask, ...tasks];

        activityLog = appendLog(activityLog, {
          timestamp: nowMs,
          agentId: emp.id,
          agentName: emp.name,
          status: 'Working',
          message: `Memulai tugas "${newTask.title}".`,
          taskId: newTask.id,
          source: 'demo-sim',
        });

        return {
          ...emp,
          status: 'Working' as AgentStatus,
          currentTaskId: newTask.id,
          currentActivity: pick.activity,
          progress: 8,
          statusUpdatedAt: nowMs,
        };
      }
    }

    return emp;
  });

  // 3. Advance active Video Production Department runs (Stages 1..7 auto-advance; Stage 8 waits for human review!)
  const videoRuns = state.videoRuns.map((run) => {
    if (run.status !== 'In Progress') {
      return run;
    }

    const stages = run.stages.map((s) => ({ ...s }));
    const activeIdx = stages.findIndex((s) => s.status === 'Active');
    if (activeIdx === -1) return run;

    const activeStage = stages[activeIdx];

    // Stage 8 is human Review & Approve gate
    if (activeStage.stageNumber === 8) {
      return {
        ...run,
        status: 'Awaiting Review' as const,
        currentStage: 8,
        stages,
      };
    }

    const stageDuration = 7.5; // seconds per stage at 1x speed
    const nextProgress = Math.min(
      100,
      activeStage.progress + (scaledDt / stageDuration) * 100,
    );
    activeStage.progress = Math.round(nextProgress);

    // Sync assigned employee's visible activity with active pipeline stage!
    const empIdx = employees.findIndex((e) => e.id === activeStage.assigneeId);
    if (empIdx !== -1 && employees[empIdx].status !== 'Error') {
      employees[empIdx] = {
        ...employees[empIdx],
        status: activeStage.progress < 25 ? 'Thinking' : 'Working',
        currentActivity: `Tahap Video ${activeStage.stageNumber}/8: ${activeStage.title}`,
        progress: activeStage.progress,
      };
    }

    if (nextProgress >= 100) {
      activeStage.status = 'Completed';
      activeStage.progress = 100;
      activeStage.completedAt = nowMs;

      const stageOwner = employees.find((e) => e.id === activeStage.assigneeId);
      const stageTaskId = nextId('vstage-task');
      tasks = [
        {
          id: stageTaskId,
          title: `Tahap ${activeStage.stageNumber}/8: ${activeStage.title} (${run.topic})`,
          description: activeStage.description,
          assigneeId: activeStage.assigneeId,
          department: stageOwner?.department ?? 'Produksi Video',
          priority: 'High',
          status: 'Completed',
          progress: 100,
          createdAt: activeStage.startedAt ?? nowMs,
          startedAt: activeStage.startedAt ?? nowMs,
          completedAt: nowMs,
          estimatedSeconds: 8,
          elapsedSeconds: 8,
          outputSummary: activeStage.artifactTitle,
        },
        ...tasks,
      ];

      activityLog = appendLog(activityLog, {
        timestamp: nowMs,
        agentId: activeStage.assigneeId,
        agentName: stageOwner?.name ?? 'Karyawan',
        status: 'Completed',
        message: `Tahap Video ${activeStage.stageNumber}/8 selesai: ${activeStage.title}.`,
        taskId: stageTaskId,
        source: 'demo-sim',
      });

      const nextStage = stages[activeIdx + 1];
      if (nextStage) {
        nextStage.status = 'Active';
        nextStage.startedAt = nowMs;
        nextStage.progress = nextStage.stageNumber === 8 ? 100 : 8;

        if (nextStage.stageNumber === 8) {
          const managerName =
            employees.find((e) => e.id === 'manager')?.name ?? 'Yendra Owner';
          activityLog = appendLog(activityLog, {
            timestamp: nowMs,
            agentId: 'manager',
            agentName: managerName,
            status: 'Completed',
            message: `Video "${run.topic}" selesai dirender & siap ditinjau.`,
            source: 'demo-sim',
          });
          return {
            ...run,
            status: 'Awaiting Review' as const,
            currentStage: 8,
            stages,
          };
        }

        return {
          ...run,
          currentStage: nextStage.stageNumber,
          stages,
        };
      }
    }

    return {
      ...run,
      stages,
    };
  });

  // 4. Advance Manager walking patrol & desk inspection loop
  const patrolStep = advanceManagerPatrol(
    state.managerPatrol,
    employees,
    activityLog,
    scaledDt,
    nowMs,
  );

  return {
    ...state,
    employees: syncEmployeeTaskCounters(patrolStep.employees, tasks),
    tasks,
    activityLog: patrolStep.activityLog,
    videoRuns,
    managerPatrol: patrolStep.managerPatrol,
    lastTickAt: nowMs,
  };
}

export interface AssignTaskInput {
  title: string;
  description: string;
  assigneeId: AgentId;
  priority: TaskPriority;
  estimatedSeconds?: number;
}

export function assignTaskToAgent(
  state: OfficeState,
  input: AssignTaskInput,
  nowMs: number = Date.now(),
): OfficeState {
  const title = input.title.trim();
  if (!title) return state;

  const targetEmp = state.employees.find((e) => e.id === input.assigneeId);
  if (!targetEmp) return state;

  const shouldStartImmediately =
    targetEmp.status === 'Idle' || targetEmp.status === 'Completed';

  const managerName =
    state.employees.find((e) => e.id === 'manager')?.name ?? 'Yendra Owner';

  const newTask: OfficeTask = {
    id: nextId('task'),
    title,
    description:
      input.description.trim() || `Ditugaskan oleh ${managerName} kepada ${targetEmp.name}.`,
    assigneeId: input.assigneeId,
    department: targetEmp.department,
    priority: input.priority,
    status: shouldStartImmediately ? 'Thinking' : 'Queued',
    progress: shouldStartImmediately ? 5 : 0,
    createdAt: nowMs,
    startedAt: shouldStartImmediately ? nowMs : null,
    completedAt: null,
    estimatedSeconds: input.estimatedSeconds ?? 24,
    elapsedSeconds: shouldStartImmediately ? 1 : 0,
  };

  const employees = state.employees.map((emp) => {
    if (emp.id !== input.assigneeId || !shouldStartImmediately) {
      return emp;
    }
    return {
      ...emp,
      status: 'Thinking' as AgentStatus,
      currentTaskId: newTask.id,
      currentActivity: newTask.title,
      progress: 5,
      statusUpdatedAt: nowMs,
    };
  });

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: input.assigneeId,
    agentName: targetEmp.name,
    status: shouldStartImmediately ? 'Thinking' : 'Idle',
    message: shouldStartImmediately
      ? `${managerName} menugaskan "${newTask.title}" — langsung dikerjakan.`
      : `${managerName} mengantrekan "${newTask.title}" (prioritas ${input.priority}).`,
    taskId: newTask.id,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    tasks: [newTask, ...state.tasks],
    activityLog,
  };
}

export function triggerAgentError(
  state: OfficeState,
  agentId: AgentId,
  reason: string = 'Simulated pipeline interruption (Demo Error).',
  nowMs: number = Date.now(),
): OfficeState {
  const emp = state.employees.find((e) => e.id === agentId);
  if (!emp) return state;

  let tasks = state.tasks.map((t) => ({ ...t }));
  let targetTaskId = emp.currentTaskId;

  if (targetTaskId) {
    const task = tasks.find((t) => t.id === targetTaskId);
    if (task) {
      task.status = 'Error';
      task.errorMessage = reason;
    }
  } else {
    const fallbackTask: OfficeTask = {
      id: nextId('task'),
      title: 'Diagnostic Check Task',
      description: 'Triggered for workstation error-recovery inspection.',
      assigneeId: agentId,
      department: emp.department,
      priority: 'High',
      status: 'Error',
      progress: 40,
      createdAt: nowMs,
      startedAt: nowMs,
      completedAt: null,
      estimatedSeconds: 20,
      elapsedSeconds: 8,
      errorMessage: reason,
    };
    tasks = [fallbackTask, ...tasks];
    targetTaskId = fallbackTask.id;
  }

  const employees = state.employees.map((e) =>
    e.id === agentId
      ? {
          ...e,
          status: 'Error' as AgentStatus,
          currentTaskId: targetTaskId,
          currentActivity: reason,
          statusUpdatedAt: nowMs,
          tasksFailed: e.tasksFailed + 1,
        }
      : e,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId,
    agentName: emp.name,
    status: 'Error',
    message: `Error state on ${emp.name}: ${reason}`,
    taskId: targetTaskId ?? undefined,
    source: 'manual',
  });

  return {
    ...state,
    employees: syncEmployeeTaskCounters(employees, tasks),
    tasks,
    activityLog,
  };
}

export function retryFailedTask(
  state: OfficeState,
  taskId: string,
  nowMs: number = Date.now(),
): OfficeState {
  const target = state.tasks.find((t) => t.id === taskId);
  if (!target || target.status !== 'Error') return state;

  const emp = state.employees.find((e) => e.id === target.assigneeId);
  if (!emp) return state;

  const tasks = state.tasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          status: 'Working' as const,
          errorMessage: undefined,
          startedAt: t.startedAt ?? nowMs,
          progress: Math.max(15, t.progress),
        }
      : t,
  );

  const employees = syncEmployeeTaskCounters(
    state.employees.map((e) =>
      e.id === target.assigneeId
        ? {
            ...e,
            status: 'Working' as AgentStatus,
            currentTaskId: target.id,
            currentActivity: `Retrying: ${target.title}`,
            progress: Math.max(15, target.progress),
            statusUpdatedAt: nowMs,
          }
        : e,
    ),
    tasks,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: target.assigneeId,
    agentName: emp.name,
    status: 'Working',
    message: `Retried failed task "${target.title}".`,
    taskId: target.id,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    tasks,
    activityLog,
  };
}

export function cancelTask(
  state: OfficeState,
  taskId: string,
  nowMs: number = Date.now(),
): OfficeState {
  const target = state.tasks.find((t) => t.id === taskId);
  if (!target) return state;

  const emp = state.employees.find((e) => e.id === target.assigneeId);
  const tasks = state.tasks.filter((t) => t.id !== taskId);

  const employees = syncEmployeeTaskCounters(
    state.employees.map((e) => {
      if (e.currentTaskId === taskId) {
        return {
          ...e,
          status: 'Idle' as AgentStatus,
          currentTaskId: null,
          currentActivity: 'Task removed from queue',
          progress: 0,
          statusUpdatedAt: nowMs,
        };
      }
      return e;
    }),
    tasks,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: target.assigneeId,
    agentName: emp?.name ?? 'Karyawan',
    status: 'Idle',
    message: `Membatalkan tugas "${target.title}".`,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    tasks,
    activityLog,
  };
}

export function startVideoProductionRun(
  state: OfficeState,
  input: VideoRunSeedInput,
  nowMs: number = Date.now(),
): OfficeState {
  const topic = input.topic.trim();
  if (!topic) return state;

  const managerName =
    state.employees.find((e) => e.id === 'manager')?.name ?? 'Yendra Owner';

  const newRun: VideoProductionRun = {
    id: nextId('vrun'),
    topic,
    format: input.format,
    status: 'In Progress',
    createdAt: nowMs,
    completedAt: null,
    currentStage: 1,
    stages: buildVideoStages(topic, input.format, nowMs, input.customArtifacts),
    geminiAssisted: Boolean(input.geminiAssisted),
  };

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: 'manager',
    agentName: managerName,
    status: 'Working',
    message: `Memulai Produksi Video 8-Tahap: "${topic}" (${input.format}).`,
    source: input.geminiAssisted ? 'gemini-api' : 'manual',
  });

  return {
    ...state,
    videoRuns: [newRun, ...state.videoRuns],
    activeVideoRunId: newRun.id,
    activityLog,
  };
}

export function approveVideoRun(
  state: OfficeState,
  runId: string,
  notes: string = 'Disetujui untuk rilis multi-kanal.',
  nowMs: number = Date.now(),
): OfficeState {
  const run = state.videoRuns.find((r) => r.id === runId);
  if (!run) return state;

  const publisherName =
    state.employees.find((e) => e.id === 'publisher')?.name ?? 'Riko';

  const videoRuns = state.videoRuns.map((r) => {
    if (r.id !== runId) return r;
    const stages = r.stages.map((s) =>
      s.stageNumber === 8
        ? {
            ...s,
            status: 'Completed' as const,
            progress: 100,
            completedAt: nowMs,
          }
        : s,
    );
    return {
      ...r,
      status: 'Approved' as const,
      completedAt: nowMs,
      reviewNotes: notes,
      stages,
    };
  });

  const publishTaskId = nextId('pub-task');
  const publishEmp = state.employees.find((e) => e.id === 'publisher');
  const tasks: OfficeTask[] = [
    {
      id: publishTaskId,
      title: `Publikasi Video: ${run.topic}`,
      description: notes,
      assigneeId: 'publisher',
      department: publishEmp?.department ?? 'Divisi Publikasi',
      priority: 'High',
      status: 'Completed',
      progress: 100,
      createdAt: nowMs,
      startedAt: nowMs,
      completedAt: nowMs,
      estimatedSeconds: 10,
      elapsedSeconds: 10,
      outputSummary: notes,
    },
    ...state.tasks,
  ];

  const employees = syncEmployeeTaskCounters(
    state.employees.map((e) =>
      e.id === 'publisher'
        ? {
            ...e,
            status: 'Completed' as AgentStatus,
            currentActivity: `Menyiapkan rilis "${run.topic}"`,
            currentTaskId: publishTaskId,
            progress: 100,
            statusUpdatedAt: nowMs,
          }
        : e,
    ),
    tasks,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: 'publisher',
    agentName: publisherName,
    status: 'Completed',
    message: `Menyetujui & menjadwalkan publikasi "${run.topic}".`,
    taskId: publishTaskId,
    source: 'manual',
  });

  return {
    ...state,
    videoRuns,
    employees,
    tasks,
    activityLog,
  };
}

export function requestVideoRevision(
  state: OfficeState,
  runId: string,
  notes: string,
  nowMs: number = Date.now(),
): OfficeState {
  const run = state.videoRuns.find((r) => r.id === runId);
  if (!run) return state;

  const editorName =
    state.employees.find((e) => e.id === 'video_editor')?.name ?? 'Rahman';

  const videoRuns = state.videoRuns.map((r) => {
    if (r.id !== runId) return r;
    const stages = r.stages.map((s) => {
      if (s.stageNumber >= 4 && s.stageNumber <= 7) {
        return {
          ...s,
          status: s.stageNumber === 4 ? ('Active' as const) : ('Pending' as const),
          progress: s.stageNumber === 4 ? 20 : 0,
          completedAt: null,
        };
      }
      if (s.stageNumber === 8) {
        return {
          ...s,
          status: 'Pending' as const,
          progress: 0,
          completedAt: null,
        };
      }
      return s;
    });

    return {
      ...r,
      status: 'In Progress' as const,
      currentStage: 4,
      reviewNotes: notes || 'Revisi diminta pada penyusunan klip & tempo.',
      stages,
    };
  });

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: 'video_editor',
    agentName: editorName,
    status: 'Working',
    message: `Revisi diminta untuk "${run.topic}" — kembali ke Tahap 4 Perakitan Klip.`,
    source: 'manual',
  });

  return {
    ...state,
    videoRuns,
    activityLog,
  };
}

export function applyExternalAgentEvent(
  state: OfficeState,
  event: ExternalAgentEvent,
  nowMs: number = Date.now(),
): OfficeState {
  const { agentId, status, activity, progress, taskTitle, errorMessage } = event.data;
  const emp = state.employees.find((e) => e.id === agentId);
  if (!emp) return state;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  let tasks = state.tasks.map((t) => ({ ...t }));
  let currentTaskId = emp.currentTaskId;
  const resolvedTaskStatus: OfficeTask['status'] =
    status === 'Idle' ? 'Queued' : status;

  if (taskTitle) {
    const existingIdx = tasks.findIndex(
      (t) =>
        t.assigneeId === agentId &&
        t.title === taskTitle &&
        t.status !== 'Completed',
    );
    if (existingIdx !== -1) {
      tasks[existingIdx] = {
        ...tasks[existingIdx],
        status: resolvedTaskStatus,
        progress: clampedProgress,
        startedAt: tasks[existingIdx].startedAt ?? nowMs,
        completedAt: status === 'Completed' ? nowMs : null,
        errorMessage,
      };
      currentTaskId = tasks[existingIdx].id;
    } else if (status !== 'Idle') {
      const newTask: OfficeTask = {
        id: nextId('evt-task'),
        title: taskTitle,
        description: `Event produksi langsung pada kanal "${event.channel}" (${event.event}).`,
        assigneeId: agentId,
        department: emp.department,
        priority: 'High',
        status: resolvedTaskStatus,
        progress: clampedProgress,
        createdAt: nowMs,
        startedAt: nowMs,
        completedAt: status === 'Completed' ? nowMs : null,
        estimatedSeconds: 30,
        elapsedSeconds: 0,
        errorMessage,
      };
      tasks = [newTask, ...tasks];
      currentTaskId = newTask.id;
    }
  } else if (currentTaskId && (status === 'Completed' || status === 'Error' || status === 'Working' || status === 'Thinking')) {
    tasks = tasks.map((t) =>
      t.id === currentTaskId
        ? {
            ...t,
            status: resolvedTaskStatus,
            progress: clampedProgress,
            completedAt: status === 'Completed' ? nowMs : t.completedAt,
            errorMessage: errorMessage ?? t.errorMessage,
          }
        : t,
    );
  }

  const employees = syncEmployeeTaskCounters(
    state.employees.map((e) =>
      e.id === agentId
        ? {
            ...e,
            status,
            currentActivity: activity,
            progress: clampedProgress,
            currentTaskId,
            statusUpdatedAt: nowMs,
          }
        : e,
    ),
    tasks,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: event.data.timestamp ?? nowMs,
    agentId,
    agentName: emp.name,
    status,
    message: `[${event.event.split('\\').pop()}] ${activity} (${clampedProgress}%)`,
    taskId: currentTaskId ?? undefined,
    source: 'webhook-event',
  });

  return {
    ...state,
    employees,
    tasks,
    activityLog,
  };
}

export function renameEmployee(
  state: OfficeState,
  agentId: AgentId,
  newName: string,
  nowMs: number = Date.now(),
): OfficeState {
  const trimmed = newName.trim().slice(0, 40);
  if (!trimmed) return state;

  const existing = state.employees.find((e) => e.id === agentId);
  if (!existing || existing.name === trimmed) return state;

  const oldName = existing.name;
  const employees = state.employees.map((e) =>
    e.id === agentId ? { ...e, name: trimmed } : e,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId,
    agentName: trimmed,
    status: existing.status,
    message: `Renamed employee "${oldName}" to "${trimmed}".`,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    activityLog,
  };
}

export function moveEmployeeSeat(
  state: OfficeState,
  agentId: AgentId,
  targetPos: [number, number, number],
  rotationY?: number,
  nowMs: number = Date.now(),
): OfficeState {
  const emp = state.employees.find((e) => e.id === agentId);
  if (!emp) return state;

  const resolvedPos = resolveValidSeatPosition(
    targetPos[0],
    targetPos[2],
    agentId,
    state.employees,
  );
  const nextRot = rotationY !== undefined ? rotationY : emp.deskRotationY;

  const employees = state.employees.map((e) =>
    e.id === agentId
      ? { ...e, deskPosition: resolvedPos, deskRotationY: nextRot }
      : e,
  );

  let managerPatrol = { ...state.managerPatrol };
  const movedManager = employees.find((e) => e.id === 'manager');
  if (agentId === 'manager' && movedManager) {
    const chair = getChairWorldSpot(movedManager);
    if (managerPatrol.phase === 'at_desk') {
      managerPatrol = {
        ...managerPatrol,
        currentPos: chair.position,
        targetPos: chair.position,
        currentYaw: chair.yaw,
        targetLookAt: [movedManager.deskPosition[0], 0, movedManager.deskPosition[2]],
      };
    } else if (managerPatrol.phase === 'returning_to_desk') {
      managerPatrol = {
        ...managerPatrol,
        targetPos: chair.position,
        targetLookAt: [movedManager.deskPosition[0], 0, movedManager.deskPosition[2]],
      };
    }
  } else if (managerPatrol.targetAgentId === agentId) {
    const movedTarget = employees.find((e) => e.id === agentId);
    if (movedTarget) {
      const { spot, lookAt } = computeInspectionSpotForDesk(movedTarget, employees);
      managerPatrol = {
        ...managerPatrol,
        targetPos: spot,
        targetLookAt: lookAt,
      };
    }
  }

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId,
    agentName: emp.name,
    status: emp.status,
    message: `Moved ${emp.name}'s workstation to (${resolvedPos[0]}, ${resolvedPos[2]}).`,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    managerPatrol,
    activityLog,
  };
}

export function rotateEmployeeSeat(
  state: OfficeState,
  agentId: AgentId,
  deltaRadians: number = Math.PI / 2,
  nowMs: number = Date.now(),
): OfficeState {
  const emp = state.employees.find((e) => e.id === agentId);
  if (!emp) return state;

  const nextRot = (emp.deskRotationY + deltaRadians) % (Math.PI * 2);
  const employees = state.employees.map((e) =>
    e.id === agentId ? { ...e, deskRotationY: nextRot } : e,
  );

  let managerPatrol = { ...state.managerPatrol };
  if (agentId === 'manager' && managerPatrol.phase === 'at_desk') {
    const movedManager = employees.find((e) => e.id === 'manager')!;
    const chair = getChairWorldSpot(movedManager);
    managerPatrol = {
      ...managerPatrol,
      currentPos: chair.position,
      targetPos: chair.position,
      currentYaw: chair.yaw,
    };
  }

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId,
    agentName: emp.name,
    status: emp.status,
    message: `Rotated ${emp.name}'s workstation 90°.`,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    managerPatrol,
    activityLog,
  };
}

export function swapEmployeeSeats(
  state: OfficeState,
  agentA: AgentId,
  agentB: AgentId,
  nowMs: number = Date.now(),
): OfficeState {
  if (agentA === agentB) return state;
  const empA = state.employees.find((e) => e.id === agentA);
  const empB = state.employees.find((e) => e.id === agentB);
  if (!empA || !empB) return state;

  const employees = state.employees.map((e) => {
    if (e.id === agentA) {
      return {
        ...e,
        deskPosition: [...empB.deskPosition] as [number, number, number],
        deskRotationY: empB.deskRotationY,
      };
    }
    if (e.id === agentB) {
      return {
        ...e,
        deskPosition: [...empA.deskPosition] as [number, number, number],
        deskRotationY: empA.deskRotationY,
      };
    }
    return e;
  });

  let managerPatrol = { ...state.managerPatrol };
  const managerEmp = employees.find((e) => e.id === 'manager');
  if ((agentA === 'manager' || agentB === 'manager') && managerEmp) {
    const chair = getChairWorldSpot(managerEmp);
    if (managerPatrol.phase === 'at_desk') {
      managerPatrol = {
        ...managerPatrol,
        currentPos: chair.position,
        targetPos: chair.position,
        currentYaw: chair.yaw,
      };
    }
  }

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: agentA,
    agentName: empA.name,
    status: empA.status,
    message: `Swapped workstation seats between ${empA.name} and ${empB.name}.`,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    managerPatrol,
    activityLog,
  };
}

export function setManagerPatrolEnabled(
  state: OfficeState,
  enabled: boolean,
  nowMs: number = Date.now(),
): OfficeState {
  const managerEmp = state.employees.find((e) => e.id === 'manager');
  if (!managerEmp) return state;
  const managerChair = getChairWorldSpot(managerEmp);

  if (enabled) {
    const colleagues = state.employees.filter((e) => e.id !== 'manager');
    if (colleagues.length === 0) return state;
    const firstTarget = colleagues[0];
    const { spot, lookAt } = computeInspectionSpotForDesk(firstTarget, state.employees);
    const startPos =
      state.managerPatrol.phase === 'at_desk'
        ? managerChair.position
        : state.managerPatrol.currentPos;

    const employees = state.employees.map((e) =>
      e.id === 'manager'
        ? { ...e, currentActivity: `Guru keliling · menuju bangku ${firstTarget.name}` }
        : e,
    );
    const activityLog = appendLog(state.activityLog, {
      timestamp: nowMs,
      agentId: 'manager',
      agentName: managerEmp.name,
      status: 'Working',
      message: `${managerEmp.name} mulai berkeliling memantau seluruh bangku kelas.`,
      source: 'manual',
    });

    return {
      ...state,
      employees,
      activityLog,
      managerPatrol: {
        ...state.managerPatrol,
        enabled: true,
        phase: 'walking_to_colleague',
        targetAgentId: firstTarget.id,
        targetPos: spot,
        targetLookAt: lookAt,
        currentPos: startPos,
        dwellSeconds: 0,
        visitedOrder: [firstTarget.id],
      },
    };
  }

  if (state.managerPatrol.phase === 'at_desk') {
    return {
      ...state,
      managerPatrol: {
        ...state.managerPatrol,
        enabled: false,
      },
    };
  }

  const employees = state.employees.map((e) =>
    e.id === 'manager'
      ? { ...e, currentActivity: 'Kembali ke Meja Guru' }
      : e,
  );
  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: 'manager',
    agentName: managerEmp.name,
    status: 'Working',
    message: `${managerEmp.name} mengakhiri patroli dan kembali ke Meja Guru.`,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    activityLog,
    managerPatrol: {
      ...state.managerPatrol,
      enabled: false,
      phase: 'returning_to_desk',
      targetAgentId: null,
      targetPos: managerChair.position,
      targetLookAt: [managerEmp.deskPosition[0], 0, managerEmp.deskPosition[2]],
      dwellSeconds: 0,
    },
  };
}

export function sendManagerToInspect(
  state: OfficeState,
  targetAgentId: AgentId,
  nowMs: number = Date.now(),
): OfficeState {
  const managerEmp = state.employees.find((e) => e.id === 'manager');
  if (!managerEmp) return state;

  if (targetAgentId === 'manager') {
    return setManagerPatrolEnabled(state, false, nowMs);
  }

  const targetEmp = state.employees.find((e) => e.id === targetAgentId);
  if (!targetEmp) return state;

  const managerChair = getChairWorldSpot(managerEmp);
  const startPos =
    state.managerPatrol.phase === 'at_desk'
      ? managerChair.position
      : state.managerPatrol.currentPos;
  const { spot, lookAt } = computeInspectionSpotForDesk(targetEmp, state.employees);

  const employees = state.employees.map((e) =>
    e.id === 'manager'
      ? { ...e, currentActivity: `Berjalan memantau ${targetEmp.name}` }
      : e,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: 'manager',
    agentName: managerEmp.name,
    status: 'Working',
    message: `${managerEmp.name} berjalan menuju meja ${targetEmp.name} untuk memantau pekerjaan.`,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    activityLog,
    managerPatrol: {
      ...state.managerPatrol,
      phase: 'walking_to_colleague',
      targetAgentId,
      targetPos: spot,
      targetLookAt: lookAt,
      currentPos: startPos,
      dwellSeconds: 0,
    },
  };
}

export interface OfficeCustomizationRecord {
  names?: Partial<Record<AgentId, string>>;
  seats?: Partial<
    Record<AgentId, { deskPosition: [number, number, number]; deskRotationY: number }>
  >;
}

const LEGACY_DEFAULT_NAMES = new Set([
  'Yendra AI Manager',
  'AI Researcher',
  'AI Scriptwriter',
  'AI Video Editor',
  'AI Graphic Designer',
  'AI Content Publisher',
  'AI Quality Control',
]);

const LEGACY_DEFAULT_OFFICE_POSITIONS: Record<AgentId, string> = {
  manager: '-4.8,-3.5',
  researcher: '-4.8,1.8',
  scriptwriter: '-1.4,-2.6',
  video_editor: '0.2,2.2',
  designer: '4.5,1.5',
  publisher: '4.5,4.2',
  qc: '1.2,4.5',
};

export function applyOfficeCustomizations(
  state: OfficeState,
  custom: OfficeCustomizationRecord | null | undefined,
): OfficeState {
  if (!custom) return state;

  const employees = state.employees.map((emp) => {
    const rawCustomName = custom.names?.[emp.id]?.trim();
    const customName =
      rawCustomName && !LEGACY_DEFAULT_NAMES.has(rawCustomName) ? rawCustomName : '';
    const customSeat = custom.seats?.[emp.id];
    const seatKey = customSeat
      ? `${customSeat.deskPosition[0]},${customSeat.deskPosition[2]}`
      : '';
    const isLegacySeat =
      seatKey !== '' && LEGACY_DEFAULT_OFFICE_POSITIONS[emp.id] === seatKey;

    return {
      ...emp,
      name: customName ? customName.slice(0, 40) : emp.name,
      deskPosition:
        customSeat && !isLegacySeat ? customSeat.deskPosition : emp.deskPosition,
      deskRotationY:
        customSeat && !isLegacySeat && typeof customSeat.deskRotationY === 'number'
          ? customSeat.deskRotationY
          : emp.deskRotationY,
    };
  });

  const managerEmp = employees.find((e) => e.id === 'manager');
  const managerPatrol = managerEmp
    ? {
        ...state.managerPatrol,
        currentPos: getChairWorldSpot(managerEmp).position,
        targetPos: getChairWorldSpot(managerEmp).position,
        currentYaw: getChairWorldSpot(managerEmp).yaw,
      }
    : state.managerPatrol;

  return {
    ...state,
    employees,
    managerPatrol,
  };
}

export function computeDashboardMetrics(state: OfficeState): DashboardMetrics {
  const totalEmployees = state.employees.length;
  const activeTasks = state.tasks.filter(
    (t) => t.status === 'Working' || t.status === 'Thinking',
  ).length;
  const queuedTasks = state.tasks.filter((t) => t.status === 'Queued').length;
  const completedTasks = state.tasks.filter((t) => t.status === 'Completed').length;
  const failedTasks = state.tasks.filter((t) => t.status === 'Error').length;
  const workingCount = state.employees.filter((e) => e.status === 'Working').length;
  const thinkingCount = state.employees.filter((e) => e.status === 'Thinking').length;
  const idleCount = state.employees.filter((e) => e.status === 'Idle').length;
  const awaitingVideoReview = state.videoRuns.filter(
    (r) => r.status === 'Awaiting Review',
  ).length;

  return {
    totalEmployees,
    activeTasks,
    queuedTasks,
    completedTasks,
    failedTasks,
    workingCount,
    thinkingCount,
    idleCount,
    awaitingVideoReview,
  };
}
