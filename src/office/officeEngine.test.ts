import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExternalAgentEvent,
  approveVideoRun,
  assignTaskToAgent,
  cancelTask,
  computeDashboardMetrics,
  createInitialOfficeState,
  requestVideoRevision,
  retryFailedTask,
  startVideoProductionRun,
  stepOfficeSimulation,
  triggerAgentError,
} from './officeEngine';

test('initial state includes all 7 AI employees and metrics', () => {
  const state = createInitialOfficeState(1_000_000);
  assert.equal(state.employees.length, 7);
  const names = state.employees.map((e) => e.name);
  assert.deepEqual(names, [
    'Yendra AI Manager',
    'AI Researcher',
    'AI Scriptwriter',
    'AI Video Editor',
    'AI Graphic Designer',
    'AI Content Publisher',
    'AI Quality Control',
  ]);
  assert.equal(state.modeLabel, 'Demo Simulation');

  const metrics = computeDashboardMetrics(state);
  assert.equal(metrics.totalEmployees, 7);
  assert.ok(metrics.activeTasks >= 3);
  assert.ok(metrics.completedTasks >= 1);
  assert.ok(metrics.failedTasks >= 1);
});

test('assigning a task to an idle agent activates them immediately; busy agent queues it', () => {
  const now = 2_000_000;
  let state = createInitialOfficeState(now);

  // Publisher starts Idle -> should start immediately
  state = assignTaskToAgent(
    state,
    {
      title: 'Schedule Product Launch Reel',
      description: 'Queue metadata and captions',
      assigneeId: 'publisher',
      priority: 'High',
    },
    now + 1000,
  );
  const publisher = state.employees.find((e) => e.id === 'publisher');
  assert.equal(publisher?.status, 'Thinking');
  assert.equal(publisher?.currentActivity, 'Schedule Product Launch Reel');

  // Video Editor is Working -> should queue
  state = assignTaskToAgent(
    state,
    {
      title: 'Render 4K Vertical Cut',
      description: 'Export 9:16 social cut',
      assigneeId: 'video_editor',
      priority: 'Urgent',
    },
    now + 2000,
  );
  const queuedTask = state.tasks.find((t) => t.title === 'Render 4K Vertical Cut');
  assert.equal(queuedTask?.status, 'Queued');
});

test('simulation advances progress, completes tasks, and picks up queued work', () => {
  let now = 3_000_000;
  let state = createInitialOfficeState(now);
  state = { ...state, simulationSpeed: 4 };

  // Step 20 seconds in 1s increments so tasks complete & advance
  for (let i = 0; i < 20; i++) {
    now += 1000;
    state = stepOfficeSimulation(state, 1, now);
  }

  const metrics = computeDashboardMetrics(state);
  assert.ok(metrics.completedTasks >= 3, 'Expected multiple tasks to complete during simulation');
  assert.ok(state.activityLog.length > 6, 'Expected activity log to grow');
});

test('error triggering and retry flow cleanly update agent and task state', () => {
  const now = 4_000_000;
  let state = createInitialOfficeState(now);
  state = triggerAgentError(state, 'designer', 'GPU render memory spike', now + 500);

  const designer = state.employees.find((e) => e.id === 'designer');
  assert.equal(designer?.status, 'Error');
  const failedTask = state.tasks.find((t) => t.id === designer?.currentTaskId);
  assert.equal(failedTask?.status, 'Error');

  state = retryFailedTask(state, failedTask!.id, now + 1500);
  const recoveredDesigner = state.employees.find((e) => e.id === 'designer');
  assert.equal(recoveredDesigner?.status, 'Working');

  state = cancelTask(state, failedTask!.id, now + 2000);
  assert.equal(
    state.tasks.some((t) => t.id === failedTask!.id),
    false,
  );
});

test('8-stage video production workflow progresses to Stage 8 Awaiting Review and supports approve/revision', () => {
  let now = 5_000_000;
  let state = createInitialOfficeState(now);
  state = startVideoProductionRun(
    state,
    {
      topic: 'Real-Time 3D Observability',
      format: '9:16 Shorts',
      geminiAssisted: false,
    },
    now,
  );

  const runId = state.activeVideoRunId!;
  state = { ...state, simulationSpeed: 4 };

  // Advance enough simulated seconds to complete stages 1..7 (7 * 7.5s = 52.5s; at 4x speed 15s real = 60s sim)
  for (let i = 0; i < 20; i++) {
    now += 1000;
    state = stepOfficeSimulation(state, 1, now);
  }

  const awaitingRun = state.videoRuns.find((r) => r.id === runId);
  assert.equal(awaitingRun?.status, 'Awaiting Review');
  assert.equal(awaitingRun?.currentStage, 8);

  // Request revision -> moves back to stage 4
  state = requestVideoRevision(state, runId, 'Tighten pacing at 00:12', now + 500);
  const revisedRun = state.videoRuns.find((r) => r.id === runId);
  assert.equal(revisedRun?.status, 'In Progress');
  assert.equal(revisedRun?.currentStage, 4);

  // Approve run -> marks Approved and logs publisher completion
  state = approveVideoRun(state, runId, 'Looks sharp — ship it', now + 1000);
  const approvedRun = state.videoRuns.find((r) => r.id === runId);
  assert.equal(approvedRun?.status, 'Approved');
  assert.ok(approvedRun?.completedAt !== null);
});

test('external Laravel Reverb event updates agent status and records webhook-event source', () => {
  const now = 6_000_000;
  let state = createInitialOfficeState(now);

  state = applyExternalAgentEvent(
    state,
    {
      event: 'App\\Events\\AgentTaskUpdated',
      channel: 'private-yendra.office',
      data: {
        agentId: 'scriptwriter',
        status: 'Working',
        activity: 'Streaming live outline from Laravel worker',
        progress: 68,
        taskTitle: 'Live Reverb Event Script',
      },
    },
    now + 200,
  );

  const writer = state.employees.find((e) => e.id === 'scriptwriter');
  assert.equal(writer?.currentActivity, 'Streaming live outline from Laravel worker');
  assert.equal(writer?.progress, 68);
  assert.equal(state.activityLog[0].source, 'webhook-event');
});
