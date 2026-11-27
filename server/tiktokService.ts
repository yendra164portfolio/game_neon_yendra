import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { promisify } from 'node:util';
import type {
  ProducedVideoRecord,
  TikTokAccountStatus,
  TikTokPrivacyLevel,
  TikTokPublishMode,
  TikTokUploadStatus,
} from '../src/studio/types.ts';
import type {
  StoredTikTokProfile,
  StoredTikTokTokens,
  StudioDatabase,
} from './studioDb.ts';

const execFileAsync = promisify(execFile);

export const TIKTOK_DEV_APP_URL =
  'https://ais-dev-ne3haf3scfbjhbw7f4xbbo-387358339589.asia-east1.run.app';
export const TIKTOK_SHARED_APP_URL =
  'https://ais-pre-ne3haf3scfbjhbw7f4xbbo-387358339589.asia-east1.run.app';

export const TIKTOK_SCHEDULE_HOURS_WIB = ['09:00', '12:00', '18:00'] as const;
export type TikTokScheduleSlotWib = (typeof TIKTOK_SCHEDULE_HOURS_WIB)[number];

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USER_INFO_URL =
  'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username';
const TIKTOK_INBOX_INIT_URL =
  'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
const TIKTOK_DIRECT_INIT_URL =
  'https://open.tiktokapis.com/v2/post/publish/video/init/';
const TIKTOK_PUBLISH_STATUS_URL =
  'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

const MAX_UPLOAD_SIZE_BYTES = 128 * 1024 * 1024;
const SINGLE_CHUNK_MAX_BYTES = 64 * 1024 * 1024;
const MULTI_CHUNK_BYTES = 10 * 1024 * 1024;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 15000];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface PendingOAuthState {
  createdAtMs: number;
  redirectUri: string;
  scope: string;
}

export interface TikTokMediaProbe {
  width: number;
  height: number;
  durationSeconds: number;
  hasVideoStream: boolean;
}

export interface TikTokChunkPlan {
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
  ranges: Array<{ start: number; end: number; length: number }>;
}

class TikTokTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TikTokTransientError';
  }
}

export function isMp4MagicBytes(header: Buffer): boolean {
  if (header.length < 8) return false;
  // ISO BMFF / MP4 container always has 'ftyp' at byte offset 4..7
  return header.subarray(4, 8).toString('ascii') === 'ftyp';
}

export function getJakartaScheduleSlot(nowMs: number = Date.now()): {
  dateStr: string;
  hour: number;
  minute: number;
  slotKey: TikTokScheduleSlotWib | null;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs));

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));

  let slotKey: TikTokScheduleSlotWib | null = null;
  if (minute >= 0 && minute <= 5) {
    if (hour === 9) slotKey = '09:00';
    else if (hour === 12) slotKey = '12:00';
    else if (hour === 18) slotKey = '18:00';
  }

  return { dateStr, hour, minute, slotKey };
}

export function isTransientTikTokStatusOrCode(
  httpStatus: number,
  tiktokErrorCode?: string,
): boolean {
  if (httpStatus >= 500 && httpStatus <= 504) return true;
  if (httpStatus === 429) return true;
  const code = (tiktokErrorCode ?? '').toLowerCase();
  return code === 'internal_error' || code === 'rate_limit_exceeded';
}

export function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof TikTokTransientError) return true;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|AbortError|timed out|timeout|network|fetch failed/i.test(
    msg,
  );
}

export function computeTikTokChunkPlan(videoSize: number): TikTokChunkPlan {
  if (!Number.isFinite(videoSize) || videoSize <= 0) {
    throw new Error(
      'Ukuran file video MP4 tidak valid atau kosong (0 byte).',
    );
  }

  if (videoSize <= SINGLE_CHUNK_MAX_BYTES) {
    return {
      videoSize,
      chunkSize: videoSize,
      totalChunkCount: 1,
      ranges: [{ start: 0, end: videoSize - 1, length: videoSize }],
    };
  }

  const chunkSize = MULTI_CHUNK_BYTES;
  const totalChunkCount = Math.floor(videoSize / chunkSize);
  const ranges: Array<{ start: number; end: number; length: number }> = [];
  for (let i = 0; i < totalChunkCount; i += 1) {
    const start = i * chunkSize;
    const isLast = i === totalChunkCount - 1;
    const end = isLast ? videoSize - 1 : start + chunkSize - 1;
    ranges.push({ start, end, length: end - start + 1 });
  }
  return { videoSize, chunkSize, totalChunkCount, ranges };
}

