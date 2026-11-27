import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StudioDatabase } from './studioDb.ts';
import {
  TIKTOK_DEV_APP_URL,
  TIKTOK_SHARED_APP_URL,
  TikTokService,
  type TikTokMediaProbe,
  buildTikTokCaption,
  computeTikTokChunkPlan,
  getJakartaScheduleSlot,
} from './tiktokService.ts';
import type { ProducedVideoRecord } from '../src/studio/types.ts';

function makeTempSetup(envOverrides?: Record<string, string | undefined>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yendra-tiktok-test-'));
  const db = new StudioDatabase({
    dbPath: path.join(dir, 'test.sqlite'),
    storageRoot: dir,
  });
  const env = {
    TIKTOK_CLIENT_KEY: 'tk_test_key',
    TIKTOK_CLIENT_SECRET: 'tk_test_secret',
    APP_URL: 'https://custom-yendra.example.com/',
    ...envOverrides,
  };
  return { db, dir, env };
}

function makeFakeMp4Buffer(size = 128_000): Buffer {
  const buf = Buffer.alloc(size, 7);
  // ISO BMFF / MP4 container header: size=24 + 'ftyp' + 'isom'
  Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
  ]).copy(buf, 0);
  return buf;
}

function makeFakeWebmBuffer(size = 64_000): Buffer {
  const buf = Buffer.alloc(size, 9);
  // Matroska / WebM EBML header (no 'ftyp')
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]).copy(buf, 0);
  return buf;
}

function makeValidProbe(overrides?: Partial<TikTokMediaProbe>): TikTokMediaProbe {
  return {
    width: 1080,
    height: 1920,
    durationSeconds: 42,
    hasVideoStream: true,
    ...overrides,
  };
}

function seedConnectedTokens(db: StudioDatabase, nowMs: number): void {
  db.setTikTokTokens({
    accessToken: 'valid_act_001',
    refreshToken: 'valid_rft_001',
    expiresAtMs: nowMs + 86_400_000,
    refreshExpiresAtMs: nowMs + 86_400_000 * 30,
    scope: 'user.info.basic,user.info.profile,user.info.stats,video.upload',
    openId: 'open_yendra_001',
  });
}

function makeSampleVideo(
  db: StudioDatabase,
  options?: {
    id?: string;
    fileName?: string;
    buffer?: Buffer;
    qcPassed?: boolean;
    aiQcStatus?: ProducedVideoRecord['aiQcStatus'];
    createdAt?: string;
    tiktokStatus?: ProducedVideoRecord['tiktokStatus'];
    tiktokPublishId?: string | null;
    tiktokUploadedAt?: string | null;
  },
): {
  video: ProducedVideoRecord;
  filePath: string;
} {
  db.ensureScheduleForDate('2026-11-23');
  const job = db.listJobs(1)[0];
  const id = options?.id ?? 'vid_tiktok_test_01';
  const fileName = options?.fileName ?? `${id}.mp4`;
  const filePath = db.resolveConfinedPath('videos', fileName);
  const content = options?.buffer ?? makeFakeMp4Buffer(128_000);
  fs.writeFileSync(filePath, content);

  const video: ProducedVideoRecord = {
    id,
    jobId: job.id,
    scheduleDate: '2026-11-23',
    topicSlug: job.topicSlug,
    title: 'Bangkit Saat Terpuruk',
    description: 'Motivasi harian.',
    caption: 'Mulai lagi hari ini, langkah kecil tetap berarti.',
    hashtags: ['#MotivasiHidup', '#BangkitLagi'],
    hookText: 'Jangan menyerah hari ini.',
    endingText: 'Terus melangkah.',
    scriptText: 'Naskah motivasi.',
    subtitlesSrt: '1\n00:00:00,000 --> 00:00:03,000\nMulai lagi.\n',
    researchSummary: 'Ringkasan motivasi.',
    researchReferences: ['Ref'],
    fileName,
    fileSizeBytes: content.length,
    width: 1080,
    height: 1920,
    durationSeconds: 42,
    qcPassed: options?.qcPassed ?? true,
    aiQcStatus: options?.aiQcStatus ?? 'passed',
    qcNotes: 'Verified',
    tiktokStatus: options?.tiktokStatus ?? 'none',
    tiktokPublishId: options?.tiktokPublishId ?? null,
    tiktokUploadedAt: options?.tiktokUploadedAt ?? null,
    createdAt: options?.createdAt ?? new Date().toISOString(),
  };
  db.insertVideo(video);
  return { video, filePath };
}

