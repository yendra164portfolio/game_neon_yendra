export interface EngineeringTopic {
  slug: string;
  title: string;
  category: string;
  angle: string;
}

export const ENGINEERING_TOPIC_CATALOG: EngineeringTopic[] = [
  {
    slug: 'smartphone-internal-components',
    title: 'Cara Kerja Komponen Internal Smartphone Modern',
    category: 'Smartphones & Internal Components',
    angle: 'Bagaimana SoC, RAM bertumpuk, baterai lithium-ion, vapor chamber, dan modul OIS kamera bekerja bersamaan dalam hitungan milidetik.',
  },
  {
    slug: 'motorcycle-4stroke-transmission',
    title: 'Cara Kerja Mesin Motor 4-Tak & Sistem Transmisi',
    category: 'Motorcycle Engines & Transmission',
    angle: 'Siklus hisap, kompresi, pembakaran, buang, serta cara kopling dan gigi rasio menyalurkan torsi ke roda belakang.',
  },
  {
    slug: 'car-engine-differential-system',
    title: 'Cara Kerja Mesin Mobil & Sistem Diferensial',
    category: 'Car Engines & Mechanical Systems',
    angle: 'Bagaimana poros engkol mengubah gerak naik-turun piston menjadi putaran roda yang seimbang saat mobil berbelok.',
  },
  {
    slug: 'centrifugal-water-pump-motor',
    title: 'Cara Kerja Pompa Air & Motor Listrik Induksi',
    category: 'Water Pumps & Electric Motors',
    angle: 'Prinsip medan magnet putar pada stator-rotor motor listrik dan gaya sentrifugal impeller untuk mendorong air ke lantai atas.',
  },
  {
    slug: 'air-conditioner-refrigeration-cycle',
    title: 'Cara Kerja AC & Siklus Refrigerasi Kompresor',
    category: 'Air Conditioners & Refrigeration',
    angle: 'Perjalanan freon bertekanan tinggi melalui kompresor, kondensor, katup ekspansi, dan evaporator untuk menyerap panas ruangan.',
  },
  {
    slug: 'washing-machine-inverter-drum',
    title: 'Cara Kerja Mesin Cuci Front-Loading & Motor Inverter',
    category: 'Washing Machines',
    angle: 'Sensor beban air, penggerak direct-drive tanpa sabuk, dan gaya sentrifugal tinggi saat siklus pengeringan.',
  },
  {
    slug: 'refrigerator-thermostat-evaporator',
    title: 'Cara Kerja Kulkas & Sistem Pendingin Tertutup',
    category: 'Refrigerators',
    angle: 'Mengapa bagian belakang kulkas terasa hangat sementara ruang freezer membeku lewat perubahan fase refrigeran.',
  },
  {
    slug: 'computer-cpu-transistors-clock',
    title: 'Cara Kerja Prosesor Komputer & Miliaran Transistor',
    category: 'Computers & Processors',
    angle: 'Bagaimana gerbang logika silikon, cache L1-L3, dan sinyal clock menjalankan miliaran instruksi per detik.',
  },
  {
    slug: 'lithium-battery-electrochemistry',
    title: 'Cara Kerja Baterai Lithium-Ion & Aliran Elektron',
    category: 'Batteries & Electricity',
    angle: 'Perpindahan ion lithium antara anoda grafit dan katoda saat pengisian daya serta peran Battery Management System.',
  },
  {
    slug: 'electronic-sensors-gyro-ultrasonic',
    title: 'Cara Kerja Sensor Elektronik: MEMS Gyroscope & Ultrasonik',
    category: 'Sensors & Electronic Components',
    angle: 'Bagaimana chip mikroskopis di ponsel dan robot mendeteksi kemiringan, jarak gelombang suara, dan suhu secara presisi.',
  },
  {
    slug: 'industrial-cnc-plc-automation',
    title: 'Cara Kerja Mesin CNC & Otomasi Industri Berbasis PLC',
    category: 'Industrial Machines & Automation',
    angle: 'Koordinasi motor servo presisi tinggi, ball screw, dan Programmable Logic Controller di lini perakitan pabrik modern.',
  },
  {
    slug: 'abs-braking-hydraulic-sensors',
    title: 'Cara Kerja Rem ABS & Sistem Hidrolik Anti-Kunci',
    category: 'Car Engines & Mechanical Systems',
    angle: 'Bagaimana sensor kecepatan roda dan katup solenoid memodulasi tekanan minyak rem 15 kali per detik agar ban tidak selip.',
  },
  {
    slug: 'induction-cooktop-eddy-currents',
    title: 'Cara Kerja Kompor Induksi Tanpa Api',
    category: 'Everyday Technologies',
    angle: 'Medan magnet frekuensi tinggi memicu arus eddy di dasar panci besi sehingga panas tercipta langsung di logamnya.',
  },
  {
    slug: 'elevator-counterweight-traction',
    title: 'Cara Kerja Lift Gedung Tinggi & Pemberat Counterweight',
    category: 'Industrial Machines & Automation',
    angle: 'Mengapa lift hemat energi berkat beban penyeimbang dan bagaimana rem pengaman mekanis bekerja saat darurat.',
  },
  {
    slug: 'oled-display-pixel-matrix',
    title: 'Cara Kerja Layar OLED & Matriks Subpiksel',
    category: 'Smartphones & Internal Components',
    angle: 'Bagaimana setiap piksel organik memancarkan cahaya sendiri untuk menghasilkan warna hitam pekat dan efisiensi daya.',
  },
];

export function getJakartaDateString(nowMs: number = Date.now()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(nowMs));
}

export function getJakartaClockString(nowMs: number = Date.now()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${formatter.format(new Date(nowMs))} WIB`;
}

export function selectDailyTopics(
  usedTopicSlugs: Iterable<string>,
  count: number = 3,
): EngineeringTopic[] {
  const used = new Set(usedTopicSlugs);
  const unused = ENGINEERING_TOPIC_CATALOG.filter((t) => !used.has(t.slug));

  if (unused.length >= count) {
    return unused.slice(0, count);
  }

  // If all topics in the catalog have been covered over multiple days,
  // pick remaining unused first, then cycle oldest least-recently-used topics
  const selected = [...unused];
  for (const candidate of ENGINEERING_TOPIC_CATALOG) {
    if (selected.length >= count) break;
    if (!selected.some((s) => s.slug === candidate.slug)) {
      selected.push(candidate);
    }
  }
  return selected.slice(0, count);
}

export interface VideoProbeCheckInput {
  fileExists: boolean;
  fileSizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
}

export interface QcValidationResult {
  passed: boolean;
  reasons: string[];
}

export function validateRenderedVideoSpecs(
  probe: VideoProbeCheckInput,
): QcValidationResult {
  const reasons: string[] = [];
  if (!probe.fileExists) reasons.push('MP4 file does not exist in storage.');
  if (probe.fileSizeBytes < 20_000) {
    reasons.push(`MP4 file size too small (${probe.fileSizeBytes} bytes).`);
  }
  if (!probe.hasVideoStream) reasons.push('Missing H.264 video stream.');
  if (!probe.hasAudioStream) reasons.push('Missing AAC audio narration/music stream.');
  if (probe.width !== 1080 || probe.height !== 1920) {
    reasons.push(`Invalid resolution ${probe.width}x${probe.height}; expected 1080x1920.`);
  }
  if (probe.durationSeconds < 30 || probe.durationSeconds > 60) {
    reasons.push(
      `Duration ${probe.durationSeconds.toFixed(1)}s is outside required 30–60s range.`,
    );
  }
  return {
    passed: reasons.length === 0,
    reasons,
  };
}