function normalizeAppBaseUrl(rawUrl: string | undefined): string {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed || trimmed === 'MY_APP_URL') {
    return TIKTOK_DEV_APP_URL;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return TIKTOK_DEV_APP_URL;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return TIKTOK_DEV_APP_URL;
  }
}

export function buildTikTokCaption(video: ProducedVideoRecord): string {
  const cleanTitle = video.title.trim();
  const cleanCaption = video.caption.trim();
  const tags = video.hashtags
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(' ');
  const base = cleanCaption || cleanTitle;
  return `${base}${tags ? `\n\n${tags}` : ''}`.slice(0, 2200);
}

async function defaultProbeMedia(filePath: string): Promise<TikTokMediaProbe> {
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
        width?: number;
        height?: number;
      }>;
    };
    const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
    const durationSeconds = Number(parsed.format?.duration ?? 0);
    return {
      width: Number(videoStream?.width ?? 0),
      height: Number(videoStream?.height ?? 0),
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      hasVideoStream: Boolean(videoStream),
    };
  } catch {
    throw new Error(
      'Gagal membaca metadata video menggunakan FFprobe. Pastikan file MP4 tidak rusak.',
    );
  }
}

export class TikTokService {
  private readonly db: StudioDatabase;
  private readonly fetchImpl: typeof fetch;
  private readonly env: Record<string, string | undefined>;
  private readonly nowMs: () => number;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly retryDelaysMs: number[];
  private readonly probeMediaImpl: (filePath: string) => Promise<TikTokMediaProbe>;
  private readonly thumbnailGenerator?: (
    mp4Path: string,
    thumbPath: string,
  ) => Promise<void>;
  private readonly pendingStates = new Map<string, PendingOAuthState>();

  constructor(
    db: StudioDatabase,
    options?: {
      fetchImpl?: typeof fetch;
      env?: Record<string, string | undefined>;
      nowMs?: () => number;
      sleepImpl?: (ms: number) => Promise<void>;
      retryDelaysMs?: number[];
      probeMediaImpl?: (filePath: string) => Promise<TikTokMediaProbe>;
      thumbnailGenerator?: (mp4Path: string, thumbPath: string) => Promise<void>;
    },
  ) {
    this.db = db;
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.env = options?.env ?? process.env;
    this.nowMs = options?.nowMs ?? (() => Date.now());
    this.sleepImpl =
      options?.sleepImpl ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.retryDelaysMs = options?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.probeMediaImpl = options?.probeMediaImpl ?? defaultProbeMedia;
    this.thumbnailGenerator = options?.thumbnailGenerator;
  }

  private getCredentials(): {
    clientKey: string;
    clientSecret: string;
    missingKeys: string[];
  } {
    const rawKey = (this.env.TIKTOK_CLIENT_KEY ?? '').trim();
    const rawSecret = (this.env.TIKTOK_CLIENT_SECRET ?? '').trim();
    const clientKey =
      rawKey && rawKey !== 'MY_TIKTOK_CLIENT_KEY' ? rawKey : '';
    const clientSecret =
      rawSecret && rawSecret !== 'MY_TIKTOK_CLIENT_SECRET' ? rawSecret : '';

    const missingKeys: string[] = [];
    if (!clientKey) missingKeys.push('TIKTOK_CLIENT_KEY');
    if (!clientSecret) missingKeys.push('TIKTOK_CLIENT_SECRET');
    return { clientKey, clientSecret, missingKeys };
  }

  public resolveCallbackUrls(): {
    activeCallbackUrl: string;
    dev: string;
    shared: string;
  } {
    const activeBase = normalizeAppBaseUrl(this.env.APP_URL);
    return {
      activeCallbackUrl: `${activeBase}/api/tiktok/callback`,
      dev: `${TIKTOK_DEV_APP_URL}/api/tiktok/callback`,
      shared: `${TIKTOK_SHARED_APP_URL}/api/tiktok/callback`,
    };
  }