test('getPublicStatus resolves callback URLs and reports missing keys cleanly without tokens', () => {
  const { db, dir } = makeTempSetup({
    TIKTOK_CLIENT_KEY: '',
    TIKTOK_CLIENT_SECRET: '',
    APP_URL: 'MY_APP_URL',
  });
  try {
    const svc = new TikTokService(db, { env: { APP_URL: 'MY_APP_URL' } });
    const status = svc.getPublicStatus();
    assert.equal(status.configured, false);
    assert.deepEqual(status.missingKeys, [
      'TIKTOK_CLIENT_KEY',
      'TIKTOK_CLIENT_SECRET',
    ]);
    assert.equal(status.connected, false);
    assert.equal(status.activeCallbackUrl, `${TIKTOK_DEV_APP_URL}/api/tiktok/callback`);
    assert.equal(status.callbackUrls.dev, `${TIKTOK_DEV_APP_URL}/api/tiktok/callback`);
    assert.equal(status.callbackUrls.shared, `${TIKTOK_SHARED_APP_URL}/api/tiktok/callback`);
    assert.deepEqual(status.scheduledHoursWib, ['09:00', '12:00', '18:00']);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('buildAuthorizationUrl generates valid TikTok OAuth URL and rejects tampered or replayed state', async () => {
  const { db, dir, env } = makeTempSetup();
  try {
    const calls: Array<{ url: string; method: string }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('/v2/oauth/token/')) {
        return new Response(
          JSON.stringify({
            access_token: 'act_secret_token_123',
            refresh_token: 'rft_secret_token_456',
            expires_in: 86400,
            refresh_expires_in: 31536000,
            open_id: 'open_yendra_001',
            scope: 'user.info.basic,user.info.profile,user.info.stats,video.upload',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/v2/user/info/')) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                open_id: 'open_yendra_001',
                username: 'yendra.motion',
                display_name: 'Yendra Motion Studio',
                avatar_url: 'https://example.com/avatar.png',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const svc = new TikTokService(db, { env, fetchImpl: fakeFetch });
    const { authUrl, redirectUri } = svc.buildAuthorizationUrl('full');
    const parsed = new URL(authUrl);

    assert.equal(parsed.origin, 'https://www.tiktok.com');
    assert.equal(parsed.pathname, '/v2/auth/authorize/');
    assert.equal(parsed.searchParams.get('client_key'), 'tk_test_key');
    assert.equal(
      parsed.searchParams.get('scope'),
      'user.info.basic,user.info.profile,user.info.stats,video.upload',
    );
    assert.equal(
      redirectUri,
      'https://custom-yendra.example.com/api/tiktok/callback',
    );
    const state = parsed.searchParams.get('state') ?? '';
    assert.ok(state.length >= 32);

    // Rejects tampered state
    await assert.rejects(
      () => svc.handleOAuthCallback('auth_code_1', 'tampered_state'),
      /State OAuth TikTok tidak valid/i,
    );

    // Succeeds on valid state and stores profile + tokens securely
    const status = await svc.handleOAuthCallback('auth_code_1', state);
    assert.equal(status.connected, true);
    assert.equal(status.username, 'yendra.motion');
    assert.equal(status.displayName, 'Yendra Motion Studio');
    // Public status must NEVER contain token fields
    assert.equal('accessToken' in status, false);
    assert.equal('refreshToken' in status, false);

    // Replaying the same single-use state fails
    await assert.rejects(
      () => svc.handleOAuthCallback('auth_code_1', state),
      /State OAuth TikTok tidak valid/i,
    );
    assert.equal(calls.length, 2);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('uploadVideoToTikTok refreshes expired token, sends draft inbox init + PUT bytes, and persists publish_id', async () => {
  const { db, dir, env } = makeTempSetup();
  try {
    const now = 1_700_000_000_000;
    const { video, filePath } = makeSampleVideo(db);

    // Store an almost-expired token (30 seconds remaining)
    db.setTikTokTokens({
      accessToken: 'expired_act',
      refreshToken: 'valid_rft',
      expiresAtMs: now + 30_000,
      refreshExpiresAtMs: now + 86400_000,
      scope: 'user.info.basic,user.info.profile,user.info.stats,video.upload',
      openId: 'open_yendra_001',
    });

    const recordedRequests: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      bodySize: number;
    }> = [];

    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const headersObj: Record<string, string> = {};
      if (init?.headers && !(init.headers instanceof Headers)) {
        for (const [k, v] of Object.entries(init.headers)) {
          headersObj[k.toLowerCase()] = String(v);
        }
      }
      const bodyLen =
        typeof init?.body === 'string'
          ? init.body.length
          : init?.body instanceof Uint8Array
            ? init.body.byteLength
            : 0;
      recordedRequests.push({
        url,
        method: init?.method ?? 'GET',
        headers: headersObj,
        bodySize: bodyLen,
      });

      if (url.includes('/v2/oauth/token/')) {
        return new Response(
          JSON.stringify({
            access_token: 'fresh_act_999',
            refresh_token: 'fresh_rft_999',
            expires_in: 86400,
            open_id: 'open_yendra_001',
          }),
          { status: 200 },
        );
      }
      if (url.includes('/v2/post/publish/inbox/video/init/')) {
        return new Response(
          JSON.stringify({
            data: {
              publish_id: 'v_inbox_file~v2.123456',
              upload_url: 'https://open-upload.tiktokapis.com/upload/part1',
            },
            error: { code: 'ok', message: '' },
          }),
          { status: 200 },
        );
      }
      if (url.includes('open-upload.tiktokapis.com')) {
        return new Response('', { status: 201 });
      }
      if (url.includes('/v2/post/publish/status/fetch/')) {
        return new Response(
          JSON.stringify({
            data: { status: 'SEND_TO_USER_INBOX' },
            error: { code: 'ok' },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const svc = new TikTokService(db, {
      env,
      fetchImpl: fakeFetch,
      nowMs: () => now,
      probeMediaImpl: async () => makeValidProbe(),
    });

    const result = await svc.uploadVideoToTikTok({
      video,
      filePath,
      mode: 'draft',
    });

    assert.equal(result.status, 'draft_sent');
    assert.equal(result.publishId, 'v_inbox_file~v2.123456');
    assert.equal(result.remotePublishStatus, 'SEND_TO_USER_INBOX');

    // Verify refresh -> inbox init -> PUT MP4 bytes -> status fetch sequence
    assert.equal(recordedRequests.length, 4);
    assert.match(recordedRequests[0].url, /\/v2\/oauth\/token\//);
    assert.equal(
      recordedRequests[1].headers['authorization'],
      'Bearer fresh_act_999',
    );
    assert.equal(recordedRequests[2].method, 'PUT');
    assert.equal(recordedRequests[2].headers['content-type'], 'video/mp4');
    assert.equal(
      recordedRequests[2].headers['content-range'],
      'bytes 0-127999/128000',
    );
    assert.equal(recordedRequests[2].bodySize, 128_000);

    const updatedVideo = db.getVideoById(video.id);
    assert.equal(updatedVideo?.tiktokStatus, 'draft_sent');
    assert.equal(updatedVideo?.tiktokPublishId, 'v_inbox_file~v2.123456');
    assert.equal(updatedVideo?.tiktokMode, 'draft');
    assert.equal(updatedVideo?.tiktokError, null);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Test 1: Upload sukses -> cleanupUploadedVideo (setelah safety window 60s) -> MP4 dihapus, archive DB & thumbnail JPG tercipta', async () => {
  const { db, dir, env } = makeTempSetup();
  try {
    let now = 1_700_000_000_000;
    const { video, filePath } = makeSampleVideo(db, { id: 'vid_cleanup_ok' });
    seedConnectedTokens(db, now);

    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/v2/post/publish/inbox/video/init/')) {
        return new Response(
          JSON.stringify({
            data: {
              publish_id: 'v_inbox_archive_001',
              upload_url: 'https://open-upload.tiktokapis.com/upload/archive1',
            },
            error: { code: 'ok' },
          }),
          { status: 200 },
        );
      }
      if (url.includes('open-upload.tiktokapis.com')) {
        return new Response('', { status: 201 });
      }
      if (url.includes('/v2/post/publish/status/fetch/')) {
        return new Response(
          JSON.stringify({
            data: { status: 'SEND_TO_USER_INBOX' },
            error: { code: 'ok' },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const svc = new TikTokService(db, {
      env,
      fetchImpl: fakeFetch,
      nowMs: () => now,
      probeMediaImpl: async () => makeValidProbe(),
      thumbnailGenerator: async (_mp4Path, thumbPath) => {
        fs.writeFileSync(thumbPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
      },
    });

    const uploadRes = await svc.uploadVideoToTikTok({
      video,
      filePath,
      mode: 'draft',
    });
    assert.equal(uploadRes.status, 'draft_sent');
    assert.equal(fs.existsSync(filePath), true);

    // Within 60s safety window -> cleanup MUST wait and NOT delete MP4
    now += 30_000;
    const premature = await svc.cleanupUploadedVideo(video.id);
    assert.equal(premature.cleaned, false);
    assert.equal(fs.existsSync(filePath), true);

    // After >60s -> cleanup deletes physical MP4, saves JPG thumbnail, and archives metadata
    now += 35_000; // total 65s
    const cleanupRes = await svc.cleanupUploadedVideo(video.id);
    assert.equal(cleanupRes.cleaned, true);
    assert.equal(cleanupRes.freedBytes, 128_000);
    assert.equal(cleanupRes.thumbnailFileName, `${video.id}.jpg`);

    // Physical MP4 must be gone
    assert.equal(fs.existsSync(filePath), false);

    // Thumbnail JPG must exist
    const thumbPath = db.resolveConfinedPath('thumbnails', `${video.id}.jpg`);
    assert.equal(fs.existsSync(thumbPath), true);

    // Archive row must exist in tiktok_upload_archive
    const archiveRow = db.getTikTokArchiveByVideoId(video.id);
    assert.ok(archiveRow);
    assert.equal(archiveRow.publishId, 'v_inbox_archive_001');
    assert.equal(archiveRow.fileNameOriginal, video.fileName);
    assert.equal(archiveRow.fileSizeBytes, 128_000);
    assert.equal(archiveRow.thumbnailFileName, `${video.id}.jpg`);

    // Video record marked cleaned up
    const updatedVideo = db.getVideoById(video.id);
    assert.equal(updatedVideo?.fileCleanedUp, true);
    assert.equal(updatedVideo?.thumbnailFileName, `${video.id}.jpg`);

    // Storage log recorded with exact format
    const logs = db.listLogs(20);
    assert.ok(
      logs.some(
        (l) =>
          l.agentId === 'storage' &&
          l.message.includes(`Video ${video.id} dihapus dari storage setelah upload berhasil. Hemat:`),
      ),
    );
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Test 2: Upload gagal (mock HTTP 500 pada chunk) -> file MP4 fisik TETAP ADA & tiktokStatus === failed', async () => {
  const { db, dir, env } = makeTempSetup();
  try {
    const now = 1_700_000_000_000;
    const { video, filePath } = makeSampleVideo(db, { id: 'vid_fail_500' });
    seedConnectedTokens(db, now);
    const sleepCalls: number[] = [];

    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/v2/post/publish/inbox/video/init/')) {
        return new Response(
          JSON.stringify({
            data: {
              publish_id: 'v_inbox_fail_500',
              upload_url: 'https://open-upload.tiktokapis.com/upload/fail500',
            },
            error: { code: 'ok' },
          }),
          { status: 200 },
        );
      }
      if (url.includes('open-upload.tiktokapis.com')) {
        return new Response('Internal Server Error', { status: 500 });
      }
      return new Response('{}', { status: 404 });
    };

    const svc = new TikTokService(db, {
      env,
      fetchImpl: fakeFetch,
      nowMs: () => now,
      sleepImpl: async (ms) => {
        sleepCalls.push(ms);
      },
      probeMediaImpl: async () => makeValidProbe(),
    });

    await assert.rejects(
      () => svc.uploadVideoToTikTok({ video, filePath, mode: 'draft' }),
      /HTTP 500/i,
    );

    // Exhausted 3 retries with [2000, 5000, 15000] backoff
    assert.deepEqual(sleepCalls, [2000, 5000, 15000]);

    // Physical MP4 MUST NOT BE DELETED
    assert.equal(fs.existsSync(filePath), true);

    // DB state must be 'failed' with Indonesian error message
    const failedVideo = db.getVideoById(video.id);
    assert.equal(failedVideo?.tiktokStatus, 'failed');
    assert.ok(failedVideo?.tiktokError && failedVideo.tiktokError.length > 0);
    assert.equal(failedVideo?.fileCleanedUp, false);

    // cleanupUploadedVideo must refuse to delete a 'failed' video
    const cleanupAttempt = await svc.cleanupUploadedVideo(video.id, {
      minAgeAfterUploadMs: 0,
    });
    assert.equal(cleanupAttempt.cleaned, false);
    assert.equal(fs.existsSync(filePath), true);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Test 3: Retry logic berhasil pada percobaan ke-2 (HTTP 500 -> HTTP 200) dengan exponential backoff 2s/5s/15s', async () => {
  const { db, dir, env } = makeTempSetup();
  try {
    const now = 1_700_000_000_000;
    const { video, filePath } = makeSampleVideo(db, { id: 'vid_retry_ok' });
    seedConnectedTokens(db, now);
    const sleepCalls: number[] = [];
    let initAttempts = 0;

    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/v2/post/publish/inbox/video/init/')) {
        initAttempts += 1;
        if (initAttempts === 1) {
          return new Response(
            JSON.stringify({ error: { code: 'internal_error', message: 'Busy' } }),
            { status: 502 },
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              publish_id: 'v_inbox_retry_success',
              upload_url: 'https://open-upload.tiktokapis.com/upload/retryok',
            },
            error: { code: 'ok' },
          }),
          { status: 200 },
        );
      }
      if (url.includes('open-upload.tiktokapis.com')) {
        return new Response('', { status: 201 });
      }
      if (url.includes('/v2/post/publish/status/fetch/')) {
        return new Response(
          JSON.stringify({
            data: { status: 'SEND_TO_USER_INBOX' },
            error: { code: 'ok' },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const svc = new TikTokService(db, {
      env,
      fetchImpl: fakeFetch,
      nowMs: () => now,
      sleepImpl: async (ms) => {
        sleepCalls.push(ms);
      },
      probeMediaImpl: async () => makeValidProbe(),
    });

    const res = await svc.uploadVideoToTikTok({ video, filePath, mode: 'draft' });
    assert.equal(initAttempts, 2);
    assert.deepEqual(sleepCalls, [2000]);
    assert.equal(res.status, 'draft_sent');
    assert.equal(res.publishId, 'v_inbox_retry_success');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Test 4: Pre-flight validation menolak file .webm (magic bytes) dan durasi 120s tanpa memanggil TikTok API', async () => {
  const { db, dir, env } = makeTempSetup();
  try {
    const now = 1_700_000_000_000;
    seedConnectedTokens(db, now);
    let fetchCalls = 0;

    const fakeFetch: typeof fetch = async () => {
      fetchCalls += 1;
      return new Response('{}', { status: 200 });
    };

    // Case A: Spoofed .mp4 extension containing WebM EBML magic bytes
    const webmCase = makeSampleVideo(db, {
      id: 'vid_bad_magic',
      fileName: 'spoofed.mp4',
      buffer: makeFakeWebmBuffer(),
    });

    const svcWebm = new TikTokService(db, {
      env,
      fetchImpl: fakeFetch,
      nowMs: () => now,
      probeMediaImpl: async () => makeValidProbe(),
    });

    await assert.rejects(
      () =>
        svcWebm.uploadVideoToTikTok({
          video: webmCase.video,
          filePath: webmCase.filePath,
          mode: 'draft',
        }),
      /bukan container MP4 asli/i,
    );
    assert.equal(fetchCalls, 0);

    // Case B: Valid MP4 magic bytes, but duration is 120 seconds (> 60s limit)
    const longCase = makeSampleVideo(db, {
      id: 'vid_too_long',
      fileName: 'too_long.mp4',
    });

    const svcLong = new TikTokService(db, {
      env,
      fetchImpl: fakeFetch,
      nowMs: () => now,
      probeMediaImpl: async () => makeValidProbe({ durationSeconds: 120 }),
    });

    await assert.rejects(
      () =>
        svcLong.uploadVideoToTikTok({
          video: longCase.video,
          filePath: longCase.filePath,
          mode: 'draft',
        }),
      /di luar rentang wajib 5–60 detik/i,
    );
    assert.equal(fetchCalls, 0);

    // Case C: Resolution below 720x1280
    const lowResCase = makeSampleVideo(db, {
      id: 'vid_low_res',
      fileName: 'low_res.mp4',
    });
    const svcLowRes = new TikTokService(db, {
      env,
      fetchImpl: fakeFetch,
      nowMs: () => now,
      probeMediaImpl: async () => makeValidProbe({ width: 480, height: 854 }),
    });
    await assert.rejects(
      () =>
        svcLowRes.uploadVideoToTikTok({
          video: lowResCase.video,
          filePath: lowResCase.filePath,
          mode: 'draft',
        }),
      /di bawah batas minimal 720x1280/i,
    );
    assert.equal(fetchCalls, 0);

    // Case D: AI QC not passed
    const unverifiedCase = makeSampleVideo(db, {
      id: 'vid_no_qc',
      fileName: 'no_qc.mp4',
      aiQcStatus: 'pending',
    });
    await assert.rejects(
      () =>
        svcWebm.uploadVideoToTikTok({
          video: unverifiedCase.video,
          filePath: unverifiedCase.filePath,
          mode: 'draft',
        }),
      /Kontrol Kualitas AI penuh/i,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Auto-cleanup guard (< 24 jam & status uploading) serta jadwal slot 09:00 / 12:00 / 18:00 WIB berjalan benar', async () => {
  const { db, dir, env } = makeTempSetup();
  try {
    const now = Date.parse('2026-11-24T11:02:00.000Z'); // 18:02 WIB!
    const twoHoursAgoIso = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const thirtyHoursAgoIso = new Date(now - 30 * 60 * 60 * 1000).toISOString();

    const recentUploaded = makeSampleVideo(db, {
      id: 'vid_recent_2h',
      createdAt: twoHoursAgoIso,
      tiktokStatus: 'draft_sent',
      tiktokPublishId: 'pub_recent',
      tiktokUploadedAt: twoHoursAgoIso,
    });
    const uploadingVideo = makeSampleVideo(db, {
      id: 'vid_still_uploading',
      createdAt: thirtyHoursAgoIso,
      tiktokStatus: 'uploading',
      tiktokPublishId: null,
      tiktokUploadedAt: null,
    });
    const oldUploaded = makeSampleVideo(db, {
      id: 'vid_old_30h',
      createdAt: thirtyHoursAgoIso,
      tiktokStatus: 'published',
      tiktokPublishId: 'pub_old_30h',
      tiktokUploadedAt: thirtyHoursAgoIso,
    });

    const svc = new TikTokService(db, {
      env,
      nowMs: () => now,
      thumbnailGenerator: async (_mp4Path, thumbPath) => {
        fs.writeFileSync(thumbPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
      },
    });

    const summary = await svc.cleanupAllEligible({
      minAgeAfterUploadMs: 24 * 60 * 60 * 1000,
    });

    assert.equal(summary.cleanedCount, 1);
    assert.equal(fs.existsSync(recentUploaded.filePath), true);
    assert.equal(fs.existsSync(uploadingVideo.filePath), true);
    assert.equal(fs.existsSync(oldUploaded.filePath), false);

    // WIB slot detection checks (UTC+7)
    assert.equal(
      getJakartaScheduleSlot(Date.parse('2026-11-24T02:00:00.000Z')).slotKey,
      '09:00',
    );
    assert.equal(
      getJakartaScheduleSlot(Date.parse('2026-11-24T05:03:00.000Z')).slotKey,
      '12:00',
    );
    assert.equal(
      getJakartaScheduleSlot(Date.parse('2026-11-24T11:05:00.000Z')).slotKey,
      '18:00',
    );
    assert.equal(
      getJakartaScheduleSlot(Date.parse('2026-11-24T03:00:00.000Z')).slotKey,
      null,
    );
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('computeTikTokChunkPlan and buildTikTokCaption obey TikTok Content Posting API limits', () => {
  const smallPlan = computeTikTokChunkPlan(5_000_000);
  assert.equal(smallPlan.totalChunkCount, 1);
  assert.equal(smallPlan.chunkSize, 5_000_000);

  const largePlan = computeTikTokChunkPlan(75 * 1024 * 1024);
  assert.equal(largePlan.chunkSize, 10 * 1024 * 1024);
  assert.equal(largePlan.totalChunkCount, 7);
  assert.equal(largePlan.ranges[0].start, 0);
  assert.equal(largePlan.ranges[6].end, 75 * 1024 * 1024 - 1);

  const caption = buildTikTokCaption({
    id: 'v1',
    jobId: 'j1',
    scheduleDate: '2026-11-23',
    topicSlug: 't',
    title: 'Judul',
    description: 'Desc',
    caption: 'Pesan motivasi singkat',
    hashtags: ['#Motivasi', '#Disiplin'],
    hookText: '',
    endingText: '',
    scriptText: '',
    subtitlesSrt: '',
    researchSummary: '',
    researchReferences: [],
    fileName: 'a.mp4',
    fileSizeBytes: 100,
    width: 1080,
    height: 1920,
    durationSeconds: 40,
    qcPassed: true,
    qcNotes: '',
    createdAt: '',
  });
  assert.equal(caption, 'Pesan motivasi singkat\n\n#Motivasi #Disiplin');
});


