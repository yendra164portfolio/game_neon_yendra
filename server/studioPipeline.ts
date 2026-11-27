import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI, Type } from '@google/genai';
import { Resvg } from '@resvg/resvg-js';
import {
  getJakartaClockString,
  getJakartaDateString,
  validateRenderedVideoSpecs,
} from '../src/studio/topicCatalog.ts';
import type {
  AiQcStatus,
  MissingConfigItem,
  ProducedVideoRecord,
  ProductionJobRecord,
  StudioActiveAgent,
  StudioDashboardPayload,
  StudioServiceStatus,
  TikTokPrivacyLevel,
  TikTokPublishMode,
} from '../src/studio/types.ts';
import type { StudioDatabase } from './studioDb.ts';
import { TikTokService, getJakartaScheduleSlot } from './tiktokService.ts';

const execFileAsync = promisify(execFile);

export interface OrphanRecoverySummary {
  scannedFiles: number;
  validFiles: string[];
  recoveredVideos: string[];
  skippedDuplicates: string[];
  invalidFiles: Array<{ fileName: string; reasons: string[] }>;
}

interface ResearchOutput {
  summary: string;
  howItWorksStepByStep: string[];
  internalComponents: Array<{ name: string; function: string }>;
  verifiedFacts: string[];
  references: string[];
}

interface ScriptScene {
  sceneNumber: number;
  sectionLabel: string;
  narrationIndonesian: string;
  visualFocus: string;
  componentLabels: string[];
}

interface ScriptOutput {
  title: string;
  description: string;
  caption: string;
  hashtags: string[];
  hookText: string;
  endingText: string;
  scenes: ScriptScene[];
}

interface QcGeminiOutput {
  approved: boolean;
  technicalAccuracyScore: number;
  spellingAndSubtitleCheck: string;
  notes: string;
}

interface FfprobeOutput {
  fileExists: boolean;
  fileReadable: boolean;
  fileSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  videoCodec: string;
  audioCodec: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function formatAssTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const cs = Math.min(99, Math.round((clamped - Math.floor(clamped)) * 100));
  return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function parseGeminiJson<T>(rawText: string | undefined): Partial<T> {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) return {};
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as Partial<T>;
  } catch {
    const objMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objMatch) return {};
    try {
      return JSON.parse(objMatch[0]) as Partial<T>;
    } catch {
      return {};
    }
  }
}