  public getPublicStatus(): TikTokAccountStatus {
    const { missingKeys } = this.getCredentials();
    const tokens = this.db.getTikTokTokens();
    const profile = this.db.getTikTokProfile();
    const settings = this.db.getTikTokSettings();
    const callbacks = this.resolveCallbackUrls();

    return {
      configured: missingKeys.length === 0,
      missingKeys,
      connected: Boolean(tokens?.accessToken && tokens?.openId),
      openId: profile?.openId ?? tokens?.openId ?? null,
      username: profile?.username ?? null,
      displayName: profile?.displayName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      scope: tokens?.scope ?? null,
      expiresAt: tokens?.expiresAtMs
        ? new Date(tokens.expiresAtMs).toISOString()
        : null,
      autoUploadEnabled: settings.autoUploadEnabled,
      defaultMode: settings.defaultMode,
      defaultPrivacy: settings.defaultPrivacy,
      scheduledHoursWib: [...TIKTOK_SCHEDULE_HOURS_WIB],
      archivedCount: this.db.countTikTokArchives(),
      activeCallbackUrl: callbacks.activeCallbackUrl,
      callbackUrls: {
        dev: callbacks.dev,
        shared: callbacks.shared,
      },
    };
  }

  private pruneExpiredStates(): void {
    const now = this.nowMs();
    for (const [key, entry] of this.pendingStates.entries()) {
      if (now - entry.createdAtMs > OAUTH_STATE_TTL_MS) {
        this.pendingStates.delete(key);
      }
    }
  }

  public buildAuthorizationUrl(
    _scopeMode: 'full' | 'draft' = 'full',
  ): {
    authUrl: string;
    redirectUri: string;
    scope: string;
  } {
    const { clientKey, missingKeys } = this.getCredentials();
    if (missingKeys.length > 0) {
      throw new Error(
        `Kredensial TikTok belum diatur di server (${missingKeys.join(', ')}). Tambahkan di Settings > Secrets terlebih dahulu.`,
      );
    }

    this.pruneExpiredStates();
    const state = crypto.randomBytes(24).toString('hex');
    const redirectUri = this.resolveCallbackUrls().activeCallbackUrl;
    const scope = 'user.info.basic,user.info.profile,user.info.stats,video.upload';

    this.pendingStates.set(state, {
      createdAtMs: this.nowMs(),
      redirectUri,
      scope,
    });

    const params = new URLSearchParams({
      client_key: clientKey,
      scope,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });

    return {
      authUrl: `${TIKTOK_AUTH_URL}?${params.toString()}`,
      redirectUri,
      scope,
    };
  }

  private consumeValidState(providedState: string): PendingOAuthState {
    this.pruneExpiredStates();
    if (!providedState || typeof providedState !== 'string') {
      throw new Error('Parameter state OAuth TikTok tidak ditemukan.');
    }

    let matchedKey: string | null = null;
    const providedBuf = Buffer.from(providedState, 'utf8');
    for (const candidateKey of this.pendingStates.keys()) {
      const candidateBuf = Buffer.from(candidateKey, 'utf8');
      if (
        candidateBuf.length === providedBuf.length &&
        crypto.timingSafeEqual(candidateBuf, providedBuf)
      ) {
        matchedKey = candidateKey;
        break;
      }
    }

    if (!matchedKey) {
      throw new Error(
        'State OAuth TikTok tidak valid atau sudah kedaluwarsa. Silakan ulangi koneksi akun TikTok.',
      );
    }

    const entry = this.pendingStates.get(matchedKey)!;
    this.pendingStates.delete(matchedKey);
    if (this.nowMs() - entry.createdAtMs > OAUTH_STATE_TTL_MS) {
      throw new Error(
        'Sesi login TikTok kedaluwarsa (>10 menit). Silakan klik Hubungkan Akun TikTok kembali.',
      );
    }
    return entry;
  }

