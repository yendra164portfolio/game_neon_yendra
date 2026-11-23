import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StudioDatabase, isValidResourceId } from './studioDb.ts';

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
      topicTitle: 'Cara Kerja Kompresor Inverter AC',
      topicSlug: 'custom-ac-inverter',
    });
    assert.equal(job.status, 'queued');

    assert.throws(
      () =>
        db.enqueueJob({
          scheduleDate: '2026-11-22',
          topicTitle: 'Cara Kerja Kompresor Inverter AC',
          topicSlug: 'custom-ac-inverter',
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