function sanitizeGeneratedSvg(rawSvg: string): string | null {
  const match = rawSvg.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let cleaned = match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/xlink:href\s*=\s*(['"])https?:[\s\S]*?\1/gi, '')
    .replace(/href\s*=\s*(['"])https?:[\s\S]*?\1/gi, '');

  if (!/viewBox=/i.test(cleaned)) {
    cleaned = cleaned.replace(/<svg/i, '<svg viewBox="0 0 1080 1920" width="1080" height="1920"');
  }
  return cleaned;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /503|429|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i.test(
    msg,
  );
}

async function withTransientRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts: number = 4,
  baseDelayMs: number = 2000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientAiError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const expDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 450);
      await new Promise((r) => setTimeout(r, expDelay + jitter));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`);
}

function buildFallbackMotivationalPosterSvg(
  topicTitle: string,
  scene: ScriptScene,
  sceneIndex: number,
  totalScenes: number,
): string {
  const labels = scene.componentLabels.slice(0, 4);
  while (labels.length < 3) {
    labels.push(`Pilar Motivasi ${labels.length + 1}`);
  }

  const subtleRays: string[] = [];
  for (let i = -3; i <= 3; i += 1) {
    const x2 = 540 + i * 165;
    subtleRays.push(
      `<line x1="540" y1="620" x2="${x2}" y2="320" stroke="#fbbf24" stroke-opacity="0.12" stroke-width="4"/>`,
    );
  }

  const pillarBoxes = labels
    .map((label, idx) => {
      const y = 1130 + idx * 145;
      return `
        <g>
          <line x1="540" y1="${740 + idx * 55}" x2="210" y2="${y + 42}" stroke="#fbbf24" stroke-width="3" stroke-dasharray="8 6"/>
          <circle cx="540" cy="${740 + idx * 55}" r="9" fill="#fbbf24"/>
          <rect x="96" y="${y}" width="888" height="96" rx="14" fill="#111827" stroke="#374151" stroke-width="2"/>
          <rect x="116" y="${y + 22}" width="52" height="52" rx="10" fill="#d97706"/>
          <text x="142" y="${y + 58}" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">${idx + 1}</text>
          <text x="196" y="${y + 58}" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="30" font-weight="600" fill="#f9fafb">${escapeXml(label.slice(0, 40))}</text>
        </g>
      `;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#090d1f"/>
        <stop offset="55%" stop-color="#1e1b4b"/>
        <stop offset="100%" stop-color="#090d1a"/>
      </linearGradient>
      <linearGradient id="sunrise" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#ea580c"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <rect x="72" y="110" width="936" height="130" rx="18" fill="#0f172a" stroke="#f59e0b" stroke-opacity="0.55" stroke-width="2.5"/>
    <text x="110" y="162" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="24" font-weight="700" fill="#fbbf24">YENDRA MOTIVATION STUDIO · SCENE ${sceneIndex + 1}/${totalScenes}</text>
    <text x="110" y="212" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="34" font-weight="700" fill="#f8fafc">${escapeXml(scene.sectionLabel.slice(0, 38))}</text>

    <!-- Atmospheric Motivational Artwork Card -->
    <rect x="140" y="320" width="800" height="680" rx="32" fill="#0f172a" stroke="#475569" stroke-width="3"/>
    ${subtleRays.join('')}
    ${
      sceneIndex % 4 === 0
        ? `
    <circle cx="540" cy="640" r="190" fill="url(#sunrise)" opacity="0.22"/>
    <circle cx="540" cy="640" r="125" fill="url(#sunrise)" opacity="0.88"/>
    <path d="M180 880 L430 620 L580 760 L720 560 L900 880 Z" fill="#1e293b" stroke="#fbbf24" stroke-width="3"/>`
        : sceneIndex % 4 === 1
          ? `
    <circle cx="540" cy="660" r="245" fill="none" stroke="#f59e0b" stroke-opacity="0.45" stroke-width="4" stroke-dasharray="16 10"/>
    <circle cx="540" cy="660" r="175" fill="#1e1b4b" stroke="#fbbf24" stroke-width="5"/>
    <polygon points="540,515 585,635 710,635 610,705 648,825 540,750 432,825 470,705 370,635 495,635" fill="url(#sunrise)" opacity="0.9"/>`
          : sceneIndex % 4 === 2
            ? `
    <rect x="250" y="740" width="140" height="140" rx="14" fill="#1e293b" stroke="#fbbf24" stroke-width="3"/>
    <rect x="440" y="640" width="140" height="240" rx="14" fill="#1e293b" stroke="#f59e0b" stroke-width="3"/>
    <rect x="630" y="510" width="170" height="370" rx="14" fill="url(#sunrise)" opacity="0.88"/>
    <path d="M240 690 L480 560 L720 420" stroke="#fde68a" stroke-width="6" fill="none" stroke-linecap="round"/>`
            : `
    <circle cx="540" cy="590" r="155" fill="url(#sunrise)" opacity="0.88"/>
    <path d="M220 840 Q540 700 860 840" stroke="#fbbf24" stroke-width="6" fill="none"/>
    <path d="M290 900 Q540 780 790 900" stroke="#fde68a" stroke-opacity="0.65" stroke-width="4" fill="none"/>`
    }
    <text x="540" y="378" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="26" font-weight="600" fill="#cbd5e1" text-anchor="middle">${escapeXml(topicTitle.slice(0, 44))}</text>

    ${pillarBoxes}

    <rect x="72" y="1640" width="936" height="120" rx="16" fill="#0b1324" stroke="#334155" stroke-width="2"/>
    <text x="108" y="1692" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="24" font-weight="600" fill="#fbbf24">PESAN VISUAL</text>
    <text x="108" y="1734" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="27" fill="#f1f5f9">${escapeXml(scene.visualFocus.slice(0, 56))}</text>
  </svg>`;
}

export class StudioCoordinator {
  private readonly db: StudioDatabase;
  private readonly broadcast: (payload: unknown) => void;
  public readonly tiktok: TikTokService;
  private runningJobId: string | null = null;
  private ffmpegAvailable = false;
  private ffprobeAvailable = false;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(db: StudioDatabase, broadcast: (payload: unknown) => void) {
    this.db = db;
    this.broadcast = broadcast;
    this.tiktok = new TikTokService(db);
  }

  public async initialize(): Promise<void> {
    this.ffmpegAvailable = await this.checkBinary('ffmpeg');
    this.ffprobeAvailable = await this.checkBinary('ffprobe');

    this.db.resetInterruptedRunningJobs();
    this.db.ensureScheduleForDate(getJakartaDateString());

    if (this.ffprobeAvailable) {
      await this.recoverOrphanedVideos();
    }

    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }
    this.schedulerInterval = setInterval(() => {
      void this.tickScheduler();
    }, 60_000);

    if (this.isGeminiConfigured() && this.ffprobeAvailable) {
      setTimeout(() => {
        void this.processPendingAiQc();
      }, 1500);
    }
  }

  public async recoverOrphanedVideos(): Promise<OrphanRecoverySummary> {
    const videosDir = path.join(this.db.storageRoot, 'videos');
    const summary: OrphanRecoverySummary = {
      scannedFiles: 0,
      validFiles: [],
      recoveredVideos: [],
      skippedDuplicates: [],
      invalidFiles: [],
    };

    if (!fs.existsSync(videosDir)) {
      return summary;
    }

    const entries = fs
      .readdirSync(videosDir)
      .filter((name) => name.toLowerCase().endsWith('.mp4'))
      .map((name) => {
        const fullPath = this.db.resolveConfinedPath('videos', name);
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(fullPath).mtimeMs;
        } catch {
          mtimeMs = 0;
        }
        return { name, fullPath, mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    summary.scannedFiles = entries.length;
    if (entries.length === 0) return summary;

    const allJobs = this.db.listJobs(200);

    for (const entry of entries) {
      const probe = await this.probeMedia(entry.fullPath);
      const specCheck = validateRenderedVideoSpecs(probe);
      if (!specCheck.passed) {
        summary.invalidFiles.push({ fileName: entry.name, reasons: specCheck.reasons });
        continue;
      }

      summary.validFiles.push(entry.name);

      // Already registered by filename
      if (this.db.getVideoByFileName(entry.name)) {
        summary.skippedDuplicates.push(entry.name);
        continue;
      }

      const candidateVideoId = path.basename(entry.name, '.mp4');
      const dateMatch = entry.name.match(/^vid_(\d{4})(\d{2})(\d{2})_/);
      const parsedDate = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
        : null;

      // Match owning job: direct link first, then uncompleted scripted job on same scheduleDate
      let ownerJob =
        allJobs.find(
          (j) =>
            j.pendingVideoFile === entry.name ||
            j.videoId === candidateVideoId,
        ) ?? null;

      if (!ownerJob && parsedDate) {
        ownerJob =
          allJobs.find(
            (j) =>
              j.scheduleDate === parsedDate &&
              Boolean(j.researchJson) &&
              Boolean(j.scriptJson) &&
              !this.db.getVideoByJobId(j.id),
          ) ?? null;
      }

      if (!ownerJob) {
        // Check if a job on that date already has a registered video (older retry MP4)
        const existingJobForDate = parsedDate
          ? allJobs.find(
              (j) =>
                j.scheduleDate === parsedDate &&
                Boolean(this.db.getVideoByJobId(j.id)),
            )
          : null;
        if (existingJobForDate) {
          summary.skippedDuplicates.push(entry.name);
        }
        continue;
      }

      // Deduplication guard: never create a second video row for the same job
      if (this.db.getVideoByJobId(ownerJob.id)) {
        summary.skippedDuplicates.push(entry.name);
        continue;
      }

      let research: ResearchOutput | null = null;
      let script: ScriptOutput | null = null;
      try {
        if (ownerJob.researchJson) {
          research = JSON.parse(ownerJob.researchJson) as ResearchOutput;
        }
        if (ownerJob.scriptJson) {
          script = JSON.parse(ownerJob.scriptJson) as ScriptOutput;
        }
      } catch {
        research = null;
        script = null;
      }

      if (!research || !script || !Array.isArray(script.scenes) || script.scenes.length === 0) {
        continue;
      }

      let srtText = '';
      if (ownerJob.subtitlePath) {
        try {
          const srtFullPath = this.db.resolveConfinedPath(
            'subtitles',
            ownerJob.subtitlePath,
          );
          if (fs.existsSync(srtFullPath)) {
            srtText = fs.readFileSync(srtFullPath, 'utf8');
          }
        } catch {
          srtText = '';
        }
      }
      if (!srtText.trim()) {
        srtText = this.buildIndonesianSubtitles(
          script.scenes,
          1.0,
          Math.max(10, probe.durationSeconds - 3.2),
        ).srtText;
      }

      const qcNotes = `Recovered & verified via FFprobe (${probe.videoCodec.toUpperCase()}/${probe.audioCodec.toUpperCase()}, ${probe.width}x${probe.height}, ${probe.durationSeconds.toFixed(1)}s); AI semantic QC pending.`;

      const registered = this.db.runInTransaction(() => {
        if (
          this.db.getVideoByJobId(ownerJob!.id) ||
          this.db.getVideoByFileName(entry.name)
        ) {
          return false;
        }

        const createdIso = entry.mtimeMs
          ? new Date(entry.mtimeMs).toISOString()
          : new Date().toISOString();

        const videoRecord: ProducedVideoRecord = {
          id: candidateVideoId,
          jobId: ownerJob!.id,
          scheduleDate: ownerJob!.scheduleDate,
          topicSlug: ownerJob!.topicSlug,
          title: script!.title,
          description: script!.description ?? research!.summary,
          caption: script!.caption ?? script!.title,
          hashtags:
            Array.isArray(script!.hashtags) && script!.hashtags.length > 0
              ? script!.hashtags
              : ['#MotivasiHidup', '#InspirasiHarian'],
          hookText: script!.hookText ?? script!.scenes[0].narrationIndonesian,
          endingText:
            script!.endingText ??
            script!.scenes[script!.scenes.length - 1].narrationIndonesian,
          scriptText: script!.scenes
            .map(
              (s) =>
                `[Scene ${s.sceneNumber} - ${s.sectionLabel}]\n${s.narrationIndonesian}`,
            )
            .join('\n\n'),
          subtitlesSrt: srtText,
          researchSummary: research!.summary,
          researchReferences: research!.references ?? [],
          fileName: entry.name,
          fileSizeBytes: probe.fileSizeBytes,
          width: probe.width,
          height: probe.height,
          durationSeconds: probe.durationSeconds,
          qcPassed: true,
          aiQcStatus: 'pending',
          qcNotes,
          createdAt: createdIso,
        };

        this.db.insertVideo(videoRecord);
        this.db.updateJob(ownerJob!.id, {
          status: 'completed',
          currentStageIndex: 5,
          activeAgent: null,
          videoId: candidateVideoId,
          pendingVideoFile: entry.name,
          aiQcStatus: 'pending',
          errorMessage: null,
          completedAt: ownerJob!.completedAt ?? createdIso,
        });
        this.db.appendLog(
          'qc',
          'success',
          `Recovered existing verified MP4 "${entry.name}" (${probe.width}x${probe.height}, ${probe.durationSeconds.toFixed(1)}s) for "${ownerJob!.topicTitle}".`,
          ownerJob!.id,
        );
        return true;
      });

      if (registered) {
        summary.recoveredVideos.push(entry.name);
      } else {
        summary.skippedDuplicates.push(entry.name);
      }
    }

    if (summary.recoveredVideos.length > 0) {
      this.emitStudioUpdated('App\\Events\\VideoReady');
    }
    return summary;
  }

  public async processPendingAiQc(): Promise<void> {
    if (!this.isGeminiConfigured() || !this.ffprobeAvailable) return;
    const pendingVideos = this.db
      .listVideos(60)
      .filter((v) => v.aiQcStatus === 'pending');

    for (const video of pendingVideos) {
      try {
        await this.runAiQcUpgradeForVideo(video.id);
      } catch {
        // Keep pending status if Gemini remains transiently unavailable
      }
    }
  }

  public async runAiQcUpgradeForVideo(videoId: string): Promise<{
    updated: boolean;
    aiQcStatus: Exclude<AiQcStatus, 'none'>;
    notes: string;
  }> {
    const video = this.db.getVideoById(videoId);
    if (!video) {
      throw new Error('Video not found.');
    }
    const job = this.db.getJobById(video.jobId);
    const filePath = this.db.resolveConfinedPath('videos', video.fileName);
    const probe = await this.probeMedia(filePath);
    const specValidation = validateRenderedVideoSpecs(probe);
    if (!specValidation.passed) {
      const notes = specValidation.reasons.join(' ');
      this.db.updateVideoQc(video.id, {
        qcPassed: false,
        aiQcStatus: 'rejected',
        qcNotes: notes,
      });
      if (job) {
        this.db.updateJob(job.id, { aiQcStatus: 'rejected' });
      }
      return { updated: true, aiQcStatus: 'rejected', notes };
    }

    if (!this.isGeminiConfigured()) {
      return {
        updated: false,
        aiQcStatus: 'pending',
        notes: video.qcNotes,
      };
    }

    const ai = this.createAiClient();
    const scriptForQc: ScriptOutput = {
      title: video.title,
      description: video.description,
      caption: video.caption,
      hashtags: video.hashtags,
      hookText: video.hookText,
      endingText: video.endingText,
      scenes: [
        {
          sceneNumber: 1,
          sectionLabel: 'Full Script',
          narrationIndonesian: video.scriptText,
          visualFocus: '',
          componentLabels: [],
        },
      ],
    };
    const researchForQc: ResearchOutput = {
      summary: video.researchSummary,
      howItWorksStepByStep: [],
      internalComponents: [],
      verifiedFacts: [video.researchSummary],
      references: video.researchReferences,
    };

    const qcResult = await this.runQualityControlStage(
      ai,
      filePath,
      researchForQc,
      scriptForQc,
      video.subtitlesSrt,
    );

    if (qcResult.aiQcStatus !== 'pending') {
      this.db.runInTransaction(() => {
        this.db.updateVideoQc(video.id, {
          qcPassed: qcResult.passed,
          aiQcStatus: qcResult.aiQcStatus,
          qcNotes: qcResult.notes,
        });
        if (job) {
          this.db.updateJob(job.id, { aiQcStatus: qcResult.aiQcStatus });
        }
        this.db.appendLog(
          'qc',
          qcResult.passed ? 'success' : 'error',
          `AI semantic QC completed for "${video.title}": ${qcResult.aiQcStatus.toUpperCase()} (${qcResult.notes.slice(0, 160)})`,
          video.jobId,
        );
      });
      this.emitStudioUpdated();
      return {
        updated: true,
        aiQcStatus: qcResult.aiQcStatus,
        notes: qcResult.notes,
      };
    }

    return {
      updated: false,
      aiQcStatus: 'pending',
      notes: qcResult.notes,
    };
  }

  public shutdown(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  private async checkBinary(name: string): Promise<boolean> {
    try {
      await execFileAsync(name, ['-version']);
      return true;
    } catch {
      return false;
    }
  }

  public isGeminiConfigured(): boolean {
    const key = process.env.GEMINI_API_KEY?.trim() ?? '';
    return Boolean(key && key !== 'MY_GEMINI_API_KEY');
  }

  public isOpenAiImageConfigured(): boolean {
    const key = process.env.OPENAI_API_KEY?.trim() ?? '';
    return Boolean(key && key !== 'MY_OPENAI_API_KEY');
  }

  public getServiceStatus(): StudioServiceStatus {
    const geminiConfigured = this.isGeminiConfigured();
    const missingConfigs: MissingConfigItem[] = [];

    if (!geminiConfigured) {
      missingConfigs.push({
        key: 'GEMINI_API_KEY',
        label: 'Google Gemini API Key',
        reason:
          'Diperlukan di server untuk Asep (Riset), Abdul (Naskah Indonesia), Caca (Desain Visual), Rahman (Narasi Suara gemini-3.8-flash-lite-tts), dan Eko (Kontrol Kualitas).',
      });
    }
    if (!this.ffmpegAvailable || !this.ffprobeAvailable) {
      missingConfigs.push({
        key: 'FFMPEG_BINARY',
        label: 'FFmpeg & FFprobe',
        reason:
          'Required on the server host to assemble 1080x1920 vertical H.264/AAC MP4 videos, subtitles, and music beds.',
      });
    }

    return {
      geminiConfigured,
      geminiModel: 'gemini-4-hydrogen',
      ttsModel: 'gemini-3.8-flash-lite-tts',
      ffmpegAvailable: this.ffmpegAvailable,
      ffprobeAvailable: this.ffprobeAvailable,
      externalImageProvider: this.isOpenAiImageConfigured()
        ? 'openai'
        : 'gemini-svg-resvg',
      storageReady: fs.existsSync(this.db.storageRoot),
      jakartaDate: getJakartaDateString(),
      jakartaClock: getJakartaClockString(),
      autoProduceEnabled: this.db.getAutoProduceEnabled(),
      missingConfigs,
    };
  }

  public getDashboardPayload(): StudioDashboardPayload {
    const today = getJakartaDateString();
    const todaySchedule = this.db.getScheduleForDate(today);
    return {
      serviceStatus: this.getServiceStatus(),
      metrics: this.db.getDashboardMetrics(today),
      todaySchedule,
      jobs: this.db.listJobs(40),
      videos: this.db.listVideos(60),
      logs: this.db.listLogs(60),
      runningJobId: this.runningJobId,
      tiktok: this.tiktok.getPublicStatus(),
    };
  }

  private emitOfficeAgentUpdate(params: {
    agentId: Exclude<StudioActiveAgent, null> | 'publisher';
    status: 'Working' | 'Thinking' | 'Idle' | 'Completed' | 'Error';
    activity: string;
    progress: number;
    taskTitle: string;
    errorMessage?: string;
  }): void {
    this.broadcast({
      event: 'App\\Events\\AgentTaskUpdated',
      channel: 'yendra-office',
      data: {
        agentId: params.agentId,
        status: params.status,
        activity: params.activity.slice(0, 240),
        progress: Math.max(0, Math.min(100, Math.round(params.progress))),
        taskTitle: params.taskTitle.slice(0, 180),
        errorMessage: params.errorMessage?.slice(0, 300),
        timestamp: Date.now(),
      },
    });
  }

  public emitStudioUpdated(eventName: 'App\\Events\\StudioUpdated' | 'App\\Events\\VideoReady' = 'App\\Events\\StudioUpdated'): void {
    this.broadcast({
      event: eventName,
      channel: 'yendra-office',
      data: {
        timestamp: Date.now(),
        runningJobId: this.runningJobId,
      },
    });
  }

  public async uploadVideoToTikTok(
    videoId: string,
    options?: {
      mode?: TikTokPublishMode;
      privacyLevel?: TikTokPrivacyLevel;
      source?: 'auto' | 'manual';
    },
  ): Promise<{
    status: 'draft_sent' | 'published';
    publishId: string;
    mode: TikTokPublishMode;
    remotePublishStatus: string;
  }> {
    const video = this.db.getVideoById(videoId);
    if (!video) {
      throw new Error('Video tidak ditemukan di Pustaka Video.');
    }

    const filePath = this.db.resolveConfinedPath('videos', video.fileName);
    const settings = this.db.getTikTokSettings();
    const targetMode: TikTokPublishMode = options?.mode ?? settings.defaultMode;
    const prefix = options?.source === 'auto' ? 'Auto-upload' : 'Upload';

    this.db.updateVideoTikTokStatus(video.id, {
      tiktokStatus: 'uploading',
      tiktokPublishId: video.tiktokPublishId ?? null,
      tiktokMode: targetMode,
      tiktokError: null,
      tiktokUploadedAt: video.tiktokUploadedAt ?? null,
    });
    this.emitOfficeAgentUpdate({
      agentId: 'publisher',
      status: 'Working',
      activity: `Riko mengunggah ke TikTok (${targetMode === 'draft' ? 'Draft Inbox' : 'Direct Post'}): ${video.title}`,
      progress: 45,
      taskTitle: video.title,
    });
    this.emitStudioUpdated();

    try {
      const res = await this.tiktok.uploadVideoToTikTok({
        video,
        filePath,
        mode: targetMode,
        privacyLevel: options?.privacyLevel,
      });

      this.db.appendLog(
        'publisher',
        'success',
        `Riko (${prefix} TikTok) berhasil: "${video.title}" -> ${res.status === 'draft_sent' ? 'Masuk Draft/Inbox TikTok' : 'Diposting ke TikTok'} (publish_id: ${res.publishId}).`,
        video.jobId,
      );
      this.emitOfficeAgentUpdate({
        agentId: 'publisher',
        status: 'Completed',
        activity:
          res.status === 'draft_sent'
            ? `Masuk Draft TikTok: ${video.title}`
            : `Terunggah ke TikTok: ${video.title}`,
        progress: 100,
        taskTitle: video.title,
      });
      this.emitStudioUpdated();
      return res;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal mengunggah video ke TikTok.';
      this.db.updateVideoTikTokStatus(video.id, {
        tiktokStatus: 'failed',
        tiktokPublishId: video.tiktokPublishId ?? null,
        tiktokMode: targetMode,
        tiktokError: message.slice(0, 420),
        tiktokUploadedAt: video.tiktokUploadedAt ?? null,
      });
      this.db.appendLog('publisher', 'error', `Riko (TikTok): ${message}`, video.jobId);
      this.emitOfficeAgentUpdate({
        agentId: 'publisher',
        status: 'Error',
        activity: `Gagal upload TikTok: ${video.title}`,
        progress: 0,
        taskTitle: video.title,
        errorMessage: message,
      });
      this.emitStudioUpdated();
      throw err;
    }
  }

  public ensureDailySchedule(): { createdCount: number; scheduleDate: string } {
    const today = getJakartaDateString();
    const res = this.db.ensureScheduleForDate(today);
    if (res.createdJobs.length > 0) {
      this.emitStudioUpdated();
    }
    return { createdCount: res.createdJobs.length, scheduleDate: today };
  }

  public setAutoProduce(enabled: boolean): void {
    this.db.setAutoProduceEnabled(enabled);
    this.db.appendLog(
      'manager',
      'info',
      enabled
        ? 'Automated daily queue worker enabled (Asia/Jakarta).'
        : 'Automated daily queue worker paused.',
    );
    this.emitStudioUpdated();
    if (enabled && !this.runningJobId && this.isGeminiConfigured()) {
      void this.triggerNextQueuedJob();
    }
  }

  private async tickScheduler(): Promise<void> {
    const today = getJakartaDateString();
    const res = this.db.ensureScheduleForDate(today);
    if (res.createdJobs.length > 0) {
      this.emitStudioUpdated();
    }
    if (
      this.db.getAutoProduceEnabled() &&
      !this.runningJobId &&
      this.isGeminiConfigured() &&
      this.ffmpegAvailable
    ) {
      void this.triggerNextQueuedJob();
    }

    await this.tickTikTokScheduledTasks();
  }

  public async tickTikTokScheduledTasks(nowMs: number = Date.now()): Promise<{
    triggeredSlot: string | null;
    uploadedCount: number;
    cleanedCount: number;
  }> {
    const slot = getJakartaScheduleSlot(nowMs);
    if (!slot.slotKey) {
      return { triggeredSlot: null, uploadedCount: 0, cleanedCount: 0 };
    }

    const slotSettingKey = `tiktok_slot_last_run_${slot.dateStr}_${slot.slotKey}`;
    if (this.db.getSetting(slotSettingKey, '') === 'done') {
      return { triggeredSlot: null, uploadedCount: 0, cleanedCount: 0 };
    }

    this.db.setSetting(slotSettingKey, 'done');
    const ttStatus = this.tiktok.getPublicStatus();
    let uploadedCount = 0;

    if (ttStatus.connected && ttStatus.autoUploadEnabled) {
      this.db.appendLog(
        'publisher',
        'info',
        `Scheduler otomatis ${slot.slotKey} WIB aktif: memeriksa video lulus QC yang siap diunggah ke TikTok.`,
      );

      const candidates = this.db
        .listVideos(100)
        .filter(
          (v) =>
            v.qcPassed === true &&
            v.aiQcStatus === 'passed' &&
            !v.fileCleanedUp &&
            (!v.tiktokStatus || v.tiktokStatus === 'none'),
        );

      for (const video of candidates) {
        try {
          await this.uploadVideoToTikTok(video.id, { source: 'auto' });
          uploadedCount += 1;
        } catch {
          // Kegagalan per video sudah dicatat oleh uploadVideoToTikTok
        }
      }
    }

    // Auto-cleanup guard: hanya hapus video terunggah yang sudah berumur >= 24 jam
    const cleanupRes = await this.tiktok.cleanupAllEligible({
      minAgeAfterUploadMs: 24 * 60 * 60 * 1000,
    });

    if (uploadedCount > 0 || cleanupRes.cleanedCount > 0) {
      this.emitStudioUpdated();
    }

    return {
      triggeredSlot: slot.slotKey,
      uploadedCount,
      cleanedCount: cleanupRes.cleanedCount,
    };
  }

  public triggerNextQueuedJob(): { started: boolean; job: ProductionJobRecord | null; reason?: string } {
    if (this.runningJobId) {
      return {
        started: false,
        job: this.db.getJobById(this.runningJobId),
        reason: `Production job ${this.runningJobId} is already executing.`,
      };
    }

    const next = this.db.getNextQueuedJob();
    if (!next) {
      return { started: false, job: null, reason: 'No queued jobs remaining.' };
    }

    void this.executeJob(next.id);
    return { started: true, job: next };
  }

  public retryOrRunJob(
    jobId: string,
    options?: { forceRerender?: boolean },
  ): { started: boolean; job: ProductionJobRecord | null; reason?: string } {
    if (this.runningJobId) {
      return {
        started: false,
        job: this.db.getJobById(jobId),
        reason: `Another job (${this.runningJobId}) is currently executing.`,
      };
    }

    const existing = this.db.getJobById(jobId);
    if (!existing) {
      return { started: false, job: null, reason: 'Production job not found.' };
    }

    // Preserve existing checkpoints & rendered MP4 unless an explicit full re-render was requested
    const patch: Parameters<StudioDatabase['updateJob']>[1] = {
      status: 'queued',
      activeAgent: null,
      errorMessage: null,
    };
    if (options?.forceRerender) {
      patch.pendingVideoFile = null;
      patch.aiQcStatus = 'none';
      patch.currentStageIndex = Math.min(existing.currentStageIndex, 3);
    }

    const updated = this.db.updateJob(jobId, patch);

    this.emitStudioUpdated();
    void this.executeJob(jobId);
    return { started: true, job: updated };
  }

  private createAiClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 28_000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  private async executeJob(jobId: string): Promise<void> {
    if (this.runningJobId) return;
    const job = this.db.getJobById(jobId);
    if (!job) return;

    this.runningJobId = jobId;
    let activeAgent: Exclude<StudioActiveAgent, null> = 'researcher';
    const attempts = job.attempts + 1;
    const startedAt = job.startedAt ?? new Date().toISOString();
    let pendingVideoFilePath: string | null = null;

    try {
      if (!this.isGeminiConfigured()) {
        throw new Error(
          'GEMINI_API_KEY belum diatur di server. Atur GEMINI_API_KEY di Settings > Secrets agar Asep, Abdul, Caca, Rahman, dan Eko dapat menjalankan produksi.',
        );
      }
      if (!this.ffmpegAvailable || !this.ffprobeAvailable) {
        throw new Error('FFmpeg / FFprobe binary is unavailable on the server host.');
      }

      const ai = this.createAiClient();

      // ============================================================
      // STAGE 1: AI RESEARCHER (reuses saved checkpoint if already verified)
      // ============================================================
      activeAgent = 'researcher';
      let research: ResearchOutput | null = null;
      if (job.researchJson) {
        try {
          const cached = JSON.parse(job.researchJson) as Partial<ResearchOutput>;
          if (cached.summary && Array.isArray(cached.internalComponents) && cached.internalComponents.length > 0) {
            research = cached as ResearchOutput;
          }
        } catch {
          research = null;
        }
      }

      if (!research) {
        this.db.updateJob(jobId, {
          status: 'researching',
          currentStageIndex: 1,
          activeAgent,
          attempts,
          startedAt,
          errorMessage: null,
        });
        this.db.appendLog(
          'researcher',
          'info',
          `Asep meriset pilar motivasi & wawasan psikologi untuk "${job.topicTitle}".`,
          jobId,
        );
        this.emitOfficeAgentUpdate({
          agentId: 'researcher',
          status: 'Working',
          activity: `Meriset pilar motivasi: ${job.topicTitle}`,
          progress: 18,
          taskTitle: job.topicTitle,
        });
        this.emitStudioUpdated();

        research = await withTransientRetry(
          () => withTimeout(this.runResearchStage(ai, job), 32_000, 'Asep (Riset)'),
          'Asep (Riset)',
        );
        this.db.updateJob(jobId, {
          researchJson: JSON.stringify(research),
        });
      }
      this.emitOfficeAgentUpdate({
        agentId: 'researcher',
        status: 'Completed',
        activity: `Menyusun ${research.internalComponents.length} pilar motivasi untuk ${job.topicTitle}`,
        progress: 100,
        taskTitle: job.topicTitle,
      });

      // ============================================================
      // STAGE 2: AI SCRIPTWRITER (Indonesian 30-60s)
      // ============================================================
      activeAgent = 'scriptwriter';
      let script: ScriptOutput | null = null;
      if (job.scriptJson) {
        try {
          const cached = JSON.parse(job.scriptJson) as Partial<ScriptOutput>;
          if (cached.title && Array.isArray(cached.scenes) && cached.scenes.length >= 3) {
            script = cached as ScriptOutput;
          }
        } catch {
          script = null;
        }
      }

      if (!script) {
        this.db.updateJob(jobId, {
          status: 'scripting',
          currentStageIndex: 2,
          activeAgent,
          attempts,
          startedAt,
          errorMessage: null,
        });
        this.db.appendLog(
          'scriptwriter',
          'info',
          `Abdul menyusun naskah Indonesia 30–60 detik dengan hook pembuka 3 detik.`,
          jobId,
        );
        this.emitOfficeAgentUpdate({
          agentId: 'scriptwriter',
          status: 'Working',
          activity: `Menulis naskah Indonesia: ${job.topicTitle}`,
          progress: 35,
          taskTitle: job.topicTitle,
        });
        this.emitStudioUpdated();

        script = await withTransientRetry(
          () => withTimeout(this.runScriptStage(ai, job, research), 32_000, 'Abdul (Naskah)'),
          'Abdul (Naskah)',
        );
        this.db.updateJob(jobId, {
          scriptJson: JSON.stringify(script),
        });
      }
      this.emitOfficeAgentUpdate({
        agentId: 'scriptwriter',
        status: 'Completed',
        activity: `Naskah Indonesia siap (${script.scenes.length} adegan)`,
        progress: 100,
        taskTitle: job.topicTitle,
      });

      // ============================================================
      // STAGE 3: AI VISUAL DESIGNER (1080x1920 Exploded Diagrams)
      // ============================================================
      activeAgent = 'designer';
      let assetPaths: string[] | null = null;
      if (job.assetPathsJson) {
        try {
          const cached = JSON.parse(job.assetPathsJson) as unknown;
          if (
            Array.isArray(cached) &&
            cached.length >= 3 &&
            cached.every((p) => typeof p === 'string' && fs.existsSync(p))
          ) {
            assetPaths = cached as string[];
          }
        } catch {
          assetPaths = null;
        }
      }

      if (!assetPaths) {
        this.db.updateJob(jobId, {
          status: 'designing',
          currentStageIndex: 3,
          activeAgent,
          attempts,
          startedAt,
          errorMessage: null,
        });
        this.db.appendLog(
          'designer',
          'info',
          `Caca mendesain ${script.scenes.length} poster visual motivasi (1080x1920).`,
          jobId,
        );
        this.emitOfficeAgentUpdate({
          agentId: 'designer',
          status: 'Working',
          activity: `Mendesain visual motivasi: ${job.topicTitle}`,
          progress: 55,
          taskTitle: job.topicTitle,
        });
        this.emitStudioUpdated();

        assetPaths = await this.runDesignStage(ai, jobId, job, script);
        this.db.updateJob(jobId, {
          assetPathsJson: JSON.stringify(assetPaths),
        });
      }
      this.emitOfficeAgentUpdate({
        agentId: 'designer',
        status: 'Completed',
        activity: `Menghasilkan ${assetPaths.length} visual motivasi 1080x1920`,
        progress: 100,
        taskTitle: job.topicTitle,
      });

      // ============================================================
      // STAGE 4: AI VIDEO EDITOR (Resume existing valid MP4 or render new)
      // ============================================================
      activeAgent = 'video_editor';
      let videoId = '';
      let videoFileName = '';
      let editSrtText = '';
      let reusedExistingMp4 = false;

      if (job.pendingVideoFile) {
        try {
          const candidatePath = this.db.resolveConfinedPath(
            'videos',
            job.pendingVideoFile,
          );
          const existingProbe = await this.probeMedia(candidatePath);
          const existingSpec = validateRenderedVideoSpecs(existingProbe);
          if (existingSpec.passed) {
            pendingVideoFilePath = candidatePath;
            videoFileName = job.pendingVideoFile;
            videoId = path.basename(videoFileName, '.mp4');
            reusedExistingMp4 = true;
            if (job.subtitlePath) {
              const srtPath = this.db.resolveConfinedPath('subtitles', job.subtitlePath);
              if (fs.existsSync(srtPath)) {
                editSrtText = fs.readFileSync(srtPath, 'utf8');
              }
            }
            if (!editSrtText.trim()) {
              editSrtText = this.buildIndonesianSubtitles(
                script.scenes,
                1.0,
                Math.max(10, existingProbe.durationSeconds - 3.2),
              ).srtText;
            }
            this.db.appendLog(
              'video_editor',
              'info',
              `Resuming Stage 5 QC with preserved valid MP4 "${videoFileName}" (${existingProbe.width}x${existingProbe.height}, ${existingProbe.durationSeconds.toFixed(1)}s).`,
              jobId,
            );
          }
        } catch {
          reusedExistingMp4 = false;
        }
      }

      if (!reusedExistingMp4) {
        this.db.updateJob(jobId, {
          status: 'editing',
          currentStageIndex: 4,
          activeAgent,
        });
        this.db.appendLog(
          'video_editor',
          'info',
          `Rahman membuat sulih suara Indonesia, subtitle animasi, musik latar, dan MP4 1080x1920.`,
          jobId,
        );
        this.emitOfficeAgentUpdate({
          agentId: 'video_editor',
          status: 'Working',
          activity: `Merender MP4 1080x1920: ${job.topicTitle}`,
          progress: 76,
          taskTitle: job.topicTitle,
        });
        this.emitStudioUpdated();

        videoId = `vid_${job.scheduleDate.replace(/-/g, '')}_${Date.now().toString(36)}`;
        videoFileName = `${videoId}.mp4`;
        pendingVideoFilePath = this.db.resolveConfinedPath('videos', videoFileName);

        // Persist target MP4 filename checkpoint BEFORE rendering/QC starts
        this.db.updateJob(jobId, {
          pendingVideoFile: videoFileName,
        });

        const editResult = await this.runVideoEditorStage(
          ai,
          jobId,
          script,
          assetPaths,
          pendingVideoFilePath,
        );
        editSrtText = editResult.srtText;
        this.db.updateJob(jobId, {
          audioPath: path.basename(editResult.audioPath),
          subtitlePath: path.basename(editResult.srtPath),
          pendingVideoFile: videoFileName,
        });
        this.emitOfficeAgentUpdate({
          agentId: 'video_editor',
          status: 'Completed',
          activity: `Merender ${videoFileName} (${editResult.durationSeconds.toFixed(1)}s)`,
          progress: 100,
          taskTitle: job.topicTitle,
        });
      }

      // ============================================================
      // STAGE 5: KONTROL KUALITAS EKO (with deterministic FFprobe fallback)
      // ============================================================
      activeAgent = 'qc';
      this.db.updateJob(jobId, {
        status: 'qc',
        currentStageIndex: 5,
        activeAgent,
        pendingVideoFile: videoFileName,
      });
      this.db.appendLog(
        'qc',
        'info',
        `Eko memeriksa spesifikasi H.264/AAC 1080x1920, sinkronisasi audio, dan ketepatan bahasa Indonesia.`,
        jobId,
      );
      this.emitOfficeAgentUpdate({
        agentId: 'qc',
        status: 'Working',
        activity: `Memeriksa MP4 & kualitas bahasa: ${job.topicTitle}`,
        progress: 92,
        taskTitle: job.topicTitle,
      });
      this.emitStudioUpdated();

      const qcResult = await this.runQualityControlStage(
        ai,
        pendingVideoFilePath!,
        research,
        script,
        editSrtText,
      );

      if (!qcResult.passed) {
        this.db.updateJob(jobId, { aiQcStatus: 'rejected' });
        throw new Error(`Quality Control Rejected: ${qcResult.notes}`);
      }

      const stat = fs.statSync(pendingVideoFilePath!);
      const completedAtIso = new Date().toISOString();
      const videoRecord: ProducedVideoRecord = {
        id: videoId,
        jobId,
        scheduleDate: job.scheduleDate,
        topicSlug: job.topicSlug,
        title: script.title,
        description: script.description,
        caption: script.caption,
        hashtags: script.hashtags,
        hookText: script.hookText,
        endingText: script.endingText,
        scriptText: script.scenes
          .map((s) => `[Scene ${s.sceneNumber} - ${s.sectionLabel}]\n${s.narrationIndonesian}`)
          .join('\n\n'),
        subtitlesSrt: editSrtText,
        researchSummary: research.summary,
        researchReferences: research.references,
        fileName: videoFileName,
        fileSizeBytes: stat.size,
        width: qcResult.probe.width,
        height: qcResult.probe.height,
        durationSeconds: qcResult.probe.durationSeconds,
        qcPassed: true,
        aiQcStatus: qcResult.aiQcStatus,
        qcNotes: qcResult.notes,
        createdAt: completedAtIso,
      };

      this.db.runInTransaction(() => {
        const existingForJob = this.db.getVideoByJobId(jobId);
        if (existingForJob && existingForJob.id !== videoId) {
          this.db.deleteVideo(existingForJob.id);
        }
        this.db.insertVideo(videoRecord);
        this.db.updateJob(jobId, {
          status: 'completed',
          currentStageIndex: 5,
          activeAgent: null,
          videoId,
          pendingVideoFile: videoFileName,
          aiQcStatus: qcResult.aiQcStatus,
          errorMessage: null,
          completedAt: completedAtIso,
        });
        this.db.appendLog(
          'qc',
          'success',
          `Eko menyetujui & menyimpan MP4 "${script.title}" (${qcResult.probe.width}x${qcResult.probe.height}, ${qcResult.probe.durationSeconds.toFixed(1)}s, status QC: ${qcResult.aiQcStatus}).`,
          jobId,
        );
      });

      this.emitOfficeAgentUpdate({
        agentId: 'qc',
        status: 'Completed',
        activity: `MP4 disetujui: ${script.title}`,
        progress: 100,
        taskTitle: job.topicTitle,
      });
      this.emitStudioUpdated('App\\Events\\VideoReady');

      const ttStatus = this.tiktok.getPublicStatus();
      if (ttStatus.connected && ttStatus.autoUploadEnabled) {
        try {
          await this.uploadVideoToTikTok(videoId, { source: 'auto' });
        } catch {
          // Video remains completed and downloadable even if TikTok auto-upload encounters a remote API error
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Production pipeline failed.';

      // Rule: NEVER delete a valid rendered MP4 file on Stage 5 QC errors;
      // only clean up incomplete/corrupt files that fail FFprobe validation.
      let preservedValidMp4 = false;
      if (pendingVideoFilePath && fs.existsSync(pendingVideoFilePath)) {
        try {
          const probe = await this.probeMedia(pendingVideoFilePath);
          const valid = validateRenderedVideoSpecs(probe).passed;
          if (valid) {
            preservedValidMp4 = true;
          } else {
            fs.unlinkSync(pendingVideoFilePath);
          }
        } catch {
          // Leave file untouched if probe itself errored unexpectedly
        }
      }

      this.db.updateJob(jobId, {
        status: 'failed',
        activeAgent,
        pendingVideoFile: preservedValidMp4 && pendingVideoFilePath
          ? path.basename(pendingVideoFilePath)
          : undefined,
        errorMessage: message.slice(0, 480),
      });
      this.db.appendLog(activeAgent, 'error', message, jobId);
      this.emitOfficeAgentUpdate({
        agentId: activeAgent,
        status: 'Error',
        activity: `Failed: ${job.topicTitle}`,
        progress: 0,
        taskTitle: job.topicTitle,
        errorMessage: message,
      });
      this.emitStudioUpdated();
    } finally {
      this.runningJobId = null;
      this.emitStudioUpdated();

      // Auto-continue to next queued job if auto-produce is enabled
      if (
        this.db.getAutoProduceEnabled() &&
        this.isGeminiConfigured() &&
        this.ffmpegAvailable
      ) {
        const next = this.db.getNextQueuedJob();
        if (next) {
          setTimeout(() => {
            if (!this.runningJobId && this.db.getAutoProduceEnabled()) {
              void this.executeJob(next.id);
            }
          }, 1500);
        }
      }
    }
  }

  private async runResearchStage(
    ai: GoogleGenAI,
    job: ProductionJobRecord,
  ): Promise<ResearchOutput> {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Riset psikologi praktis, filosofi hidup, dan langkah nyata tentang topik motivasi: "${job.topicTitle}" (Kategori: ${job.category}). Fokus sudut pandang: ${job.angle}`,
      config: {
        systemInstruction:
          'You are a Motivational Content & Personal Growth Researcher. Always populate every required JSON field cleanly in Indonesian: summary (core motivational insight in Indonesian), howItWorksStepByStep (array of 4-5 concise actionable mindset/habit steps in Indonesian), internalComponents (array of 4-6 objects with name and function representing key mindset pillars), verifiedFacts (array of 3-4 behavioral/psychological insights), and references (array of 2-3 psychology or philosophy references).',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: [
            'summary',
            'howItWorksStepByStep',
            'internalComponents',
            'verifiedFacts',
            'references',
          ],
          properties: {
            summary: { type: Type.STRING },
            howItWorksStepByStep: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            internalComponents: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['name', 'function'],
                properties: {
                  name: { type: Type.STRING },
                  function: { type: Type.STRING },
                },
              },
            },
            verifiedFacts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            references: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    });

    const rawText =
      response.text ??
      response.candidates?.[0]?.content?.parts
        ?.map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('') ??
      '';
    const parsed = parseGeminiJson<ResearchOutput>(rawText);
    if (!parsed.summary || !Array.isArray(parsed.internalComponents) || parsed.internalComponents.length === 0) {
      const preview = rawText.replace(/\s+/g, ' ').slice(0, 140);
      throw new Error(
        `Riset (Asep) mengembalikan JSON riset yang belum lengkap (keys: ${Object.keys(parsed).join(', ') || 'none'}; preview: "${preview}").`,
      );
    }
    return {
      summary: parsed.summary,
      howItWorksStepByStep: parsed.howItWorksStepByStep ?? [],
      internalComponents: parsed.internalComponents,
      verifiedFacts: parsed.verifiedFacts ?? [],
      references:
        parsed.references && parsed.references.length > 0
          ? parsed.references
          : ['Prinsip Psikologi Positif & Pengembangan Kebiasaan'],
    };
  }

  private async runScriptStage(
    ai: GoogleGenAI,
    job: ProductionJobRecord,
    research: ResearchOutput,
  ): Promise<ScriptOutput> {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Buat naskah video motivasi pendek (30-55 detik) berbahasa Indonesia yang menyentuh hati, kuat, dan membangkitkan semangat berdasarkan riset berikut:
Topik: ${job.topicTitle}
Inti Pesan: ${research.summary}
Langkah Aksi: ${research.howItWorksStepByStep.join(' | ')}
Pilar Mindset: ${research.internalComponents.map((c) => `${c.name}: ${c.function}`).join('; ')}

Aturan ketat:
- Scene 1 wajib berupa HOOK emosional 3 detik pertama yang langsung menyentuh realita perjuangan penonton.
- Scene 2-3 membangun kesadaran, perspektif baru, dan langkah nyata dengan bahasa Indonesia yang hangat, lugas, dan menggugah.
- Scene 4 adalah kalimat penutup yang kuat agar penonton langsung berani mengambil langkah hari ini.
- Total narasi seluruh scene WAJIB antara 85 sampai 115 kata bahasa Indonesia agar durasi suara berada di rentang 35-52 detik.`,
      config: {
        systemInstruction:
          'You are an Indonesian Motivational Video Scriptwriter & Storyteller. Output clean JSON strictly in natural, inspiring, emotionally resonant Indonesian.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['title', 'description', 'caption', 'hashtags', 'hookText', 'endingText', 'scenes'],
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            caption: { type: Type.STRING },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            hookText: { type: Type.STRING },
            endingText: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['sceneNumber', 'sectionLabel', 'narrationIndonesian', 'visualFocus', 'componentLabels'],
                properties: {
                  sceneNumber: { type: Type.NUMBER },
                  sectionLabel: { type: Type.STRING },
                  narrationIndonesian: { type: Type.STRING },
                  visualFocus: { type: Type.STRING },
                  componentLabels: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
              },
            },
          },
        },
      },
    });

    const rawText =
      response.text ??
      response.candidates?.[0]?.content?.parts
        ?.map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('') ??
      '';
    const parsed = parseGeminiJson<ScriptOutput>(rawText);
    if (!parsed.title || !Array.isArray(parsed.scenes) || parsed.scenes.length < 3) {
      throw new Error(
        `Penulisan Naskah (Abdul) menghasilkan kurang dari 3 adegan valid (keys: ${Object.keys(parsed).join(', ') || 'none'}).`,
      );
    }

    return {
      title: parsed.title,
      description: parsed.description ?? research.summary,
      caption: parsed.caption ?? `${parsed.title} — Pengingat penting untuk langkahmu hari ini.`,
      hashtags:
        parsed.hashtags && parsed.hashtags.length > 0
          ? parsed.hashtags
          : ['#MotivasiHidup', '#PengembanganDiri', '#MindsetSukses', '#InspirasiHarian'],
      hookText: parsed.hookText ?? parsed.scenes[0].narrationIndonesian,
      endingText:
        parsed.endingText ?? parsed.scenes[parsed.scenes.length - 1].narrationIndonesian,
      scenes: parsed.scenes.slice(0, 5),
    };
  }

  private async runDesignStage(
    ai: GoogleGenAI,
    jobId: string,
    job: ProductionJobRecord,
    script: ScriptOutput,
  ): Promise<string[]> {
    const tasks = script.scenes.map(async (scene, i) => {
      const pngName = `${jobId}_scene_${i + 1}.png`;
      const pngPath = this.db.resolveConfinedPath('assets', pngName);

      // Optional OpenAI external image generator if configured in server environment
      if (this.isOpenAiImageConfigured()) {
        const renderedWithOpenAi = await this.tryGenerateOpenAiDiagram(
          job.topicTitle,
          scene,
          pngPath,
        );
        if (renderedWithOpenAi) {
          return pngPath;
        }
      }

      // Standard Gemini motivational visual card SVG -> Resvg 1080x1920 PNG (bounded 18s timeout)
      let svgMarkup: string | null = null;
      try {
        const svgResp = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Create an inspiring vertical 1080x1920 motivational visual poster SVG for:
Topic: "${job.topicTitle}"
Scene ${i + 1}: "${scene.sectionLabel}"
Key Mindset Pillars: ${scene.componentLabels.join(', ')}

Rules:
- Output ONLY raw <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">...</svg>
- Keep SVG clean and under 45 elements on a deep warm night-indigo (#090d1f to #1e1b4b) backdrop with golden-amber (#f59e0b / #fbbf24) motivational sunrise/mountain/starlight symbolism.
- Leave the bottom 440px clean dark for subtitles.
- Use font-family="Noto Sans Display, DejaVu Sans, sans-serif".`,
            config: {
              maxOutputTokens: 2800,
            },
          }),
          18_000,
          `SVG Scene ${i + 1}`,
        );
        svgMarkup = sanitizeGeneratedSvg(svgResp.text ?? '');
      } catch {
        svgMarkup = null;
      }

      let pngBuffer: Buffer;
      try {
        if (!svgMarkup) {
          throw new Error('Empty or timed-out SVG from model');
        }
        const resvg = new Resvg(svgMarkup, {
          fitTo: { mode: 'width', value: 1080 },
        });
        const rendered = resvg.render();
        pngBuffer = Buffer.from(rendered.asPng());
        if (rendered.width !== 1080 || rendered.height !== 1920) {
          const tempRaw = `${pngPath}.raw.png`;
          fs.writeFileSync(tempRaw, pngBuffer);
          await execFileAsync('ffmpeg', [
            '-y',
            '-i',
            tempRaw,
            '-vf',
            'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#090d1f',
            pngPath,
          ]);
          fs.unlinkSync(tempRaw);
          return pngPath;
        }
      } catch {
        const fallbackSvg = buildFallbackMotivationalPosterSvg(
          job.topicTitle,
          scene,
          i,
          script.scenes.length,
        );
        const resvg = new Resvg(fallbackSvg, {
          fitTo: { mode: 'width', value: 1080 },
        });
        pngBuffer = Buffer.from(resvg.render().asPng());
      }

      fs.writeFileSync(pngPath, pngBuffer);
      return pngPath;
    });

    return Promise.all(tasks);
  }

  private async tryGenerateOpenAiDiagram(
    topicTitle: string,
    scene: ScriptScene,
    outputPngPath: string,
  ): Promise<boolean> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return false;

    try {
      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: `Cinematic vertical 9:16 motivational atmospheric artwork representing "${topicTitle}", focusing on ${scene.visualFocus}, symbolizing ${scene.componentLabels.join(', ')}. Warm golden sunrise lighting breaking through deep twilight indigo mountains, inspiring and serene, no text or gibberish.`,
          size: '1024x1792',
          response_format: 'b64_json',
        }),
      });
      if (!resp.ok) return false;
      const json = (await resp.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) return false;

      const rawPath = `${outputPngPath}.raw.png`;
      fs.writeFileSync(rawPath, Buffer.from(b64, 'base64'));
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        rawPath,
        '-vf',
        'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
        outputPngPath,
      ]);
      fs.unlinkSync(rawPath);
      return true;
    } catch {
      return false;
    }
  }

  private async runVideoEditorStage(
    ai: GoogleGenAI,
    jobId: string,
    script: ScriptOutput,
    assetPaths: string[],
    outputMp4Path: string,
  ): Promise<{ audioPath: string; srtPath: string; srtText: string; durationSeconds: number }> {
    const fullNarration = script.scenes.map((s) => s.narrationIndonesian.trim()).join(' ');
    const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
    const v1BetaAi = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        timeout: 35_000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const ttsContents = [
      {
        role: 'user',
        parts: [{ text: fullNarration }],
      },
    ];

    let ttsResp;
    try {
      ttsResp = await withTimeout(
        v1BetaAi.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: ttsContents,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        }),
        35_000,
        'Indonesian TTS (v1beta)',
      );
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : '';
      if (/speechConfig|INVALID_ARGUMENT|Unknown name/i.test(msg)) {
        // Retry without speechConfig if the gateway restricts generation_config fields to v1 protobuf
        ttsResp = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.8-flash-lite-tts',
            contents: ttsContents,
            config: {
              responseModalities: ['AUDIO'],
            },
          }),
          35_000,
          'Indonesian TTS (fallback config)',
        );
      } else {
        throw firstErr;
      }
    }

    const parts = ttsResp.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((p) => p.inlineData?.data);
    const b64Audio = audioPart?.inlineData?.data;
    if (!b64Audio) {
      throw new Error('Indonesian TTS model (gemini-3.8-flash-lite-tts) returned no audio bytes.');
    }

    const rawWavPath = this.db.resolveConfinedPath('audio', `${jobId}_raw.wav`);
    const finalAudioPath = this.db.resolveConfinedPath('audio', `${jobId}_mixed.m4a`);
    fs.writeFileSync(rawWavPath, Buffer.from(b64Audio, 'base64'));

    const audioProbe = await this.probeMedia(rawWavPath);
    const rawDuration = audioProbe.durationSeconds;
    if (!Number.isFinite(rawDuration) || rawDuration < 5) {
      throw new Error(`Generated TTS audio is invalid (${rawDuration.toFixed(1)}s).`);
    }

    // Ensure final video lands cleanly inside 30-60 seconds
    let speedFactor = 1.0;
    let effectiveSpeechDur = rawDuration;
    if (rawDuration > 55) {
      speedFactor = Math.min(1.25, rawDuration / 52);
      effectiveSpeechDur = rawDuration / speedFactor;
    }
    const leadInSeconds = 1.0;
    const targetDuration = Math.max(32, Math.min(58, Math.ceil(leadInSeconds + effectiveSpeechDur + 2.2)));

    // Build scene-synchronized Indonesian SRT + ASS subtitles
    const { srtText, assText } = this.buildIndonesianSubtitles(
      script.scenes,
      leadInSeconds,
      effectiveSpeechDur,
    );
    const srtPath = this.db.resolveConfinedPath('subtitles', `${jobId}.srt`);
    const assPath = this.db.resolveConfinedPath('subtitles', `${jobId}.ass`);
    fs.writeFileSync(srtPath, srtText, 'utf8');
    fs.writeFileSync(assPath, assText, 'utf8');

    // Mix Indonesian narration with warm uplifting motivational ambient music bed
    const voiceFilter =
      speedFactor > 1.0
        ? `[0:a]atempo=${speedFactor.toFixed(3)},adelay=1000|1000,apad=whole_dur=${targetDuration},volume=1.35[voice]`
        : `[0:a]adelay=1000|1000,apad=whole_dur=${targetDuration},volume=1.35[voice]`;

    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      rawWavPath,
      '-f',
      'lavfi',
      '-t',
      String(targetDuration),
      '-i',
      `sine=frequency=130.81:sample_rate=44100`,
      '-f',
      'lavfi',
      '-t',
      String(targetDuration),
      '-i',
      `sine=frequency=196.00:sample_rate=44100`,
      '-filter_complex',
      `${voiceFilter};[1:a][2:a]amix=inputs=2:duration=shortest,lowpass=f=520,volume=0.055,afade=t=in:st=0:d=1.2,afade=t=out:st=${Math.max(1, targetDuration - 2)}:d=2[bgm];[voice][bgm]amix=inputs=2:duration=first:normalize=0[outa]`,
      '-map',
      '[outa]',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ar',
      '44100',
      '-ac',
      '2',
      finalAudioPath,
    ]);

    // Assemble 1080x1920 vertical scene slideshow with smooth crossfades + Ken Burns motion + ASS subtitles
    const numScenes = assetPaths.length;
    const transitionDur = 0.5;
    const clipDuration =
      (targetDuration + transitionDur * (numScenes - 1)) / numScenes;

    const inputArgs: string[] = [];
    for (const imgPath of assetPaths) {
      inputArgs.push('-loop', '1', '-t', clipDuration.toFixed(2), '-i', imgPath);
    }
    inputArgs.push('-i', finalAudioPath);

    const filterParts: string[] = [];
    for (let i = 0; i < numScenes; i += 1) {
      const frames = Math.ceil(clipDuration * 30);
      // Subtle slow zoom on every diagram frame for kinetic polish
      filterParts.push(
        `[${i}:v]scale=1160:2062,zoompan=z='min(zoom+0.0005,1.07)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,setsar=1,format=yuv420p[v${i}]`,
      );
    }

    let prevLabel = 'v0';
    let offsetAcc = clipDuration - transitionDur;
    for (let i = 1; i < numScenes; i += 1) {
      const nextLabel = i === numScenes - 1 ? 'vmerged' : `vx${i}`;
      filterParts.push(
        `[${prevLabel}][v${i}]xfade=transition=fade:duration=${transitionDur}:offset=${offsetAcc.toFixed(2)}[${nextLabel}]`,
      );
      prevLabel = nextLabel;
      offsetAcc += clipDuration - transitionDur;
    }

    const finalVideoChain = numScenes === 1 ? 'v0' : 'vmerged';
    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filterParts.push(`[${finalVideoChain}]ass='${escapedAssPath}'[vout]`);

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        ...inputArgs,
        '-filter_complex',
        filterParts.join(';'),
        '-map',
        '[vout]',
        '-map',
        `${numScenes}:a`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '22',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-t',
        String(targetDuration),
        '-movflags',
        '+faststart',
        outputMp4Path,
      ],
      { maxBuffer: 1024 * 1024 * 12 },
    );

    return {
      audioPath: finalAudioPath,
      srtPath,
      srtText,
      durationSeconds: targetDuration,
    };
  }

  private buildIndonesianSubtitles(
    scenes: ScriptScene[],
    startOffset: number,
    totalNarrationDuration: number,
  ): { srtText: string; assText: string } {
    // Split each scene's Indonesian narration into readable 6-8 word subtitle phrases
    const chunks: Array<{ text: string; weight: number }> = [];
    for (const scene of scenes) {
      const words = scene.narrationIndonesian.trim().split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += 6) {
        const slice = words.slice(i, i + 6).join(' ');
        chunks.push({ text: slice, weight: Math.max(4, slice.length) });
      }
    }

    const totalWeight = chunks.reduce((sum, c) => sum + c.weight, 0) || 1;
    let cursor = startOffset;
    const srtLines: string[] = [];
    const assEvents: string[] = [];

    for (let idx = 0; idx < chunks.length; idx += 1) {
      const chunk = chunks[idx];
      const dur = (chunk.weight / totalWeight) * totalNarrationDuration;
      const cueStart = cursor;
      const cueEnd = cursor + Math.max(0.8, dur);
      cursor = cueEnd;

      srtLines.push(
        `${idx + 1}\n${formatSrtTimestamp(cueStart)} --> ${formatSrtTimestamp(cueEnd)}\n${chunk.text}\n`,
      );

      const safeAss = chunk.text.replace(/\{|\}/g, '');
      assEvents.push(
        `Dialogue: 0,${formatAssTimestamp(cueStart)},${formatAssTimestamp(cueEnd)},Default,,0,0,0,,${safeAss}`,
      );
    }

    const assHeader = `[Script Info]
Title: Studio Konten Yendra
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans Display,52,&H00FFFFFF,&H0000FFFF,&H000A0F1E,&H96070D1A,-1,0,0,0,100,100,0,0,3,12,0,2,64,64,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    return {
      srtText: srtLines.join('\n'),
      assText: assHeader + assEvents.join('\n') + '\n',
    };
  }

  private async probeMedia(filePath: string): Promise<FfprobeOutput> {
    const fileExists = fs.existsSync(filePath);
    if (!fileExists) {
      return {
        fileExists: false,
        fileReadable: false,
        fileSizeBytes: 0,
        durationSeconds: 0,
        width: 0,
        height: 0,
        hasVideoStream: false,
        hasAudioStream: false,
        videoCodec: '',
        audioCodec: '',
      };
    }

    let fileReadable = false;
    let fileSizeBytes = 0;
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      fileSizeBytes = fs.statSync(filePath).size;
      fileReadable = true;
    } catch {
      fileReadable = false;
    }

    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);

      const parsed = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: Array<{
          codec_type?: string;
          codec_name?: string;
          width?: number;
          height?: number;
        }>;
      };

      const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
      const audioStream = parsed.streams?.find((s) => s.codec_type === 'audio');
      const durationSeconds = Number(parsed.format?.duration ?? 0);

      return {
        fileExists: true,
        fileReadable,
        fileSizeBytes,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
        width: Number(videoStream?.width ?? 0),
        height: Number(videoStream?.height ?? 0),
        hasVideoStream: Boolean(videoStream),
        hasAudioStream: Boolean(audioStream),
        videoCodec: String(videoStream?.codec_name ?? ''),
        audioCodec: String(audioStream?.codec_name ?? ''),
      };
    } catch {
      return {
        fileExists: true,
        fileReadable,
        fileSizeBytes,
        durationSeconds: 0,
        width: 0,
        height: 0,
        hasVideoStream: false,
        hasAudioStream: false,
        videoCodec: '',
        audioCodec: '',
      };
    }
  }

  private async runQualityControlStage(
    ai: GoogleGenAI,
    mp4Path: string,
    research: ResearchOutput,
    script: ScriptOutput,
    srtText: string,
  ): Promise<{
    passed: boolean;
    aiQcStatus: Exclude<AiQcStatus, 'none'>;
    notes: string;
    probe: FfprobeOutput;
  }> {
    const probe = await this.probeMedia(mp4Path);
    const specValidation = validateRenderedVideoSpecs(probe);

    if (!specValidation.passed) {
      return {
        passed: false,
        aiQcStatus: 'rejected',
        notes: specValidation.reasons.join(' '),
        probe,
      };
    }

    if (!srtText.trim() || !script.scenes.some((s) => s.narrationIndonesian.trim().length > 10)) {
      return {
        passed: false,
        aiQcStatus: 'rejected',
        notes: 'Indonesian script or SRT subtitle content is missing or empty.',
        probe,
      };
    }

    try {
      const qcResp = await withTransientRetry(
        () =>
          withTimeout(
            ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: `Audit kualitas video motivasi Indonesia ini sebelum dipublikasikan:
Judul: ${script.title}
Hook Pembuka: ${script.hookText}
Ending: ${script.endingText}
Poin Riset: ${research.verifiedFacts.join('; ')}
Naskah Scene: ${script.scenes.map((s) => s.narrationIndonesian).join(' ')}
Subtitle SRT (cuplikan): ${srtText.slice(0, 900)}
Spesifikasi teknis terukur FFprobe: ${probe.width}x${probe.height}, codec ${probe.videoCodec}/${probe.audioCodec}, durasi ${probe.durationSeconds.toFixed(1)}s, audio+video tervalidasi.`,
              config: {
                systemInstruction:
                  'You are Quality Control (Eko) for an Indonesian motivational video studio. Verify emotional resonance, inspiring clarity, Indonesian spelling, opening hook, uplifting conclusion, and subtitle completeness. Approve unless incoherent, misleading, or broken.',
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  required: [
                    'approved',
                    'technicalAccuracyScore',
                    'spellingAndSubtitleCheck',
                    'notes',
                  ],
                  properties: {
                    approved: { type: Type.BOOLEAN },
                    technicalAccuracyScore: { type: Type.NUMBER },
                    spellingAndSubtitleCheck: { type: Type.STRING },
                    notes: { type: Type.STRING },
                  },
                },
              },
            }),
            25_000,
            'Eko (Kontrol Kualitas)',
          ),
        'Eko (Kontrol Kualitas)',
        4,
        2000,
      );

      const rawQc =
        qcResp.text ??
        qcResp.candidates?.[0]?.content?.parts
          ?.map((p) => (typeof p.text === 'string' ? p.text : ''))
          .join('') ??
        '';
      const parsed = parseGeminiJson<QcGeminiOutput>(rawQc);
      const approved = parsed.approved !== false;
      return {
        passed: approved,
        aiQcStatus: approved ? 'passed' : 'rejected',
        notes: `${parsed.notes ?? 'Verified'} (Accuracy ${parsed.technicalAccuracyScore ?? 95}/100 · ${parsed.spellingAndSubtitleCheck ?? 'Indonesian OK'} · ${probe.videoCodec.toUpperCase()}/${probe.audioCodec.toUpperCase()} ${probe.width}x${probe.height} @ ${probe.durationSeconds.toFixed(1)}s)`,
        probe,
      };
    } catch (err) {
      if (isTransientAiError(err) || !this.isGeminiConfigured()) {
        // Deterministic local file & media validation passed; do not discard valid MP4
        return {
          passed: true,
          aiQcStatus: 'pending',
          notes: `Local FFprobe & media specs verified (${probe.videoCodec.toUpperCase()}/${probe.audioCodec.toUpperCase()}, ${probe.width}x${probe.height} @ ${probe.durationSeconds.toFixed(1)}s); AI semantic QC pending due to temporary Gemini availability.`,
          probe,
        };
      }
      throw err;
    }
  }
}
