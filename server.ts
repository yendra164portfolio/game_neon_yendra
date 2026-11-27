import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import { StudioDatabase, isValidResourceId } from './server/studioDb.ts';
import { StudioCoordinator } from './server/studioPipeline.ts';
import type {
  TikTokPrivacyLevel,
  TikTokPublishMode,
} from './src/studio/types.ts';

function renderTikTokCallbackHtml(payload: {
  ok: boolean;
  message: string;
  username?: string | null;
}): string {
  const postPayload = JSON.stringify(
    payload.ok
      ? {
          type: 'TIKTOK_OAUTH_SUCCESS',
          username: payload.username ?? null,
        }
      : {
          type: 'TIKTOK_OAUTH_ERROR',
          error: payload.message,
        },
  ).replace(/</g, '\\u003c');

  const safeStatusTitle = payload.ok
    ? 'Akun TikTok Berhasil Terhubung'
    : 'Koneksi TikTok Gagal';
  const safeBodyJson = JSON.stringify(payload.message).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Yendra Motion · TikTok OAuth</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; padding: 24px; }
    .card { max-width: 420px; width: 100%; border: 1px solid #1e293b; background: #0f172a; border-radius: 14px; padding: 24px; text-align: center; }
    h1 { font-size: 18px; margin: 0 0 10px; }
    p { font-size: 13px; color: #94a3b8; margin: 0 0 16px; line-height: 1.5; }
    button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeStatusTitle}</h1>
    <p id="status-msg"></p>
    <button type="button" onclick="window.close()">Tutup Jendela</button>
  </div>
  <script>
    document.getElementById('status-msg').textContent = ${safeBodyJson};
    if (window.opener) {
      window.opener.postMessage(${postPayload}, '*');
    }
    setTimeout(function() { window.close(); }, 1200);
  </script>
</body>
</html>`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const VALID_AGENTS = new Set([
  'manager',
  'researcher',
  'scriptwriter',
  'video_editor',
  'designer',
  'publisher',
  'qc',
]);
const VALID_STATUSES = new Set([
  'Working',
  'Thinking',
  'Idle',
  'Completed',
  'Error',
]);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/office' });

  const broadcastEvent = (payload: unknown) => {
    const serialized = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  };

  const studioDb = new StudioDatabase();
  const studioCoordinator = new StudioCoordinator(studioDb, broadcastEvent);
  await studioCoordinator.initialize();

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        event: 'pusher:connection_established',
        channel: 'yendra-office',
        data: {
          mode: studioCoordinator.isGeminiConfigured() ? 'studio-ready' : 'demo-ready',
          timestamp: Date.now(),
        },
      }),
    );
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'YENDRA AI OFFICE',
      geminiConfigured: studioCoordinator.isGeminiConfigured(),
      websocketPath: '/ws/office',
      reverbChannel: 'yendra-office',
    });
  });

  // ============================================================
  // AI CONTENT STUDIO API ROUTES
  // ============================================================
  app.get('/api/studio/dashboard', (_req, res) => {
    res.json(studioCoordinator.getDashboardPayload());
  });

  app.post('/api/studio/schedule/ensure', (_req, res) => {
    const result = studioCoordinator.ensureDailySchedule();
    res.json({
      ...result,
      dashboard: studioCoordinator.getDashboardPayload(),
    });
  });

  app.post('/api/studio/autoproduce', (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    studioCoordinator.setAutoProduce(enabled);
    res.json({
      autoProduceEnabled: enabled,
      dashboard: studioCoordinator.getDashboardPayload(),
    });
  });

  app.post('/api/studio/jobs', (req, res) => {
    const topicTitle =
      typeof req.body?.topicTitle === 'string' ? req.body.topicTitle.trim() : '';
    const topicSlug =
      typeof req.body?.topicSlug === 'string' ? req.body.topicSlug.trim() : undefined;
    const category =
      typeof req.body?.category === 'string' ? req.body.category.trim() : undefined;
    const angle = typeof req.body?.angle === 'string' ? req.body.angle.trim() : undefined;

    if (!topicTitle) {
      res.status(400).json({ error: 'Topic title is required.' });
      return;
    }

    try {
      const job = studioDb.enqueueJob({
        topicTitle,
        topicSlug,
        category,
        angle,
      });
      res.status(201).json({
        job,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to enqueue topic.';
      const statusCode = /already scheduled/i.test(message) ? 409 : 400;
      res.status(statusCode).json({ error: message });
    }
  });

  app.post('/api/studio/jobs/run-next', (_req, res) => {
    const result = studioCoordinator.triggerNextQueuedJob();
    if (!result.started) {
      res.status(result.job ? 409 : 404).json({
        started: false,
        reason: result.reason,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
      return;
    }
    res.status(202).json({
      started: true,
      job: result.job,
      dashboard: studioCoordinator.getDashboardPayload(),
    });
  });

  app.post('/api/studio/jobs/:id/retry', (req, res) => {
    const id = req.params.id;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid job ID.' });
      return;
    }
    const result = studioCoordinator.retryOrRunJob(id);
    if (!result.started) {
      res.status(result.job ? 409 : 404).json({
        started: false,
        reason: result.reason,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
      return;
    }
    res.status(202).json({
      started: true,
      job: result.job,
      dashboard: studioCoordinator.getDashboardPayload(),
    });
  });

  app.get('/api/studio/videos/:id/stream', (req, res) => {
    const id = req.params.id;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid video ID.' });
      return;
    }
    const video = studioDb.getVideoById(id);
    if (!video) {
      res.status(404).json({ error: 'Video not found.' });
      return;
    }

    let filePath: string;
    try {
      filePath = studioDb.resolveConfinedPath('videos', video.fileName);
    } catch {
      res.status(400).json({ error: 'Invalid video path.' });
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'MP4 file missing from persistent storage.' });
      return;
    }
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch {
      res.status(500).json({ error: 'MP4 file is not readable on storage.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = Math.max(0, parseInt(parts[0], 10) || 0);
      const end = parts[1] ? Math.min(fileSize - 1, parseInt(parts[1], 10)) : fileSize - 1;
      if (start >= fileSize || end < start) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  app.get('/api/studio/videos/:id/download', (req, res) => {
    const id = req.params.id;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid video ID.' });
      return;
    }
    const video = studioDb.getVideoById(id);
    if (!video) {
      res.status(404).json({ error: 'Video not found.' });
      return;
    }

    let filePath: string;
    try {
      filePath = studioDb.resolveConfinedPath('videos', video.fileName);
    } catch {
      res.status(400).json({ error: 'Invalid video path.' });
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'MP4 file missing from persistent storage.' });
      return;
    }
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch {
      res.status(500).json({ error: 'MP4 file is not readable on storage.' });
      return;
    }

    const safeSlug = video.topicSlug.replace(/[^a-zA-Z0-9_-]/g, '-');
    res.download(filePath, `${safeSlug}-1080x1920.mp4`);
  });

  app.get('/api/studio/videos/:id/thumbnail', (req, res) => {
    const id = req.params.id;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'ID video tidak valid.' });
      return;
    }
    const video = studioDb.getVideoById(id);
    if (!video || !video.thumbnailFileName) {
      res.status(404).json({ error: 'Thumbnail tidak tersedia.' });
      return;
    }
    let thumbPath: string;
    try {
      thumbPath = studioDb.resolveConfinedPath('thumbnails', video.thumbnailFileName);
    } catch {
      res.status(400).json({ error: 'Path thumbnail tidak valid.' });
      return;
    }
    if (!fs.existsSync(thumbPath)) {
      res.status(404).json({ error: 'File thumbnail tidak ditemukan.' });
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    fs.createReadStream(thumbPath).pipe(res);
  });

  app.get('/api/studio/videos/:id/text/:kind', (req, res) => {
    const { id, kind } = req.params;
    if (!isValidResourceId(id) || (kind !== 'script' && kind !== 'subtitles')) {
      res.status(400).json({ error: 'Invalid request parameters.' });
      return;
    }
    const video = studioDb.getVideoById(id);
    if (!video) {
      res.status(404).json({ error: 'Video not found.' });
      return;
    }

    const safeSlug = video.topicSlug.replace(/[^a-zA-Z0-9_-]/g, '-');
    if (kind === 'subtitles') {
      res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeSlug}-subtitles.srt"`,
      );
      res.send(video.subtitlesSrt);
      return;
    }

    const scriptBundle = [
      `JUDUL: ${video.title}`,
      `TANGGAL PRODUKSI (Asia/Jakarta): ${video.scheduleDate}`,
      `HOOK 3 DETIK: ${video.hookText}`,
      '',
      'NASKAH LENGKAP (BAHASA INDONESIA):',
      video.scriptText,
      '',
      `ENDING: ${video.endingText}`,
      '',
      `CAPTION MEDIA SOSIAL:\n${video.caption}`,
      `HASHTAGS: ${video.hashtags.join(' ')}`,
      '',
      `RINGKASAN RISET TEKNIS:\n${video.researchSummary}`,
      `REFERENSI:\n${video.researchReferences.map((r) => `- ${r}`).join('\n')}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeSlug}-script-caption.txt"`,
    );
    res.send(scriptBundle);
  });

  app.post('/api/studio/videos/:id/rerender', (req, res) => {
    const id = req.params.id;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid video ID.' });
      return;
    }
    const video = studioDb.getVideoById(id);
    if (!video) {
      res.status(404).json({ error: 'Video not found.' });
      return;
    }
    const result = studioCoordinator.retryOrRunJob(video.jobId, { forceRerender: true });
    if (!result.started) {
      res.status(result.job ? 409 : 404).json({
        started: false,
        reason: result.reason,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
      return;
    }
    res.status(202).json({
      started: true,
      job: result.job,
      dashboard: studioCoordinator.getDashboardPayload(),
    });
  });

  app.post('/api/studio/recover', async (_req, res) => {
    try {
      const recovery = await studioCoordinator.recoverOrphanedVideos();
      res.json({
        recovery,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Recovery scan failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/studio/videos/:id/ai-qc', async (req, res) => {
    const id = req.params.id;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid video ID.' });
      return;
    }
    try {
      const result = await studioCoordinator.runAiQcUpgradeForVideo(id);
      res.json({
        result,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI QC verification failed.';
      const status = /not found/i.test(message) ? 404 : 502;
      res.status(status).json({
        error: message,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
    }
  });

  app.delete('/api/studio/videos/:id', (req, res) => {
    const id = req.params.id;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid video ID.' });
      return;
    }
    const deleted = studioDb.deleteVideo(id);
    if (!deleted) {
      res.status(404).json({ error: 'Video not found.' });
      return;
    }
    broadcastEvent({
      event: 'App\\Events\\StudioUpdated',
      channel: 'yendra-office',
      data: { timestamp: Date.now() },
    });
    res.json({
      deleted: true,
      dashboard: studioCoordinator.getDashboardPayload(),
    });
  });

  // ============================================================
  // TIKTOK OAUTH 2.0 & CONTENT POSTING API ROUTES
  // ============================================================
  app.get('/api/tiktok/status', (_req, res) => {
    res.json(studioCoordinator.tiktok.getPublicStatus());
  });

  app.get('/api/tiktok/auth-url', (req, res) => {
    const scopeMode = req.query.scopeMode === 'draft' ? 'draft' : 'full';
    try {
      const authData = studioCoordinator.tiktok.buildAuthorizationUrl(scopeMode);
      res.json({
        configured: true,
        ...authData,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Konfigurasi TikTok belum siap.';
      res.status(200).json({
        configured: false,
        error: message,
        status: studioCoordinator.tiktok.getPublicStatus(),
      });
    }
  });

  app.get(['/api/tiktok/callback', '/api/tiktok/callback/'], async (req, res) => {
    const oauthError =
      typeof req.query.error === 'string' ? req.query.error.trim() : '';
    const oauthErrorDesc =
      typeof req.query.error_description === 'string'
        ? req.query.error_description.trim()
        : '';
    if (oauthError) {
      res.status(400).send(
        renderTikTokCallbackHtml({
          ok: false,
          message: oauthErrorDesc || `Otorisasi dibatalkan (${oauthError}).`,
        }),
      );
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';

    try {
      const account = await studioCoordinator.tiktok.handleOAuthCallback(code, state);
      studioCoordinator.emitStudioUpdated();
      res.status(200).send(
        renderTikTokCallbackHtml({
          ok: true,
          username: account.username ?? account.displayName ?? account.openId,
          message: account.username
            ? `Terhubung sebagai @${account.username}. Jendela ini akan tertutup otomatis.`
            : 'Akun TikTok terhubung. Jendela ini akan tertutup otomatis.',
        }),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Autentikasi TikTok gagal.';
      res.status(400).send(
        renderTikTokCallbackHtml({
          ok: false,
          message,
        }),
      );
    }
  });

  app.post('/api/tiktok/settings', (req, res) => {
    const validModes = new Set<TikTokPublishMode>(['draft', 'direct']);
    const validPrivacies = new Set<TikTokPrivacyLevel>([
      'SELF_ONLY',
      'MUTUAL_FOLLOW_FRIENDS',
      'FOLLOWER_OF_CREATOR',
      'PUBLIC_TO_EVERYONE',
    ]);

    const patch: {
      autoUploadEnabled?: boolean;
      defaultMode?: TikTokPublishMode;
      defaultPrivacy?: TikTokPrivacyLevel;
    } = {};

    if (typeof req.body?.autoUploadEnabled === 'boolean') {
      patch.autoUploadEnabled = req.body.autoUploadEnabled;
    }
    if (typeof req.body?.defaultMode === 'string') {
      if (!validModes.has(req.body.defaultMode as TikTokPublishMode)) {
        res.status(400).json({ error: 'Mode upload TikTok tidak valid (draft | direct).' });
        return;
      }
      patch.defaultMode = req.body.defaultMode as TikTokPublishMode;
    }
    if (typeof req.body?.defaultPrivacy === 'string') {
      if (!validPrivacies.has(req.body.defaultPrivacy as TikTokPrivacyLevel)) {
        res.status(400).json({ error: 'Privasi TikTok tidak valid.' });
        return;
      }
      patch.defaultPrivacy = req.body.defaultPrivacy as TikTokPrivacyLevel;
    }

    studioDb.setTikTokSettings(patch);
    studioCoordinator.emitStudioUpdated();
    res.json({
      tiktok: studioCoordinator.tiktok.getPublicStatus(),
      dashboard: studioCoordinator.getDashboardPayload(),
    });
  });

  app.post('/api/tiktok/disconnect', (_req, res) => {
    studioDb.clearTikTokConnection();
    studioDb.setTikTokSettings({ autoUploadEnabled: false });
    studioDb.appendLog('publisher', 'info', 'Koneksi akun TikTok diputuskan oleh Owner.');
    studioCoordinator.emitStudioUpdated();
    res.json({
      tiktok: studioCoordinator.tiktok.getPublicStatus(),
      dashboard: studioCoordinator.getDashboardPayload(),
    });
  });

  app.post('/api/tiktok/cleanup-storage', async (_req, res) => {
    try {
      const cleanup = await studioCoordinator.tiktok.cleanupAllEligible({
        minAgeAfterUploadMs: 60_000,
      });
      studioCoordinator.emitStudioUpdated();
      res.json({
        cleanup,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Gagal membersihkan storage video yang sudah terupload.';
      res.status(500).json({
        error: message,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
    }
  });

  app.post('/api/studio/videos/:id/tiktok-upload', async (req, res) => {
    const id = req.params.id;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid video ID.' });
      return;
    }

    const validModes = new Set<TikTokPublishMode>(['draft', 'direct']);
    const validPrivacies = new Set<TikTokPrivacyLevel>([
      'SELF_ONLY',
      'MUTUAL_FOLLOW_FRIENDS',
      'FOLLOWER_OF_CREATOR',
      'PUBLIC_TO_EVERYONE',
    ]);

    const mode =
      typeof req.body?.mode === 'string' &&
      validModes.has(req.body.mode as TikTokPublishMode)
        ? (req.body.mode as TikTokPublishMode)
        : undefined;
    const privacyLevel =
      typeof req.body?.privacyLevel === 'string' &&
      validPrivacies.has(req.body.privacyLevel as TikTokPrivacyLevel)
        ? (req.body.privacyLevel as TikTokPrivacyLevel)
        : undefined;

    try {
      const result = await studioCoordinator.uploadVideoToTikTok(id, {
        mode,
        privacyLevel,
        source: 'manual',
      });
      res.json({
        upload: result,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal mengunggah video ke TikTok.';
      const statusCode = /tidak ditemukan/i.test(message)
        ? 404
        : /belum terhubung|belum diatur|Format file tidak valid|Resolusi video|Durasi video|Ukuran file video|Video belum lulus|Rasio aspek/i.test(
              message,
            )
          ? 400
          : 502;
      res.status(statusCode).json({
        error: message,
        dashboard: studioCoordinator.getDashboardPayload(),
      });
    }
  });

  // Laravel Reverb-compatible event ingestion endpoint for real AI workers
  app.post('/api/events/reverb', (req, res) => {
    const body = req.body ?? {};
    const data = body.data ?? body;
    const agentId = typeof data.agentId === 'string' ? data.agentId : '';
    const status = typeof data.status === 'string' ? data.status : '';
    const activity = typeof data.activity === 'string' ? data.activity.trim() : '';
    const progress = Number(data.progress ?? 0);

    if (!VALID_AGENTS.has(agentId) || !VALID_STATUSES.has(status) || !activity) {
      res.status(400).json({
        error:
          'Invalid event payload. Required: agentId, status (Working|Thinking|Idle|Completed|Error), activity.',
      });
      return;
    }

    const eventEnvelope = {
      event:
        body.event === 'App\\Events\\AgentStatusChanged'
          ? 'App\\Events\\AgentStatusChanged'
          : 'App\\Events\\AgentTaskUpdated',
      channel: typeof body.channel === 'string' ? body.channel : 'yendra-office',
      data: {
        agentId,
        status,
        activity: activity.slice(0, 240),
        progress: Number.isFinite(progress)
          ? Math.max(0, Math.min(100, Math.round(progress)))
          : 0,
        taskTitle:
          typeof data.taskTitle === 'string' ? data.taskTitle.slice(0, 180) : undefined,
        errorMessage:
          typeof data.errorMessage === 'string'
            ? data.errorMessage.slice(0, 300)
            : undefined,
        timestamp: Date.now(),
      },
    };

    broadcastEvent(eventEnvelope);
    res.json({ accepted: true, broadcastedTo: wss.clients.size, event: eventEnvelope });
  });

  // Server-side Gemini API integration for Video Production Briefs & Scripts
  app.post('/api/gemini/generate-brief', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        configured: false,
        error:
          'GEMINI_API_KEY is not configured in server environment. Configure it in Settings > Secrets to enable live Gemini brief drafting, or launch the Video Production Run in Demo Simulation mode.',
      });
      return;
    }

    const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
    const format = typeof req.body?.format === 'string' ? req.body.format.trim() : '16:9 YouTube';
    if (!topic) {
      res.status(400).json({ error: 'Topic is required.' });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Generate a structured video production package for topic: "${topic}" (Target format: ${format}). Keep it concise and actionable for a studio production crew.`,
        config: {
          systemInstruction:
            'You are the Executive Producer of Yendra AI Office. Return clean structured JSON with researchNotes, scriptText (4 short timestamped scenes), subtitlesSrt (2 SRT cues), and musicCue.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              researchNotes: { type: Type.STRING },
              scriptText: { type: Type.STRING },
              subtitlesSrt: { type: Type.STRING },
              musicCue: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        configured: true,
        model: 'gemini-4-hydrogen',
        artifacts: parsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini request failed';
      res.status(502).json({
        configured: true,
        error: message,
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`YENDRA AI OFFICE server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
