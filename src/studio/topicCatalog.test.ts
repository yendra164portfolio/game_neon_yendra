import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINEERING_TOPIC_CATALOG,
  getJakartaDateString,
  selectDailyTopics,
  validateRenderedVideoSpecs,
} from './topicCatalog';

test('getJakartaDateString formats YYYY-MM-DD in Asia/Jakarta (+07:00)', () => {
  // 2026-11-22T20:00:00Z is 2026-11-23 03:00:00 in Asia/Jakarta
  const utcMs = Date.UTC(2026, 10, 22, 20, 0, 0);
  assert.equal(getJakartaDateString(utcMs), '2026-11-23');
});

test('selectDailyTopics returns 3 unique topics avoiding previously used slugs', () => {
  const day1 = selectDailyTopics([], 3);
  assert.equal(day1.length, 3);
  assert.equal(new Set(day1.map((t) => t.slug)).size, 3);

  const day2 = selectDailyTopics(day1.map((t) => t.slug), 3);
  assert.equal(day2.length, 3);
  for (const t of day2) {
    assert.equal(
      day1.some((d1) => d1.slug === t.slug),
      false,
      `Topic ${t.slug} should not repeat on day 2`,
    );
  }
  assert.ok(ENGINEERING_TOPIC_CATALOG.length >= 12);
});

test('validateRenderedVideoSpecs enforces 1080x1920, 30-60s duration, audio/video streams, and file existence', () => {
  const valid = validateRenderedVideoSpecs({
    fileExists: true,
    fileSizeBytes: 2_500_000,
    width: 1080,
    height: 1920,
    durationSeconds: 42.5,
    hasVideoStream: true,
    hasAudioStream: true,
  });
  assert.equal(valid.passed, true);
  assert.equal(valid.reasons.length, 0);

  const tooShort = validateRenderedVideoSpecs({
    fileExists: true,
    fileSizeBytes: 500_000,
    width: 1080,
    height: 1920,
    durationSeconds: 22.0,
    hasVideoStream: true,
    hasAudioStream: true,
  });
  assert.equal(tooShort.passed, false);
  assert.ok(tooShort.reasons[0].includes('outside required 30–60s'));

  const wrongRes = validateRenderedVideoSpecs({
    fileExists: true,
    fileSizeBytes: 500_000,
    width: 1920,
    height: 1080,
    durationSeconds: 40,
    hasVideoStream: true,
    hasAudioStream: false,
  });
  assert.equal(wrongRes.passed, false);
  assert.equal(wrongRes.reasons.length, 2);
});
