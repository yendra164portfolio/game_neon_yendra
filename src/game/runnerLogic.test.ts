import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_SPEED,
  DEFAULT_PROGRESS,
  MAX_SPEED,
  calculateScore,
  checkObstacleCollision,
  computeTargetSpeed,
  createInitialPlayerState,
  createObstacleBox,
  generateRowPattern,
  getDifficultyTier,
  isRowPassable,
  laneToWorldX,
  shiftLane,
  stepPlayerPhysics,
  unlockOrSelectSkin,
} from './runnerLogic';

test('lane shifting clamps cleanly between -1, 0, and 1', () => {
  assert.equal(shiftLane(0, -1), -1);
  assert.equal(shiftLane(-1, -1), -1);
  assert.equal(shiftLane(0, 1), 1);
  assert.equal(shiftLane(1, 1), 1);
  assert.equal(laneToWorldX(0), 0);
  assert.ok(laneToWorldX(-1) < 0);
  assert.ok(laneToWorldX(1) > 0);
});

test('jump and slide physics allow clearing barriers and ducking under laser gates', () => {
  const player = createInitialPlayerState();
  const barrier = createObstacleBox(1, {
    kind: 'barrier',
    lane: 0,
    oscillateRange: 0,
    oscillateSpeed: 0,
    oscillatePhase: 0,
  }, 0);

  // Standing in lane 0 hits barrier
  assert.equal(checkObstacleCollision(player, barrier), true);

  // Jump clears barrier near apex
  stepPlayerPhysics(player, 0.016, BASE_SPEED, { jumpPressed: true });
  for (let i = 0; i < 16; i++) {
    stepPlayerPhysics(player, 0.016, BASE_SPEED, {});
  }
  assert.ok(player.y > 1.15, `expected player.y > 1.15, got ${player.y}`);
  assert.equal(checkObstacleCollision(player, barrier), false);

  // Laser gate hits standing player, clears sliding player
  const grounded = createInitialPlayerState();
  const gate = createObstacleBox(2, {
    kind: 'laser_gate',
    lane: 0,
    oscillateRange: 0,
    oscillateSpeed: 0,
    oscillatePhase: 0,
  }, 0);
  assert.equal(checkObstacleCollision(grounded, gate), true);

  stepPlayerPhysics(grounded, 0.016, BASE_SPEED, { slidePressed: true });
  assert.equal(checkObstacleCollision(grounded, gate), false);
});

test('speed and difficulty tiers ramp smoothly and cap at MAX_SPEED', () => {
  const s0 = computeTargetSpeed(0, 0);
  const sMid = computeTargetSpeed(35, 650);
  const sHigh = computeTargetSpeed(150, 3000);
  assert.equal(s0, BASE_SPEED);
  assert.ok(sMid > s0);
  assert.equal(sHigh, MAX_SPEED);
  assert.equal(getDifficultyTier(50).level, 1);
  assert.equal(getDifficultyTier(300).level, 2);
  assert.equal(getDifficultyTier(800).level, 3);
  assert.equal(getDifficultyTier(1500).level, 4);
});

test('generated obstacle rows always leave at least one passable path across 300 samples', () => {
  let seed = 42;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 300; i++) {
    const dist = i * 8;
    const row = generateRowPattern(dist, rng);
    assert.equal(isRowPassable(row), true, `row ${i} at dist ${dist} was impassable`);
  }
});

test('score calculation and skin unlocking work accurately', () => {
  assert.equal(calculateScore(125.7, 4), 1257 + 200);

  const poor = { ...DEFAULT_PROGRESS, totalCoins: 20 };
  const fail = unlockOrSelectSkin(poor, 'crimson');
  assert.equal(fail.action, 'insufficient');
  assert.equal(fail.next.totalCoins, 20);

  const rich = { ...DEFAULT_PROGRESS, totalCoins: 80 };
  const unlocked = unlockOrSelectSkin(rich, 'crimson');
  assert.equal(unlocked.action, 'unlocked');
  assert.equal(unlocked.next.totalCoins, 30);
  assert.equal(unlocked.next.selectedSkin, 'crimson');
  assert.ok(unlocked.next.unlockedSkins.includes('crimson'));

  const reselect = unlockOrSelectSkin(unlocked.next, 'volt');
  assert.equal(reselect.action, 'selected');
  assert.equal(reselect.next.selectedSkin, 'volt');
  assert.equal(reselect.next.totalCoins, 30);
});
