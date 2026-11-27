export interface EngineeringTopic {
  slug: string;
  title: string;
  category: string;
  angle: string;
}

export type StudioTopic = EngineeringTopic;

export const MOTIVATION_TOPIC_CATALOG: EngineeringTopic[] = [
  {
    slug: 'disiplin-mengalahkan-motivasi',
    title: 'Disiplin Kecil Setiap Hari Mengalahkan Bakat Besar',
    category: 'Disiplin & Kebiasaan',
    angle: 'Mengapa komitmen melakukan hal kecil setiap hari—bahkan saat sedang malas—membangun hasil luar biasa dibanding menunggu mood datang.',
  },
  {
    slug: 'berani-mulai-tanpa-sempurna',
    title: 'Jangan Menunggu Sempurna untuk Mulai Melangkah',
    category: 'Keberanian & Aksi',
    angle: 'Menghancurkan perfeksionisme yang melumpuhkan dan mulai bergerak dari langkah pertama yang sederhana hari ini.',
  },
  {
    slug: 'bangkit-dari-kegagalan',
    title: 'Cara Bangkit Lebih Kuat Setelah Mengalami Kegagalan',
    category: 'Ketangguhan Mental',
    angle: 'Kegagalan bukan akhir perjalanan, melainkan umpan balik berharga untuk membentuk mental pemenang yang tidak mudah tumbang.',
  },
  {
    slug: 'fokus-satu-langkah-kecil',
    title: 'Kekuatan 1% Lebih Baik Setiap Hari',
    category: 'Konsistensi & Progres',
    angle: 'Efek majemuk dari perbaikan diri sekecil 1% per hari yang diam-diam mengubah hidupmu secara drastis dalam setahun.',
  },
  {
    slug: 'berhenti-membandingkan-diri',
    title: 'Berhenti Membandingkan Prosesmu dengan Orang Lain',
    category: 'Pola Pikir & Diri',
    angle: 'Setiap orang punya garis waktu dan medan perjuangan masing-masing; fokuskan energimu untuk mengalahkan dirimu yang kemarin.',
  },
  {
    slug: 'mengubah-rasa-takut-jadi-energi',
    title: 'Mengubah Rasa Takut Gagal Menjadi Bahan Bakar',
    category: 'Keberanian & Aksi',
    angle: 'Rasa takut adalah tanda kamu sedang melangkah ke level baru—gunakan ketegangan itu sebagai dorongan untuk bersiap lebih matang.',
  },
  {
    slug: 'kebiasaan-pagi-orang-produktif',
    title: 'Ritual Pagi yang Mengubah Arah Hidupmu',
    category: 'Produktivitas & Fokus',
    angle: 'Bagaimana 30 menit pertama setelah bangun tidur menentukan ketenangan pikiran, fokus kerja, dan kemenanganmu sepanjang hari.',
  },
  {
    slug: 'seni-berkata-tidak',
    title: 'Seni Berkata Tidak Demi Melindungi Masa Depanmu',
    category: 'Manajemen Waktu',
    angle: 'Berani menolak hal yang menguras energi tanpa tujuan agar waktumu utuh untuk impian dan orang-orang yang paling berarti.',
  },
  {
    slug: 'sabar-dalam-proses-panjang',
    title: 'Mengapa Hasil Besar Selalu Membutuhkan Kesabaran',
    category: 'Ketekunan & Kesabaran',
    angle: 'Pelajaran dari akar pohon bambu: pertumbuhan terkuat sering terjadi di bawah permukaan sebelum akhirnya melesat tinggi.',
  },
  {
    slug: 'mengatasi-penundaan-prokrastinasi',
    title: 'Aturan 5 Menit untuk Menghancurkan Rasa Malas',
    category: 'Produktivitas & Fokus',
    angle: 'Trik psikologis sederhana memulai pekerjaan berat cukup selama 5 menit agar momentum kerja otomatis mengambil alih.',
  },
  {
    slug: 'keluar-dari-zona-nyaman',
    title: 'Tanda Kamu Harus Berani Keluar dari Zona Nyaman',
    category: 'Pertumbuhan Diri',
    angle: 'Rasa bosan dan gelisah adalah sinyal jiwamu siap bertumbuh—jangan tukar potensi besarmu hanya demi rasa aman sementara.',
  },
  {
    slug: 'kekuatan-lingkungan-positif',
    title: 'Lingkunganmu Menentukan Ke Mana Masa Depanmu Pergi',
    category: 'Lingkungan & Relasi',
    angle: 'Mengapa memilih teman seperjuangan dan ruang pergaulan yang sehat akan menular menjadi standar suksesmu sendiri.',
  },
  {
    slug: 'tenang-saat-hidup-tidak-pasti',
    title: 'Cara Tetap Tenang Saat Rencana Tidak Sesuai Harapan',
    category: 'Ketenangan & Stoikisme',
    angle: 'Memisahkan hal yang bisa kita kendalikan dari hal di luar kendali agar hati tetap jernih di tengah badai kehidupan.',
  },
  {
    slug: 'investasi-ilmu-dan-skill',
    title: 'Aset Terbaik yang Tidak Bisa Dicuri: Skill & Karaktermu',
    category: 'Pengembangan Diri',
    angle: 'Uang dan jabatan bisa berubah, tetapi keahlian, etos kerja, dan integritas akan selalu membukakan pintu di mana pun kamu berada.',
  },
  {
    slug: 'konsistensi-saat-sepi-dukungan',
    title: 'Tetap Melangkah Saat Belum Ada yang Mempercayaimu',
    category: 'Ketangguhan Mental',
    angle: 'Fase paling sunyi dalam perjuangan adalah ujian sesungguhnya; teruslah bekerja dalam diam sampai hasilmu berbicara.',
  },
];

export const ENGINEERING_TOPIC_CATALOG = MOTIVATION_TOPIC_CATALOG;

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
  fileReadable?: boolean;
  fileSizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  videoCodec?: string;
  audioCodec?: string;
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
  if (probe.fileReadable === false) reasons.push('MP4 file is not readable.');
  if (probe.fileSizeBytes < 20_000) {
    reasons.push(`MP4 file size too small (${probe.fileSizeBytes} bytes).`);
  }
  if (!probe.hasVideoStream) reasons.push('Missing H.264 video stream.');
  if (probe.videoCodec !== undefined && probe.videoCodec.toLowerCase() !== 'h264') {
    reasons.push(`Invalid video codec "${probe.videoCodec}"; expected h264.`);
  }
  if (!probe.hasAudioStream) reasons.push('Missing AAC audio narration/music stream.');
  if (probe.audioCodec !== undefined && probe.audioCodec.toLowerCase() !== 'aac') {
    reasons.push(`Invalid audio codec "${probe.audioCodec}"; expected aac.`);
  }
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
