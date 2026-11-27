import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StudioDatabase, isValidResourceId } from './studioDb.ts';
import { StudioCoordinator } from './studioPipeline.ts';

function makeTempDb(): { db: StudioDatabase; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yendra-studio-test-'));
  const db = new StudioDatabase({
    dbPath: path.join(dir, 'test.sqlite'),
    storageRoot: dir,
  });
  return { db, dir };
}

test('ensureScheduleForDate creates 3 unique non-repeating topics and guards duplicates', () => {
  const { db, dir } = makeTempDb();
  try {
    const day1 = db.ensureScheduleForDate('2026-11-22');
    assert.equal(day1.schedule.targetCount, 3);
    assert.equal(day1.createdJobs.length, 3);

    // Calling again on same date does not duplicate
    const day1Again = db.ensureScheduleForDate('2026-11-22');
    assert.equal(day1Again.createdJobs.length, 0);

    // Next day chooses 3 completely different topics
    const day2 = db.ensureScheduleForDate('2026-11-23');
    assert.equal(day2.createdJobs.length, 3);

    const day1Slugs = new Set(day1.createdJobs.map((j) => j.topicSlug));
    for (const job of day2.createdJobs) {
      assert.equal(day1Slugs.has(job.topicSlug), false);
    }
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('enqueueJob rejects duplicate topic on the same schedule date', () => {
  const { db, dir } = makeTempDb();
  try {
    const job = db.enqueueJob({
      scheduleDate: '2026-11-22',
      topicTitle: 'Kekuatan Konsistensi 1% Setiap Hari',
      topicSlug: 'custom-konsistensi-1-persen',
    });
    assert.equal(job.status, 'queued');

    assert.throws(
      () =>
        db.enqueueJob({
          scheduleDate: '2026-11-22',
          topicTitle: 'Kekuatan Konsistensi 1% Setiap Hari',
          topicSlug: 'custom-konsistensi-1-persen',
        }),
      /already scheduled/i,
    );
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resetInterruptedRunningJobs safely restores in-flight jobs to queued on startup', () => {
  const { db, dir } = makeTempDb();
  try {
    const { createdJobs } = db.ensureScheduleForDate('2026-11-22');
    db.updateJob(createdJobs[0].id, {
      status: 'editing',
      activeAgent: 'video_editor',
      currentStageIndex: 4,
    });

    const recovered = db.resetInterruptedRunningJobs();
    assert.equal(recovered, 1);

    const reloaded = db.getJobById(createdJobs[0].id);
    assert.equal(reloaded?.status, 'queued');
    assert.equal(reloaded?.activeAgent, null);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('video persistence, KPI metrics, deletion, and confined path validation work properly', () => {
  const { db, dir } = makeTempDb();
  try {
    const { createdJobs } = db.ensureScheduleForDate('2026-11-22');
    const job = createdJobs[0];
    const videoFile = db.resolveConfinedPath('videos', 'vid_test_01.mp4');
    fs.writeFileSync(videoFile, Buffer.alloc(32_000, 1));

    db.insertVideo({
      id: 'vid_test_01',
      jobId: job.id,
      scheduleDate: '2026-11-22',
      topicSlug: job.topicSlug,
      title: job.topicTitle,
      description: 'Penjelasan mekanis terverifikasi.',
      caption: 'Pelajari cara kerjanya.',
      hashtags: ['#TeknikMesin', '#EdukasiTeknologi'],
      hookText: 'Tahukah kamu bagaimana komponen ini bekerja?',
      endingText: 'Ikuti untuk seri teknik berikutnya.',
      scriptText: 'Naskah edukasi Indonesia.',
      subtitlesSrt: '1\n00:00:00,000 --> 00:00:05,000\nTahukah kamu?\n',
      researchSummary: 'Ringkasan teknis.',
      researchReferences: ['IEEE Reference'],
      fileName: 'vid_test_01.mp4',
      fileSizeBytes: 32_000,
      width: 1080,
      height: 1920,
      durationSeconds: 38.5,
      qcPassed: true,
      qcNotes: 'All specs passed.',
      createdAt: new Date().toISOString(),
    });
    db.updateJob(job.id, { status: 'completed', videoId: 'vid_test_01', activeAgent: null });

    const metrics = db.getDashboardMetrics('2026-11-22');
    assert.equal(metrics.dailyTarget, 3);
    assert.equal(metrics.completedToday, 1);
    assert.equal(metrics.totalProduced, 1);
    assert.equal(metrics.queuedToday, 2);

    assert.equal(isValidResourceId('vid_test_01'), true);
    assert.equal(isValidResourceId('../etc/passwd'), false);

    const deleted = db.deleteVideo('vid_test_01');
    assert.equal(deleted, true);
    assert.equal(fs.existsSync(videoFile), false);
    assert.equal(db.getVideoById('vid_test_01'), null);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('initSchema migrates legacy database tables without losing existing jobs and supports createBackup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yendra-legacy-db-'));
  const dbPath = path.join(dir, 'legacy.sqlite');
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE daily_schedules (
        schedule_date TEXT PRIMARY KEY,
        target_count INTEGER NOT NULL DEFAULT 3,
        topic_slugs_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE production_jobs (
        id TEXT PRIMARY KEY,
        schedule_date TEXT NOT NULL,
        topic_slug TEXT NOT NULL,
        topic_title TEXT NOT NULL,
        category TEXT NOT NULL,
        angle TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage_index INTEGER NOT NULL DEFAULT 0,
        active_agent TEXT,
        research_json TEXT,
        script_json TEXT,
        asset_paths_json TEXT,
        audio_path TEXT,
        subtitle_path TEXT,
        video_id TEXT,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        UNIQUE(schedule_date, topic_slug)
      );
      INSERT INTO production_jobs (
        id, schedule_date, topic_slug, topic_title, category, angle,
        status, current_stage_index, attempts, created_at, updated_at
      ) VALUES (
        'job_legacy_1', '2026-11-23', 'smartphone-internal-components',
        'Komponen Internal Smartphone', 'Electronics', 'CPU and battery',
        'qc', 5, 2, '2026-11-23T00:00:00Z', '2026-11-23T00:00:00Z'
      );
    `);
    legacy.close();

    const db = new StudioDatabase({ dbPath, storageRoot: dir });
    try {
      const recovered = db.resetInterruptedRunningJobs();
      assert.equal(recovered, 1);

      const job = db.getJobById('job_legacy_1');
      assert.ok(job);
      assert.equal(job.status, 'queued');
      assert.equal(job.currentStageIndex, 5);
      assert.equal(job.pendingVideoFile, null);
      assert.equal(job.aiQcStatus, 'none');

      const backupPath = db.createBackup('unit');
      assert.equal(fs.existsSync(backupPath), true);
      assert.ok(fs.statSync(backupPath).size > 0);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resetInterruptedRunningJobs preserves currentStageIndex, pendingVideoFile, and stage checkpoints', () => {
  const { db, dir } = makeTempDb();
  try {
    const { createdJobs } = db.ensureScheduleForDate('2026-11-23');
    const job = createdJobs[0];
    db.updateJob(job.id, {
      status: 'qc',
      activeAgent: 'qc',
      currentStageIndex: 5,
      pendingVideoFile: 'vid_20261123_checkpoint.mp4',
      researchJson: '{"summary":"ok"}',
      scriptJson: '{"title":"ok","scenes":[]}',
    });

    db.resetInterruptedRunningJobs();
    const reloaded = db.getJobById(job.id);
    assert.equal(reloaded?.status, 'queued');
    assert.equal(reloaded?.currentStageIndex, 5);
    assert.equal(reloaded?.pendingVideoFile, 'vid_20261123_checkpoint.mp4');
    assert.equal(reloaded?.researchJson, '{"summary":"ok"}');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('recoverOrphanedVideos registers newest valid MP4 once without duplicating or deleting valid files', async () => {
  const { db, dir } = makeTempDb();
  try {
    const { createdJobs } = db.ensureScheduleForDate('2026-11-23');
    const job1 = createdJobs[0];

    const research = {
      summary: 'Ringkasan sistem smartphone.',
      howItWorksStepByStep: ['Step 1'],
      internalComponents: [{ name: 'SoC', function: 'Pemrosesan' }],
      verifiedFacts: ['CPU memproses instruksi.'],
      references: ['IEEE Reference'],
    };
    const script = {
      title: job1.topicTitle,
      description: 'Penjelasan komponen smartphone.',
      caption: 'Cara kerja smartphone.',
      hashtags: ['#Teknologi'],
      hookText: 'Pernah penasaran isi smartphone?',
      endingText: 'Ikuti untuk topik berikutnya.',
      scenes: [
        {
          sceneNumber: 1,
          sectionLabel: 'Hook',
          narrationIndonesian: 'Smartphone bekerja melalui SoC, RAM, dan baterai lithium-ion yang terintegrasi.',
          visualFocus: 'SoC',
          componentLabels: ['SoC', 'Baterai'],
        },
      ],
    };

    db.updateJob(job1.id, {
      status: 'queued',
      currentStageIndex: 5,
      attempts: 3,
      researchJson: JSON.stringify(research),
      scriptJson: JSON.stringify(script),
    });

    const olderMp4 = db.resolveConfinedPath('videos', 'vid_20261123_older01.mp4');
    const middleMp4 = db.resolveConfinedPath('videos', 'vid_20261123_middle2.mp4');
    const newestMp4 = db.resolveConfinedPath('videos', 'vid_20261123_newest3.mp4');
    fs.writeFileSync(olderMp4, Buffer.alloc(120_000, 1));
    fs.writeFileSync(middleMp4, Buffer.alloc(120_000, 2));
    fs.writeFileSync(newestMp4, Buffer.alloc(120_000, 3));

    const nowSec = Date.now() / 1000;
    fs.utimesSync(olderMp4, nowSec - 300, nowSec - 300);
    fs.utimesSync(middleMp4, nowSec - 200, nowSec - 200);
    fs.utimesSync(newestMp4, nowSec - 10, nowSec - 10);

    const coordinator = new StudioCoordinator(db, () => {});
    // Stub ffprobe inspection cleanly for unit test without requiring real MP4 encoding inside test
    (coordinator as unknown as { probeMedia: (filePath: string) => Promise<unknown> }).probeMedia = async (
      filePath: string,
    ) => ({
      fileExists: fs.existsSync(filePath),
      fileReadable: true,
      fileSizeBytes: 120_000,
      durationSeconds: 50.0,
      width: 1080,
      height: 1920,
      hasVideoStream: true,
      hasAudioStream: true,
      videoCodec: 'h264',
      audioCodec: 'aac',
    });

    const recovery1 = await coordinator.recoverOrphanedVideos();
    assert.equal(recovery1.scannedFiles, 3);
    assert.deepEqual(recovery1.recoveredVideos, ['vid_20261123_newest3.mp4']);
    assert.equal(recovery1.skippedDuplicates.length, 2);

    // Running recovery again must be idempotent
    const recovery2 = await coordinator.recoverOrphanedVideos();
    assert.equal(recovery2.recoveredVideos.length, 0);
    assert.equal(recovery2.skippedDuplicates.length, 3);

    // All 3 valid MP4 files remain intact on disk; only 1 DB row created
    assert.equal(fs.existsSync(olderMp4), true);
    assert.equal(fs.existsSync(middleMp4), true);
    assert.equal(fs.existsSync(newestMp4), true);

    const videos = db.listVideos(10);
    assert.equal(videos.length, 1);
    assert.equal(videos[0].fileName, 'vid_20261123_newest3.mp4');
    assert.equal(videos[0].aiQcStatus, 'pending');

    const completedJob = db.getJobById(job1.id);
    assert.equal(completedJob?.status, 'completed');
    assert.equal(completedJob?.videoId, 'vid_20261123_newest3');
    assert.equal(completedJob?.aiQcStatus, 'pending');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('retryOrRunJob preserves pendingVideoFile and Stage 5 checkpoint unless forceRerender is true', () => {
  const { db, dir } = makeTempDb();
  try {
    const { createdJobs } = db.ensureScheduleForDate('2026-11-23');
    const job = createdJobs[0];
    db.updateJob(job.id, {
      status: 'failed',
      currentStageIndex: 5,
      pendingVideoFile: 'vid_20261123_saved.mp4',
      researchJson: '{"summary":"ok"}',
    });

    const coordinator = new StudioCoordinator(db, () => {});
    // Prevent background async executeJob from mutating state during synchronous check
    (coordinator as unknown as { executeJob: () => Promise<void> }).executeJob = async () => {};

    const res1 = coordinator.retryOrRunJob(job.id);
    assert.equal(res1.started, true);
    assert.equal(db.getJobById(job.id)?.pendingVideoFile, 'vid_20261123_saved.mp4');
    assert.equal(db.getJobById(job.id)?.currentStageIndex, 5);

    const res2 = coordinator.retryOrRunJob(job.id, { forceRerender: true });
    assert.equal(res2.started, true);
    assert.equal(db.getJobById(job.id)?.pendingVideoFile, null);
    assert.equal(db.getJobById(job.id)?.currentStageIndex, 3);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runQualityControlStage falls back gracefully to local FFprobe validation when Gemini returns 503', async () => {
  const { db, dir } = makeTempDb();
  try {
    const mp4Path = db.resolveConfinedPath('videos', 'vid_test_503.mp4');
    fs.writeFileSync(mp4Path, Buffer.alloc(40_000, 1));

    const coordinator = new StudioCoordinator(db, () => {});
    (coordinator as unknown as { probeMedia: () => Promise<unknown> }).probeMedia = async () => ({
      fileExists: true,
      fileReadable: true,
      fileSizeBytes: 40_000,
      durationSeconds: 45,
      width: 1080,
      height: 1920,
      hasVideoStream: true,
      hasAudioStream: true,
      videoCodec: 'h264',
      audioCodec: 'aac',
    });

    const fakeAi = {
      models: {
        generateContent: async () => {
          throw new Error('503 Service Unavailable: high demand');
        },
      },
    };

    const runQc = (
      coordinator as unknown as {
        runQualityControlStage: (...args: unknown[]) => Promise<{
          passed: boolean;
          aiQcStatus: string;
          notes: string;
        }>;
      }
    ).runQualityControlStage.bind(coordinator);

    const result = await runQc(
      fakeAi,
      mp4Path,
      {
        summary: 'Ringkasan',
        howItWorksStepByStep: [],
        internalComponents: [],
        verifiedFacts: ['Fakta 1'],
        references: [],
      },
      {
        title: 'Judul',
        description: 'Desc',
        caption: 'Cap',
        hashtags: ['#Tech'],
        hookText: 'Hook',
        endingText: 'End',
        scenes: [
          {
            sceneNumber: 1,
            sectionLabel: 'Intro',
            narrationIndonesian: 'Penjelasan motivasi panjang dalam Bahasa Indonesia untuk membangkitkan semangat.',
            visualFocus: 'Sunrise',
            componentLabels: ['Disiplin', 'Fokus'],
          },
        ],
      },
      '1\n00:00:01,000 --> 00:00:05,000\nPenjelasan motivasi panjang\n',
    );

    assert.equal(result.passed, true);
    assert.equal(result.aiQcStatus, 'pending');
    assert.match(result.notes, /H264\/AAC/i);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('initSchema migrates unstarted legacy mechanical queued jobs to motivational schedule while preserving completed videos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yendra-theme-migrate-'));
  const dbPath = path.join(dir, 'theme.sqlite');
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE daily_schedules (
        schedule_date TEXT PRIMARY KEY,
        target_count INTEGER NOT NULL DEFAULT 3,
        topic_slugs_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE production_jobs (
        id TEXT PRIMARY KEY,
        schedule_date TEXT NOT NULL,
        topic_slug TEXT NOT NULL,
        topic_title TEXT NOT NULL,
        category TEXT NOT NULL,
        angle TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage_index INTEGER NOT NULL DEFAULT 0,
        active_agent TEXT,
        research_json TEXT,
        script_json TEXT,
        asset_paths_json TEXT,
        audio_path TEXT,
        subtitle_path TEXT,
        video_id TEXT,
        pending_video_file TEXT,
        ai_qc_status TEXT NOT NULL DEFAULT 'none',
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        UNIQUE(schedule_date, topic_slug)
      );
      INSERT INTO daily_schedules (schedule_date, target_count, topic_slugs_json, created_at)
      VALUES ('2026-11-24', 3, '["centrifugal-water-pump-motor"]', '2026-11-24T00:00:00Z');
      INSERT INTO production_jobs (
        id, schedule_date, topic_slug, topic_title, category, angle,
        status, current_stage_index, video_id, attempts, created_at, updated_at
      ) VALUES
        ('job_done_1', '2026-11-23', 'smartphone-internal-components', 'Cara Kerja Smartphone', 'Tech', 'Angle', 'completed', 5, 'vid_done_1', 1, '2026-11-23T00:00:00Z', '2026-11-23T00:00:00Z'),
        ('job_queued_mech', '2026-11-24', 'centrifugal-water-pump-motor', 'Cara Kerja Pompa Air', 'Water Pumps', 'Angle', 'queued', 0, NULL, 0, '2026-11-24T00:00:00Z', '2026-11-24T00:00:00Z');
    `);
    legacy.close();

    const db = new StudioDatabase({ dbPath, storageRoot: dir });
    try {
      // Completed job preserved; unstarted legacy mechanical queued job removed
      assert.ok(db.getJobById('job_done_1'));
      assert.equal(db.getJobById('job_queued_mech'), null);
      assert.equal(db.getScheduleForDate('2026-11-24'), null);

      // Ensuring schedule now creates 3 motivational video topics
      const res = db.ensureScheduleForDate('2026-11-24');
      assert.equal(res.createdJobs.length, 3);
      for (const job of res.createdJobs) {
        assert.equal(/cara kerja mesin|pompa air/i.test(job.topicTitle), false);
      }
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
