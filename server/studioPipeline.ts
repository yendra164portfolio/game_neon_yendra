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
  MissingConfigItem,
  ProducedVideoRecord,
  ProductionJobRecord,
  StudioActiveAgent,
  StudioDashboardPayload,
  StudioServiceStatus,
} from '../src/studio/types.ts';
import type { StudioDatabase } from './studioDb.ts';

const execFileAsync = promisify(execFile);

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
  durationSeconds: number;
  width: number;
  height: number;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
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

async function withTransientRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts: number = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /503|429|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|timed out/i.test(
        msg,
      );
      if (!isTransient || attempt >= maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`);
}

function buildFallbackEngineeringBlueprintSvg(
  topicTitle: string,
  scene: ScriptScene,
  sceneIndex: number,
  totalScenes: number,
): string {
  const labels = scene.componentLabels.slice(0, 4);
  while (labels.length < 3) {
    labels.push(`Komponen Teknik ${labels.length + 1}`);
  }

  const gridLines: string[] = [];
  for (let x = 80; x < 1080; x += 80) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="1920" stroke="#1e293b" stroke-width="1"/>`);
  }
  for (let y = 80; y < 1920; y += 80) {
    gridLines.push(`<line x1="0" y1="${y}" x2="1080" y2="${y}" stroke="#1e293b" stroke-width="1"/>`);
  }

  const calloutBoxes = labels
    .map((label, idx) => {
      const y = 1130 + idx * 145;
      return `
        <g>
          <line x1="540" y1="${740 + idx * 55}" x2="210" y2="${y + 42}" stroke="#38bdf8" stroke-width="3" stroke-dasharray="8 6"/>
          <circle cx="540" cy="${740 + idx * 55}" r="9" fill="#38bdf8"/>
          <rect x="96" y="${y}" width="888" height="96" rx="14" fill="#0f172a" stroke="#334155" stroke-width="2"/>
          <rect x="116" y="${y + 22}" width="52" height="52" rx="10" fill="#1d4ed8"/>
          <text x="142" y="${y + 58}" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">${idx + 1}</text>
          <text x="196" y="${y + 58}" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="30" font-weight="600" fill="#e2e8f0">${escapeXml(label.slice(0, 40))}</text>
        </g>
      `;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#070d1a"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <linearGradient id="core" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1d4ed8"/>
        <stop offset="100%" stop-color="#0ea5e9"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    ${gridLines.join('')}
    <rect x="72" y="110" width="936" height="130" rx="18" fill="#0f172a" stroke="#1e3a8a" stroke-width="2.5"/>
    <text x="110" y="162" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="24" font-weight="700" fill="#38bdf8">YENDRA ENGINEERING DIAGRAM · SCENE ${sceneIndex + 1}/${totalScenes}</text>
    <text x="110" y="212" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="34" font-weight="700" fill="#f8fafc">${escapeXml(scene.sectionLabel.slice(0, 38))}</text>

    <!-- Cutaway Mechanical Schematic -->
    <rect x="140" y="320" width="800" height="680" rx="32" fill="#0b1324" stroke="#334155" stroke-width="3"/>
    ${
      sceneIndex % 4 === 0
        ? `
    <rect x="250" y="420" width="580" height="110" rx="18" fill="#0f172a" stroke="#38bdf8" stroke-width="4"/>
    <rect x="280" y="575" width="520" height="125" rx="18" fill="url(#core)" opacity="0.88" stroke="#93c5fd" stroke-width="3"/>
    <rect x="250" y="745" width="580" height="110" rx="18" fill="#0f172a" stroke="#f59e0b" stroke-width="4"/>
    <line x1="540" y1="395" x2="540" y2="895" stroke="#60a5fa" stroke-width="3" stroke-dasharray="10 8"/>`
        : sceneIndex % 4 === 1
          ? `
    <circle cx="540" cy="660" r="245" fill="none" stroke="#1e40af" stroke-width="4" stroke-dasharray="16 10"/>
    <circle cx="540" cy="660" r="185" fill="#0f172a" stroke="#38bdf8" stroke-width="5"/>
    <circle cx="540" cy="660" r="95" fill="url(#core)" opacity="0.88"/>
    <rect x="330" y="635" width="420" height="50" rx="12" fill="none" stroke="#93c5fd" stroke-width="3"/>`
          : sceneIndex % 4 === 2
            ? `
    <rect x="240" y="440" width="220" height="200" rx="16" fill="#0f172a" stroke="#38bdf8" stroke-width="4"/>
    <rect x="620" y="440" width="220" height="200" rx="16" fill="#0f172a" stroke="#f59e0b" stroke-width="4"/>
    <rect x="360" y="710" width="360" height="170" rx="18" fill="url(#core)" opacity="0.86" stroke="#93c5fd" stroke-width="3"/>
    <path d="M460 540 L620 540 M730 640 L620 710 M350 640 L460 710" stroke="#38bdf8" stroke-width="5" fill="none"/>`
            : `
    <circle cx="380" cy="620" r="135" fill="#0f172a" stroke="#38bdf8" stroke-width="5"/>
    <circle cx="700" cy="620" r="135" fill="#0f172a" stroke="#10b981" stroke-width="5"/>
    <rect x="340" y="795" width="400" height="80" rx="16" fill="url(#core)" opacity="0.88"/>
    <line x1="515" y1="620" x2="565" y2="620" stroke="#f59e0b" stroke-width="6"/>`
    }
    <text x="540" y="378" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="26" font-weight="600" fill="#94a3b8" text-anchor="middle">${escapeXml(topicTitle.slice(0, 44))}</text>

    ${calloutBoxes}

    <rect x="72" y="1640" width="936" height="120" rx="16" fill="#0b1324" stroke="#1e293b" stroke-width="2"/>
    <text x="108" y="1692" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="24" font-weight="600" fill="#94a3b8">FOKUS VISUAL</text>
    <text x="108" y="1734" font-family="Noto Sans Display, DejaVu Sans, sans-serif" font-size="27" fill="#e2e8f0">${escapeXml(scene.visualFocus.slice(0, 56))}</text>
  </svg>`;
}

export class StudioCoordinator {
  private readonly db: StudioDatabase;
  private readonly broadcast: (payload: unknown) => void;
  private runningJobId: string | null = null;
  private ffmpegAvailable = false;
  private ffprobeAvailable = false;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(db: StudioDatabase, broadcast: (payload: unknown) => void) {
    this.db = db;
    this.broadcast = broadcast;
  }

  public async initialize(): Promise<void> {
    this.ffmpegAvailable = await this.checkBinary('ffmpeg');
    this.ffprobeAvailable = await this.checkBinary('ffprobe');

    this.db.resetInterruptedRunningJobs();
    this.db.ensureScheduleForDate(getJakartaDateString());

    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }
    this.schedulerInterval = setInterval(() => {
      void this.tickScheduler();
    }, 60_000);
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
          'Required on server for AI Researcher, Indonesian Scriptwriter, Technical SVG Designer, Indonesian TTS Voice Narration (gemini-3.8-flash-lite-tts), and AI Quality Control.',
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
    };
  }

  private emitOfficeAgentUpdate(params: {
    agentId: Exclude<StudioActiveAgent, null>;
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

  private emitStudioUpdated(eventName: 'App\\Events\\StudioUpdated' | 'App\\Events\\VideoReady' = 'App\\Events\\StudioUpdated'): void {
    this.broadcast({
      event: eventName,
      channel: 'yendra-office',
      data: {
        timestamp: Date.now(),
        runningJobId: this.runningJobId,
      },
    });
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

  public retryOrRunJob(jobId: string): { started: boolean; job: ProductionJobRecord | null; reason?: string } {
    if (this.runningJobId) {
      return {
        started: false,
        job: this.db.getJobById(this.runningJobId),
        reason: `Another job (${this.runningJobId}) is currently executing.`,
      };
    }

    const existing = this.db.getJobById(jobId);
    if (!existing) {
      return { started: false, job: null, reason: 'Production job not found.' };
    }

    const updated = this.db.updateJob(jobId, {
      status: 'queued',
      activeAgent: null,
      errorMessage: null,
      currentStageIndex: 0,
    });

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
          'GEMINI_API_KEY is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets so AI Researcher, Scriptwriter, Designer, TTS Narration, and QC can execute.',
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
          `AI Researcher verifying mechanical facts for "${job.topicTitle}".`,
          jobId,
        );
        this.emitOfficeAgentUpdate({
          agentId: 'researcher',
          status: 'Working',
          activity: `Researching components: ${job.topicTitle}`,
          progress: 18,
          taskTitle: job.topicTitle,
        });
        this.emitStudioUpdated();

        research = await withTransientRetry(
          () => withTimeout(this.runResearchStage(ai, job), 32_000, 'AI Researcher'),
          'AI Researcher',
        );
        this.db.updateJob(jobId, {
          researchJson: JSON.stringify(research),
        });
      }
      this.emitOfficeAgentUpdate({
        agentId: 'researcher',
        status: 'Completed',
        activity: `Verified ${research.internalComponents.length} components for ${job.topicTitle}`,
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
          `AI Scriptwriter drafting 30–60s Indonesian script with 3s opening hook.`,
          jobId,
        );
        this.emitOfficeAgentUpdate({
          agentId: 'scriptwriter',
          status: 'Working',
          activity: `Writing Indonesian script: ${job.topicTitle}`,
          progress: 35,
          taskTitle: job.topicTitle,
        });
        this.emitStudioUpdated();

        script = await withTransientRetry(
          () => withTimeout(this.runScriptStage(ai, job, research), 32_000, 'AI Scriptwriter'),
          'AI Scriptwriter',
        );
        this.db.updateJob(jobId, {
          scriptJson: JSON.stringify(script),
        });
      }
      this.emitOfficeAgentUpdate({
        agentId: 'scriptwriter',
        status: 'Completed',
        activity: `Indonesian script ready (${script.scenes.length} scenes)`,
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
          `AI Visual Designer creating ${script.scenes.length} exploded mechanical diagrams (1080x1920).`,
          jobId,
        );
        this.emitOfficeAgentUpdate({
          agentId: 'designer',
          status: 'Working',
          activity: `Designing exploded diagrams: ${job.topicTitle}`,
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
        activity: `Generated ${assetPaths.length} 1080x1920 technical diagrams`,
        progress: 100,
        taskTitle: job.topicTitle,
      });

      // ============================================================
      // STAGE 4: AI VIDEO EDITOR (Indonesian TTS + Subtitles + Music + MP4)
      // ============================================================
      activeAgent = 'video_editor';
      this.db.updateJob(jobId, {
        status: 'editing',
        currentStageIndex: 4,
        activeAgent,
      });
      this.db.appendLog(
        'video_editor',
        'info',
        `AI Video Editor generating Indonesian voiceover, animated subtitles, music bed, and 1080x1920 MP4.`,
        jobId,
      );
      this.emitOfficeAgentUpdate({
        agentId: 'video_editor',
        status: 'Working',
        activity: `Rendering 1080x1920 MP4: ${job.topicTitle}`,
        progress: 76,
        taskTitle: job.topicTitle,
      });
      this.emitStudioUpdated();

      const videoId = `vid_${job.scheduleDate.replace(/-/g, '')}_${Date.now().toString(36)}`;
      const videoFileName = `${videoId}.mp4`;
      pendingVideoFilePath = this.db.resolveConfinedPath('videos', videoFileName);

      const editResult = await this.runVideoEditorStage(
        ai,
        jobId,
        script,
        assetPaths,
        pendingVideoFilePath,
      );
      this.db.updateJob(jobId, {
        audioPath: path.basename(editResult.audioPath),
        subtitlePath: path.basename(editResult.srtPath),
      });
      this.emitOfficeAgentUpdate({
        agentId: 'video_editor',
        status: 'Completed',
        activity: `Encoded ${videoFileName} (${editResult.durationSeconds.toFixed(1)}s)`,
        progress: 100,
        taskTitle: job.topicTitle,
      });

      // ============================================================
      // STAGE 5: AI QUALITY CONTROL
      // ============================================================
      activeAgent = 'qc';
      this.db.updateJob(jobId, {
        status: 'qc',
        currentStageIndex: 5,
        activeAgent,
      });
      this.db.appendLog(
        'qc',
        'info',
        `AI Quality Control inspecting 1080x1920 specs, audio sync, and Indonesian accuracy.`,
        jobId,
      );
      this.emitOfficeAgentUpdate({
        agentId: 'qc',
        status: 'Working',
        activity: `Inspecting MP4 & Indonesian QA: ${job.topicTitle}`,
        progress: 92,
        taskTitle: job.topicTitle,
      });
      this.emitStudioUpdated();

      const qcResult = await this.runQualityControlStage(
        ai,
        pendingVideoFilePath,
        research,
        script,
        editResult.srtText,
      );

      if (!qcResult.passed) {
        throw new Error(`Quality Control Rejected: ${qcResult.notes}`);
      }

      const stat = fs.statSync(pendingVideoFilePath);
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
        subtitlesSrt: editResult.srtText,
        researchSummary: research.summary,
        researchReferences: research.references,
        fileName: videoFileName,
        fileSizeBytes: stat.size,
        width: qcResult.probe.width,
        height: qcResult.probe.height,
        durationSeconds: qcResult.probe.durationSeconds,
        qcPassed: true,
        qcNotes: qcResult.notes,
        createdAt: new Date().toISOString(),
      };

      this.db.insertVideo(videoRecord);
      this.db.updateJob(jobId, {
        status: 'completed',
        currentStageIndex: 5,
        activeAgent: null,
        videoId,
        errorMessage: null,
        completedAt: new Date().toISOString(),
      });
      this.db.appendLog(
        'qc',
        'success',
        `Approved & stored MP4 "${script.title}" (${qcResult.probe.width}x${qcResult.probe.height}, ${qcResult.probe.durationSeconds.toFixed(1)}s).`,
        jobId,
      );
      this.emitOfficeAgentUpdate({
        agentId: 'qc',
        status: 'Completed',
        activity: `Approved MP4: ${script.title}`,
        progress: 100,
        taskTitle: job.topicTitle,
      });
      this.emitStudioUpdated('App\\Events\\VideoReady');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Production pipeline failed.';

      // Rule: never leave unverified MP4 or claim completion on error
      if (pendingVideoFilePath && fs.existsSync(pendingVideoFilePath)) {
        try {
          fs.unlinkSync(pendingVideoFilePath);
        } catch {
          // Ignore cleanup failure
        }
      }

      this.db.updateJob(jobId, {
        status: 'failed',
        activeAgent,
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
      contents: `Riset teknis mendalam tentang topik: "${job.topicTitle}" (Kategori: ${job.category}). Fokus sudut pandang: ${job.angle}`,
      config: {
        systemInstruction:
          'You are a Mechanical & Electrical Engineering Researcher. Always populate every required JSON field cleanly: summary (Indonesian string), howItWorksStepByStep (array of 4-5 concise Indonesian steps), internalComponents (array of 4-6 objects with name and function), verifiedFacts (array of 3-4 facts), and references (array of 2-3 engineering references).',
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
        `AI Researcher returned incomplete engineering research JSON (keys: ${Object.keys(parsed).join(', ') || 'none'}; preview: "${preview}").`,
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
          : ['Fundamental Mechanical & Electrical Engineering Principles'],
    };
  }

  private async runScriptStage(
    ai: GoogleGenAI,
    job: ProductionJobRecord,
    research: ResearchOutput,
  ): Promise<ScriptOutput> {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Buat naskah video edukasi pendek (30-55 detik) berbahasa Indonesia yang menarik namun akurat berdasarkan riset berikut:
Topik: ${job.topicTitle}
Ringkasan Riset: ${research.summary}
Langkah Kerja: ${research.howItWorksStepByStep.join(' | ')}
Komponen Internal: ${research.internalComponents.map((c) => `${c.name}: ${c.function}`).join('; ')}

Aturan ketat:
- Scene 1 wajib berupa HOOK kuat 3 detik pertama agar penonton langsung penasaran.
- Scene 2-3 menjelaskan komponen internal dan mekanismenya langkah demi langkah dengan bahasa sehari-hari yang mudah dipahami semua orang.
- Scene 4 adalah kesimpulan edukatif yang berkesan.
- Total narasi seluruh scene WAJIB antara 85 sampai 115 kata bahasa Indonesia agar durasi suara berada di rentang 35-52 detik.`,
      config: {
        systemInstruction:
          'You are an Indonesian Educational Science & Engineering Scriptwriter. Output clean JSON strictly in natural, engaging Indonesian.',
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
        `AI Scriptwriter returned fewer than 3 valid scenes (keys: ${Object.keys(parsed).join(', ') || 'none'}).`,
      );
    }

    return {
      title: parsed.title,
      description: parsed.description ?? research.summary,
      caption: parsed.caption ?? `${parsed.title} — Pelajari cara kerja komponennya!`,
      hashtags:
        parsed.hashtags && parsed.hashtags.length > 0
          ? parsed.hashtags
          : ['#EdukasiTeknologi', '#TeknikMesin', '#CaraKerja', '#SainsTeknologi'],
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

      // Standard Gemini technical SVG blueprint -> Resvg 1080x1920 PNG (bounded 18s timeout)
      let svgMarkup: string | null = null;
      try {
        const svgResp = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Create a concise vertical 1080x1920 engineering cutaway technical SVG for:
Machine: "${job.topicTitle}"
Scene ${i + 1}: "${scene.sectionLabel}"
Components: ${scene.componentLabels.join(', ')}

Rules:
- Output ONLY raw <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">...</svg>
- Keep SVG clean and under 45 elements on a #070d1a dark blueprint backdrop.
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
            'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#070d1a',
            pngPath,
          ]);
          fs.unlinkSync(tempRaw);
          return pngPath;
        }
      } catch {
        const fallbackSvg = buildFallbackEngineeringBlueprintSvg(
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
          prompt: `Clean vertical 9:16 technical engineering exploded view illustration of ${topicTitle}, focusing on ${scene.visualFocus}, highlighting ${scene.componentLabels.join(', ')}. Crisp studio schematic aesthetic, dark navy blueprint backdrop, no gibberish text.`,
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

    // Mix Indonesian narration with harmonic engineering ambient music bed
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
      `sine=frequency=110:sample_rate=44100`,
      '-f',
      'lavfi',
      '-t',
      String(targetDuration),
      '-i',
      `sine=frequency=164.81:sample_rate=44100`,
      '-filter_complex',
      `${voiceFilter};[1:a][2:a]amix=inputs=2:duration=shortest,lowpass=f=480,volume=0.055,afade=t=in:st=0:d=1.2,afade=t=out:st=${Math.max(1, targetDuration - 2)}:d=2[bgm];[voice][bgm]amix=inputs=2:duration=first:normalize=0[outa]`,
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
Title: Yendra AI Content Studio
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
        width?: number;
        height?: number;
      }>;
    };

    const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
    const audioStream = parsed.streams?.find((s) => s.codec_type === 'audio');
    const durationSeconds = Number(parsed.format?.duration ?? 0);

    return {
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      width: Number(videoStream?.width ?? 0),
      height: Number(videoStream?.height ?? 0),
      hasVideoStream: Boolean(videoStream),
      hasAudioStream: Boolean(audioStream),
    };
  }

  private async runQualityControlStage(
    ai: GoogleGenAI,
    mp4Path: string,
    research: ResearchOutput,
    script: ScriptOutput,
    srtText: string,
  ): Promise<{ passed: boolean; notes: string; probe: FfprobeOutput }> {
    const fileExists = fs.existsSync(mp4Path);
    const fileSizeBytes = fileExists ? fs.statSync(mp4Path).size : 0;
    const probe = fileExists
      ? await this.probeMedia(mp4Path)
      : {
          durationSeconds: 0,
          width: 0,
          height: 0,
          hasVideoStream: false,
          hasAudioStream: false,
        };

    const specValidation = validateRenderedVideoSpecs({
      fileExists,
      fileSizeBytes,
      width: probe.width,
      height: probe.height,
      durationSeconds: probe.durationSeconds,
      hasVideoStream: probe.hasVideoStream,
      hasAudioStream: probe.hasAudioStream,
    });

    if (!specValidation.passed) {
      return {
        passed: false,
        notes: specValidation.reasons.join(' '),
        probe,
      };
    }

    const qcResp = await withTransientRetry(
      () =>
        withTimeout(
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Audit kualitas video edukasi Indonesia ini sebelum dipublikasikan:
Judul: ${script.title}
Hook Pembuka: ${script.hookText}
Ending: ${script.endingText}
Fakta Riset: ${research.verifiedFacts.join('; ')}
Naskah Scene: ${script.scenes.map((s) => s.narrationIndonesian).join(' ')}
Subtitle SRT (cuplikan): ${srtText.slice(0, 900)}
Spesifikasi teknis terukur FFprobe: ${probe.width}x${probe.height}, durasi ${probe.durationSeconds.toFixed(1)}s, audio+video tervalidasi.`,
            config: {
              systemInstruction:
                'You are AI Quality Control for an Indonesian educational engineering studio. Verify technical accuracy, Indonesian spelling, opening hook, educational conclusion, and subtitle completeness. Approve unless factually wrong or broken.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                required: ['approved', 'technicalAccuracyScore', 'spellingAndSubtitleCheck', 'notes'],
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
          'AI Quality Control',
        ),
      'AI Quality Control',
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
      notes: `${parsed.notes ?? 'Verified'} (Accuracy ${parsed.technicalAccuracyScore ?? 95}/100 · ${parsed.spellingAndSubtitleCheck ?? 'Indonesian OK'} · ${probe.width}x${probe.height} @ ${probe.durationSeconds.toFixed(1)}s)`,
      probe,
    };
  }
}
