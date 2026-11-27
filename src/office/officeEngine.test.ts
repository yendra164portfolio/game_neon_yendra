import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExternalAgentEvent,
  applyOfficeCustomizations,
  approveVideoRun,
  assignTaskToAgent,
  cancelTask,
  computeDashboardMetrics,
  createInitialOfficeState,
  moveEmployeeSeat,
  renameEmployee,
  requestVideoRevision,
  retryFailedTask,
  rotateEmployeeSeat,
  sendManagerToInspect,
  setManagerPatrolEnabled,
  startVideoProductionRun,
  stepOfficeSimulation,
  swapEmployeeSeats,
  triggerAgentError,
} from './officeEngine';

test('initial state includes all 7 Indonesian employees and metrics', () => {
  const state = createInitialOfficeState(1_000_000);
  assert.equal(state.employees.length, 7);
  const names = state.employees.map((e) => e.name);
  assert.deepEqual(names, [
    'Yendra Owner',
    'Asep',
    'Abdul',
    'Rahman',
    'Caca',
    'Riko',
    'Eko',
  ]);
  assert.equal(state.modeLabel, 'Simulasi Demo');
  assert.equal(state.managerPatrol.phase, 'at_desk');

  const metrics = computeDashboardMetrics(state);
  assert.equal(metrics.totalEmployees, 7);
  assert.ok(metrics.activeTasks >= 3);
  assert.ok(metrics.completedTasks >= 1);
  assert.ok(metrics.failedTasks >= 1);

  const sumCompleted = state.employees.reduce((s, e) => s + e.tasksCompleted, 0);
  const sumFailed = state.employees.reduce((s, e) => s + e.tasksFailed, 0);
  assert.equal(sumCompleted, metrics.completedTasks);
  assert.equal(sumFailed, metrics.failedTasks);
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

test('simulation advances progress, completes tasks, and keeps employee counters 100% synced', () => {
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

  const sumCompleted = state.employees.reduce((s, e) => s + e.tasksCompleted, 0);
  const sumFailed = state.employees.reduce((s, e) => s + e.tasksFailed, 0);
  assert.equal(sumCompleted, metrics.completedTasks);
  assert.equal(sumFailed, metrics.failedTasks);
  for (const emp of state.employees) {
    assert.equal(
      emp.tasksCompleted,
      state.tasks.filter((t) => t.assigneeId === emp.id && t.status === 'Completed').length,
    );
  }
});

test('error triggering and retry flow cleanly update agent and task state', () => {
  const now = 4_000_000;
  let state = createInitialOfficeState(now);
  state = triggerAgentError(state, 'designer', 'GPU render memory spike', now + 500);

  const designer = state.employees.find((e) => e.id === 'designer');
  assert.equal(designer?.status, 'Error');
  const failedTask = state.tasks.find((t) => t.id === designer?.currentTaskId);
  assert.equal(failedTask?.status, 'Error');
  assert.equal(
    state.employees.reduce((s, e) => s + e.tasksFailed, 0),
    computeDashboardMetrics(state).failedTasks,
  );

  state = retryFailedTask(state, failedTask!.id, now + 1500);
  const recoveredDesigner = state.employees.find((e) => e.id === 'designer');
  assert.equal(recoveredDesigner?.status, 'Working');
  assert.equal(
    state.employees.reduce((s, e) => s + e.tasksFailed, 0),
    computeDashboardMetrics(state).failedTasks,
  );

  state = cancelTask(state, failedTask!.id, now + 2000);
  assert.equal(
    state.tasks.some((t) => t.id === failedTask!.id),
    false,
  );
  assert.equal(
    state.employees.reduce((s, e) => s + e.tasksCompleted, 0),
    computeDashboardMetrics(state).completedTasks,
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

  // Approve run -> marks Approved and logs publisher completion synced with tasks
  state = approveVideoRun(state, runId, 'Looks sharp — ship it', now + 1000);
  const approvedRun = state.videoRuns.find((r) => r.id === runId);
  assert.equal(approvedRun?.status, 'Approved');
  assert.ok(approvedRun?.completedAt !== null);
  assert.equal(
    state.employees.reduce((s, e) => s + e.tasksCompleted, 0),
    computeDashboardMetrics(state).completedTasks,
  );
});

test('external Laravel Reverb event updates agent status in place without duplicating tasks', () => {
  const now = 6_000_000;
  let state = createInitialOfficeState(now);
  const beforeCompleted = computeDashboardMetrics(state).completedTasks;

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

  // Completing the same task updates in-place instead of leaving a hanging Working task
  state = applyExternalAgentEvent(
    state,
    {
      event: 'App\\Events\\AgentTaskUpdated',
      channel: 'private-yendra.office',
      data: {
        agentId: 'scriptwriter',
        status: 'Completed',
        activity: 'Finished live outline',
        progress: 100,
        taskTitle: 'Live Reverb Event Script',
      },
    },
    now + 800,
  );

  const matchingTasks = state.tasks.filter((t) => t.title === 'Live Reverb Event Script');
  assert.equal(matchingTasks.length, 1);
  assert.equal(matchingTasks[0].status, 'Completed');
  assert.equal(computeDashboardMetrics(state).completedTasks, beforeCompleted + 1);
  assert.equal(
    state.employees.reduce((s, e) => s + e.tasksCompleted, 0),
    computeDashboardMetrics(state).completedTasks,
  );
});

test('renaming an employee updates name, rejects blanks, and restores via customizations', () => {
  const now = 7_000_000;
  let state = createInitialOfficeState(now);

  // Blank name should be ignored
  const unchanged = renameEmployee(state, 'researcher', '   ', now + 100);
  assert.equal(
    unchanged.employees.find((e) => e.id === 'researcher')?.name,
    'Asep',
  );

  state = renameEmployee(state, 'researcher', '  Budi Santoso  ', now + 200);
  const renamed = state.employees.find((e) => e.id === 'researcher');
  assert.equal(renamed?.name, 'Budi Santoso');
  assert.ok(state.activityLog[0].message.includes('Budi Santoso'));

  // Persistence restore check (legacy AI name & legacy office seat positions auto-upgrade)
  const fresh = applyOfficeCustomizations(createInitialOfficeState(now + 500), {
    names: { researcher: 'Budi Santoso', manager: 'Yendra AI Manager' },
    seats: {
      researcher: { deskPosition: [-4.8, 0, 1.8], deskRotationY: 0 },
      designer: { deskPosition: [3.2, 0, 1.4], deskRotationY: Math.PI / 2 },
    },
  });
  assert.equal(
    fresh.employees.find((e) => e.id === 'researcher')?.name,
    'Budi Santoso',
  );
  assert.equal(
    fresh.employees.find((e) => e.id === 'manager')?.name,
    'Yendra Owner',
  );
  // Legacy default office seat migrates to Classroom Row 1 Left
  assert.deepEqual(
    fresh.employees.find((e) => e.id === 'researcher')?.deskPosition,
    [-3.6, 0, -0.7],
  );
  // Intentional custom seat stays preserved
  assert.deepEqual(
    fresh.employees.find((e) => e.id === 'designer')?.deskPosition,
    [3.2, 0, 1.4],
  );
});

test('classroom arrangement places teacher at front facing 3x2 student rows and respects collision rules', () => {
  const now = 8_000_000;
  let state = createInitialOfficeState(now);

  const teacher = state.employees.find((e) => e.id === 'manager')!;
  assert.deepEqual(teacher.deskPosition, [0, 0, -4.0]);
  assert.equal(teacher.deskRotationY, Math.PI);

  const students = state.employees.filter((e) => e.id !== 'manager');
  assert.equal(students.length, 6);
  for (const s of students) {
    assert.equal(s.deskRotationY, 0);
    assert.ok(s.deskPosition[2] > -2.1, `Expected student ${s.name} behind front teaching aisle`);
  }

  // Moving a student into the Front Blackboard / Teacher zone (0, -3.5) should resolve back into student rows
  state = moveEmployeeSeat(state, 'qc', [0, 0, -3.5], undefined, now + 100);
  const qc = state.employees.find((e) => e.id === 'qc')!;
  assert.ok(
    qc.deskPosition[2] >= -2.1,
    `Expected student QC seat (${qc.deskPosition[0]}, ${qc.deskPosition[2]}) outside Front Teacher Zone`,
  );

  // Moving directly onto another student's desk should auto-resolve with >= 2.15m spacing
  const writerPos = state.employees.find((e) => e.id === 'scriptwriter')!.deskPosition;
  state = moveEmployeeSeat(state, 'qc', writerPos, undefined, now + 200);
  const qcAfter = state.employees.find((e) => e.id === 'qc')!;
  const sep = Math.hypot(
    qcAfter.deskPosition[0] - writerPos[0],
    qcAfter.deskPosition[2] - writerPos[2],
  );
  assert.ok(sep >= 2.1, `Expected separation >= 2.1m, got ${sep}`);

  // Rotate 90 deg
  const prevRot = qcAfter.deskRotationY;
  state = rotateEmployeeSeat(state, 'qc', Math.PI / 2, now + 300);
  const qcRot = state.employees.find((e) => e.id === 'qc')!.deskRotationY;
  assert.ok(Math.abs(qcRot - ((prevRot + Math.PI / 2) % (Math.PI * 2))) < 0.001);

  // Swap seats between researcher and designer
  const resBefore = state.employees.find((e) => e.id === 'researcher')!;
  const desBefore = state.employees.find((e) => e.id === 'designer')!;
  state = swapEmployeeSeats(state, 'researcher', 'designer', now + 400);
  const resAfter = state.employees.find((e) => e.id === 'researcher')!;
  const desAfter = state.employees.find((e) => e.id === 'designer')!;
  assert.deepEqual(resAfter.deskPosition, desBefore.deskPosition);
  assert.deepEqual(desAfter.deskPosition, resBefore.deskPosition);
  assert.equal(resAfter.deskRotationY, desBefore.deskRotationY);
  assert.equal(desAfter.deskRotationY, resBefore.deskRotationY);
});

test('walking manager patrols workstations, inspects target colleague, and returns to desk', () => {
  let now = 9_000_000;
  let state = createInitialOfficeState(now);

  // Send manager directly to inspect Video Editor
  state = sendManagerToInspect(state, 'video_editor', now + 100);
  assert.equal(state.managerPatrol.phase, 'walking_to_colleague');
  assert.equal(state.managerPatrol.targetAgentId, 'video_editor');

  // Step simulation until manager reaches Video Editor & begins inspecting
  let sawInspecting = false;
  for (let i = 0; i < 12; i++) {
    now += 1000;
    state = stepOfficeSimulation(state, 1, now);
    if (state.managerPatrol.phase === 'inspecting') {
      sawInspecting = true;
      break;
    }
  }
  assert.ok(sawInspecting, 'Manager should arrive and enter inspecting phase');
  const managerInspecting = state.employees.find((e) => e.id === 'manager')!;
  assert.ok(managerInspecting.currentActivity.includes('Rahman'));

  // Enable full office patrol and advance across multiple colleagues
  state = setManagerPatrolEnabled(state, true, now + 500);
  assert.equal(state.managerPatrol.enabled, true);
  assert.equal(state.managerPatrol.phase, 'walking_to_colleague');

  // Disable patrol -> returns cleanly to desk
  state = setManagerPatrolEnabled(state, false, now + 1000);
  assert.equal(state.managerPatrol.enabled, false);
  assert.equal(state.managerPatrol.phase, 'returning_to_desk');

  for (let i = 0; i < 12; i++) {
    now += 1000;
    state = stepOfficeSimulation(state, 1, now);
    if (state.managerPatrol.phase === 'at_desk') break;
  }
  assert.equal(state.managerPatrol.phase, 'at_desk');
});