  public async handleOAuthCallback(
    code: string,
    state: string,
  ): Promise<TikTokAccountStatus> {
    if (!code || typeof code !== 'string') {
      throw new Error('Kode otorisasi TikTok tidak ditemukan.');
    }
    const { clientKey, clientSecret, missingKeys } = this.getCredentials();
    if (missingKeys.length > 0) {
      throw new Error(
        `Kredensial TikTok belum dikonfigurasi (${missingKeys.join(', ')}).`,
      );
    }

    const stateMeta = this.consumeValidState(state);

    const form = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: stateMeta.redirectUri,
    });

    const tokenRes = await this.fetchImpl(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: form.toString(),
    });

    const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      open_id?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenJson.access_token || !tokenJson.open_id) {
      const detail =
        tokenJson.error_description ||
        tokenJson.error ||
        `HTTP ${tokenRes.status}`;
      throw new Error(`Penukaran token TikTok gagal: ${detail}`);
    }

    const now = this.nowMs();
    const tokens: StoredTikTokTokens = {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? '',
      expiresAtMs: now + Number(tokenJson.expires_in ?? 86400) * 1000,
      refreshExpiresAtMs:
        now + Number(tokenJson.refresh_expires_in ?? 86400 * 365) * 1000,
      scope: tokenJson.scope ?? stateMeta.scope,
      openId: tokenJson.open_id,
    };

    let profile: StoredTikTokProfile = {
      openId: tokens.openId,
      username: null,
      displayName: null,
      avatarUrl: null,
    };

    try {
      const userRes = await this.fetchImpl(TIKTOK_USER_INFO_URL, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      });
      if (userRes.ok) {
        const userJson = (await userRes.json().catch(() => ({}))) as {
          data?: {
            user?: {
              open_id?: string;
              username?: string;
              display_name?: string;
              avatar_url?: string;
            };
          };
        };
        const user = userJson.data?.user;
        if (user) {
          profile = {
            openId: user.open_id ?? tokens.openId,
            username: user.username ?? null,
            displayName: user.display_name ?? null,
            avatarUrl: user.avatar_url ?? null,
          };
        }
      }
    } catch {
      // Keep fallback openId profile if optional user info fails transiently
    }

    this.db.setTikTokTokens(tokens);
    this.db.setTikTokProfile(profile);
    this.db.appendLog(
      'publisher',
      'success',
      `Akun TikTok terhubung (${profile.username ? `@${profile.username}` : profile.displayName || profile.openId}).`,
    );

    return this.getPublicStatus();
  }

  private async executeWithRetry<T>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastErr: unknown;
    const maxRetries = this.retryDelaysMs.length;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (err) {
        lastErr = err;
        if (!isTransientNetworkError(err) || attempt >= maxRetries) {
          throw err;
        }
        const waitMs = this.retryDelaysMs[attempt] ?? 2000;
        await this.sleepImpl(waitMs);
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(`Operasi ${label} gagal setelah ${maxRetries}x percobaan ulang.`);
  }

  public async validatePreFlight(
    video: ProducedVideoRecord,
    filePath: string,
  ): Promise<{ fileSizeBytes: number; probe: TikTokMediaProbe }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        'File video MP4 tidak ditemukan di penyimpanan server. Upload ke TikTok dibatalkan.',
      );
    }

    const stat = fs.statSync(filePath);
    if (stat.size <= 0) {
      throw new Error(
        'File video kosong (0 byte). Upload ke TikTok dibatalkan.',
      );
    }
    if (stat.size >= MAX_UPLOAD_SIZE_BYTES) {
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
      throw new Error(
        `Ukuran file video (${sizeMb} MB) melebihi batas maksimal 128 MB. Upload ke TikTok dibatalkan.`,
      );
    }

    // Read magic bytes instead of relying on filename extension
    const headerBuf = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    try {
      const bytesRead = fs.readSync(fd, headerBuf, 0, 12, 0);
      if (!isMp4MagicBytes(headerBuf.subarray(0, bytesRead))) {
        throw new Error(
          'Format file tidak valid: bukan container MP4 asli (signature "ftyp" tidak ditemukan). Upload ke TikTok dibatalkan.',
        );
      }
    } finally {
      fs.closeSync(fd);
    }

    if (video.qcPassed !== true || video.aiQcStatus !== 'passed') {
      throw new Error(
        'Video belum lulus Kontrol Kualitas AI penuh (wajib qcPassed=true dan aiQcStatus="passed"). Upload ke TikTok dibatalkan.',
      );
    }

    const probe = await this.probeMediaImpl(filePath);
    if (!probe.hasVideoStream || probe.width <= 0 || probe.height <= 0) {
      throw new Error(
        'Stream video tidak ditemukan atau resolusi tidak valid pada file MP4.',
      );
    }

    if (probe.width < 720 || probe.height < 1280) {
      throw new Error(
        `Resolusi video (${probe.width}x${probe.height}) di bawah batas minimal 720x1280 untuk TikTok vertikal 9:16.`,
      );
    }

    const ratio = probe.width / probe.height;
    const expectedRatio = 9 / 16;
    if (Math.abs(ratio - expectedRatio) > 0.03) {
      throw new Error(
        `Rasio aspek video (${probe.width}x${probe.height}) harus vertikal 9:16.`,
      );
    }

    if (probe.durationSeconds < 5 || probe.durationSeconds > 60) {
      throw new Error(
        `Durasi video (${probe.durationSeconds.toFixed(1)} detik) di luar rentang wajib 5–60 detik.`,
      );
    }

    return { fileSizeBytes: stat.size, probe };
  }

  public async ensureFreshAccessToken(): Promise<StoredTikTokTokens> {
    const existing = this.db.getTikTokTokens();
    if (!existing) {
      throw new Error(
        'Akun TikTok belum terhubung. Klik "Hubungkan Akun TikTok" terlebih dahulu.',
      );
    }

    const now = this.nowMs();
    if (existing.expiresAtMs - now > 120_000) {
      return existing;
    }

    if (!existing.refreshToken) {
      return existing;
    }

    const { clientKey, clientSecret, missingKeys } = this.getCredentials();
    if (missingKeys.length > 0) {
      throw new Error(
        `Tidak dapat menyegarkan token TikTok karena ${missingKeys.join(', ')} belum diatur.`,
      );
    }

    const form = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: existing.refreshToken,
    });

    return this.executeWithRetry('refresh token TikTok', async () => {
      const refreshRes = await this.fetchImpl(TIKTOK_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });

      const refreshJson = (await refreshRes.json().catch(() => ({}))) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        refresh_expires_in?: number;
        open_id?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };

      if (isTransientTikTokStatusOrCode(refreshRes.status, refreshJson.error)) {
        throw new TikTokTransientError(
          `Server TikTok sibuk saat memperbarui token (HTTP ${refreshRes.status}).`,
        );
      }

      if (!refreshRes.ok || !refreshJson.access_token) {
        const detail =
          refreshJson.error_description ||
          refreshJson.error ||
          `HTTP ${refreshRes.status}`;
        throw new Error(
          `Token akses TikTok kedaluwarsa dan gagal diperbarui (${detail}). Silakan hubungkan ulang akun TikTok.`,
        );
      }

      const refreshed: StoredTikTokTokens = {
        accessToken: refreshJson.access_token,
        refreshToken: refreshJson.refresh_token || existing.refreshToken,
        expiresAtMs: now + Number(refreshJson.expires_in ?? 86400) * 1000,
        refreshExpiresAtMs:
          now +
          Number(refreshJson.refresh_expires_in ?? 86400 * 365) * 1000,
        scope: refreshJson.scope || existing.scope,
        openId: refreshJson.open_id || existing.openId,
      };

      this.db.setTikTokTokens(refreshed);
      return refreshed;
    });
  }

  public async uploadVideoToTikTok(params: {
    video: ProducedVideoRecord;
    filePath: string;
    mode?: TikTokPublishMode;
    privacyLevel?: TikTokPrivacyLevel;
  }): Promise<{
    status: Exclude<TikTokUploadStatus, 'none' | 'uploading' | 'failed'>;
    publishId: string;
    mode: TikTokPublishMode;
    remotePublishStatus: string;
  }> {
    const settings = this.db.getTikTokSettings();
    const mode: TikTokPublishMode = params.mode ?? settings.defaultMode;
    const privacyLevel: TikTokPrivacyLevel =
      params.privacyLevel ?? settings.defaultPrivacy;

    try {
      // 1. Pre-flight validation BEFORE touching TikTok API
      const { fileSizeBytes } = await this.validatePreFlight(
        params.video,
        params.filePath,
      );

      const chunkPlan = computeTikTokChunkPlan(fileSizeBytes);
      const tokens = await this.ensureFreshAccessToken();
      const initUrl =
        mode === 'direct' ? TIKTOK_DIRECT_INIT_URL : TIKTOK_INBOX_INIT_URL;

      const initBody =
        mode === 'direct'
          ? {
              post_info: {
                title: buildTikTokCaption(params.video),
                privacy_level: privacyLevel,
                disable_duet: false,
                disable_comment: false,
                disable_stitch: false,
              },
              source_info: {
                source: 'FILE_UPLOAD',
                video_size: chunkPlan.videoSize,
                chunk_size: chunkPlan.chunkSize,
                total_chunk_count: chunkPlan.totalChunkCount,
              },
            }
          : {
              source_info: {
                source: 'FILE_UPLOAD',
                video_size: chunkPlan.videoSize,
                chunk_size: chunkPlan.chunkSize,
                total_chunk_count: chunkPlan.totalChunkCount,
              },
            };

      // 2. Initialize upload session with retry on transient errors
      const { uploadUrl, publishId } = await this.executeWithRetry(
        'inisialisasi upload TikTok',
        async () => {
          const initRes = await this.fetchImpl(initUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify(initBody),
          });

          const initJson = (await initRes.json().catch(() => ({}))) as {
            data?: {
              publish_id?: string;
              upload_url?: string;
            };
            error?: {
              code?: string;
              message?: string;
            };
          };

          const errCode = initJson.error?.code;
          if (isTransientTikTokStatusOrCode(initRes.status, errCode)) {
            throw new TikTokTransientError(
              `Gangguan sementara server TikTok saat inisialisasi (${errCode || `HTTP ${initRes.status}`}).`,
            );
          }

          if (
            !initRes.ok ||
            (errCode && errCode !== 'ok') ||
            !initJson.data?.upload_url ||
            !initJson.data?.publish_id
          ) {
            const detail =
              initJson.error?.message ||
              errCode ||
              `HTTP ${initRes.status}`;
            const hint =
              mode === 'direct' && /unaudited|privacy|scope/i.test(detail)
                ? " (Tips Sandbox TikTok: untuk Direct Post di mode Sandbox, gunakan privasi 'Hanya Saya / SELF_ONLY' atau pilih mode 'Kirim ke Draft (Inbox TikTok)' sampai aplikasi lolos review TikTok)"
                : '';
            throw new Error(`Inisialisasi upload TikTok gagal: ${detail}${hint}`);
          }

          return {
            uploadUrl: initJson.data.upload_url,
            publishId: initJson.data.publish_id,
          };
        },
      );

      // 3. Upload MP4 chunk(s) with transient retry per chunk (never delete local file on failure)
      const fd = fs.openSync(params.filePath, 'r');
      try {
        for (const range of chunkPlan.ranges) {
          const buffer = Buffer.allocUnsafe(range.length);
          const bytesRead = fs.readSync(
            fd,
            buffer,
            0,
            range.length,
            range.start,
          );
          const payload =
            bytesRead === range.length ? buffer : buffer.subarray(0, bytesRead);

          await this.executeWithRetry('unggah chunk MP4 TikTok', async () => {
            const putRes = await this.fetchImpl(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': String(payload.length),
                'Content-Range': `bytes ${range.start}-${range.start + payload.length - 1}/${chunkPlan.videoSize}`,
              },
              body: new Uint8Array(payload),
            });

            if (isTransientTikTokStatusOrCode(putRes.status)) {
              throw new TikTokTransientError(
                `Gangguan sementara server TikTok saat mengunggah potongan video (HTTP ${putRes.status}).`,
              );
            }

            if (!putRes.ok) {
              const putText = await putRes.text().catch(() => '');
              throw new Error(
                `Upload chunk MP4 ke TikTok gagal (HTTP ${putRes.status})${putText ? `: ${putText.slice(0, 160)}` : ''}`,
              );
            }
          });
        }
      } finally {
        fs.closeSync(fd);
      }

      // 4. Verify publish status
      let remotePublishStatus =
        mode === 'draft' ? 'SEND_TO_USER_INBOX' : 'PROCESSING_UPLOAD';
      try {
        await this.executeWithRetry('cek status upload TikTok', async () => {
          const statusRes = await this.fetchImpl(TIKTOK_PUBLISH_STATUS_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify({ publish_id: publishId }),
          });
          if (isTransientTikTokStatusOrCode(statusRes.status)) {
            throw new TikTokTransientError(
              `Status check sementara gagal (HTTP ${statusRes.status}).`,
            );
          }
          if (statusRes.ok) {
            const statusJson = (await statusRes.json().catch(() => ({}))) as {
              data?: { status?: string; fail_reason?: string };
              error?: { code?: string; message?: string };
            };
            if (isTransientTikTokStatusOrCode(200, statusJson.error?.code)) {
              throw new TikTokTransientError(
                `Status check TikTok sementara gagal (${statusJson.error?.code}).`,
              );
            }
            if (statusJson.data?.status === 'FAILED') {
              throw new Error(
                `TikTok menolak pemrosesan video: ${statusJson.data.fail_reason || 'alasan tidak diketahui'}`,
              );
            }
            if (statusJson.data?.status) {
              remotePublishStatus = statusJson.data.status;
            }
          }
        });
      } catch (statusErr) {
        if (
          statusErr instanceof Error &&
          statusErr.message.startsWith('TikTok menolak pemrosesan video')
        ) {
          throw statusErr;
        }
        // Transient status poll failures don't invalidate the completed file upload
      }

      const finalLocalStatus = mode === 'draft' ? 'draft_sent' : 'published';
      const uploadedAt = new Date(this.nowMs()).toISOString();
      this.db.updateVideoTikTokStatus(params.video.id, {
        tiktokStatus: finalLocalStatus,
        tiktokPublishId: publishId,
        tiktokMode: mode,
        tiktokError: null,
        tiktokUploadedAt: uploadedAt,
      });

      return {
        status: finalLocalStatus,
        publishId,
        mode,
        remotePublishStatus,
      };
    } catch (err) {
      const rawMessage =
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan tidak terduga saat mengunggah video ke TikTok.';
      const indonesianMessage = rawMessage.slice(0, 420);

      // Persist failed state and NEVER delete local MP4 file
      this.db.updateVideoTikTokStatus(params.video.id, {
        tiktokStatus: 'failed',
        tiktokPublishId: params.video.tiktokPublishId ?? null,
        tiktokMode: mode,
        tiktokError: indonesianMessage,
        tiktokUploadedAt: params.video.tiktokUploadedAt ?? null,
      });

      throw err instanceof Error ? err : new Error(indonesianMessage);
    }
  }

  public async cleanupUploadedVideo(
    videoId: string,
    options?: { minAgeAfterUploadMs?: number },
  ): Promise<{
    cleaned: boolean;
    freedBytes: number;
    thumbnailFileName: string | null;
    reason?: string;
  }> {
    return this.db.cleanupUploadedVideo(videoId, {
      minAgeAfterUploadMs: options?.minAgeAfterUploadMs ?? 60_000,
      nowMs: this.nowMs(),
      thumbnailGenerator: this.thumbnailGenerator,
    });
  }

  public async cleanupAllEligible(options?: {
    minAgeAfterUploadMs?: number;
  }): Promise<{
    cleanedCount: number;
    freedBytes: number;
    skipped: Array<{ videoId: string; reason: string }>;
    errors: Array<{ videoId: string; error: string }>;
    archivedCount: number;
  }> {
    const minAgeAfterUploadMs = options?.minAgeAfterUploadMs ?? 60_000;
    const videos = this.db.listVideos(200);
    let cleanedCount = 0;
    let freedBytes = 0;
    const skipped: Array<{ videoId: string; reason: string }> = [];
    const errors: Array<{ videoId: string; error: string }> = [];

    for (const video of videos) {
      if (video.fileCleanedUp) continue;
      // Guard clause: never touch uploading or failed videos
      if (video.tiktokStatus === 'uploading' || video.tiktokStatus === 'failed') {
        skipped.push({
          videoId: video.id,
          reason:
            video.tiktokStatus === 'uploading'
              ? 'Sedang proses upload (uploading).'
              : 'Status upload gagal (failed).',
        });
        continue;
      }

      if (
        video.tiktokStatus !== 'draft_sent' &&
        video.tiktokStatus !== 'published'
      ) {
        continue;
      }

      // Guard clause for auto-run: if minAgeAfterUploadMs >= 24h, also ensure video itself is >= 24h old
      if (minAgeAfterUploadMs >= ONE_DAY_MS) {
        const createdMs = Date.parse(video.createdAt);
        if (!Number.isFinite(createdMs) || this.nowMs() - createdMs < ONE_DAY_MS) {
          skipped.push({
            videoId: video.id,
            reason: 'Video masih berumur kurang dari 24 jam (antisipasi re-upload).',
          });
          continue;
        }
      }

      try {
        const res = await this.cleanupUploadedVideo(video.id, {
          minAgeAfterUploadMs,
        });
        if (res.cleaned) {
          cleanedCount += 1;
          freedBytes += res.freedBytes;
        } else if (res.reason) {
          skipped.push({ videoId: video.id, reason: res.reason });
        }
      } catch (err) {
        errors.push({
          videoId: video.id,
          error:
            err instanceof Error
              ? err.message
              : 'Gagal membersihkan file video.',
        });
      }
    }

    return {
      cleanedCount,
      freedBytes,
      skipped,
      errors,
      archivedCount: this.db.countTikTokArchives(),
    };
  }
}
