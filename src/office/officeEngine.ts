import type {
  ActivityLogEntry,
  AgentId,
  AgentStatus,
  DashboardMetrics,
  EmployeeProfile,
  ExternalAgentEvent,
  OfficeState,
  OfficeTask,
  TaskPriority,
  VideoFormat,
  VideoPipelineStage,
  VideoProductionRun,
} from './types';

let idCounter = 1000;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export interface VideoRunSeedInput {
  topic: string;
  format: VideoFormat;
  geminiAssisted?: boolean;
  customArtifacts?: {
    researchNotes?: string;
    scriptText?: string;
    subtitlesSrt?: string;
    musicCue?: string;
  };
}

function buildVideoStages(
  topic: string,
  format: VideoFormat,
  nowMs: number,
  custom?: VideoRunSeedInput['customArtifacts'],
): VideoPipelineStage[] {
  const safeTopic = topic.trim() || 'AI Autonomous Workflows';
  return [
    {
      stageNumber: 1,
      title: 'Research Video Topics',
      description: 'Analyze audience trends, key talking points, and verified facts.',
      assigneeId: 'researcher',
      status: 'Active',
      progress: 12,
      startedAt: nowMs,
      completedAt: null,
      artifactTitle: 'Topic Brief & Key Takeaways',
      artifactContent:
        custom?.researchNotes ??
        `Topic: ${safeTopic}\nFormat: ${format}\n\nKey Angles:\n1. Why autonomous agent orchestration reduces production turnaround by 64%.\n2. Live 3D observability across specialist departments.\n3. Real-world integration pattern with Gemini API and event streams.`,
    },
    {
      stageNumber: 2,
      title: 'Generate Video Scripts',
      description: 'Draft scene-by-scene narration, hooks, and visual callouts.',
      assigneeId: 'scriptwriter',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Production Script (4 Scenes)',
      artifactContent:
        custom?.scriptText ??
        `[00:00 - Hook] Welcome inside ${safeTopic} — where six specialized AI agents collaborate in real time.\n[00:08 - Context] Our Researcher gathers verified trends while Scriptwriter structures the narrative arc.\n[00:18 - Production] Graphic Designer generates thumbnails and lower-thirds as Video Editor assembles the timeline.\n[00:30 - Outro] Ready for human sign-off and instant multi-channel publishing.`,
    },
    {
      stageNumber: 3,
      title: 'Collect & Design Assets',
      description: 'Generate thumbnails, title cards, B-roll frames, and lower thirds.',
      assigneeId: 'designer',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Visual Asset Manifest',
      artifactContent:
        `• hero_thumbnail_16x9.png (High-contrast architectural layout)\n• b_roll_isometric_office_01.mp4 (1080p @ 60fps)\n• b_roll_agent_telemetry_02.mp4 (Animated pipeline diagram)\n• lower_third_pack_v2.svg (Cobalt & Slate studio typography)`,
    },
    {
      stageNumber: 4,
      title: 'Assemble Video Clips',
      description: 'Auto-cut B-roll, sync narration markers, and apply transitions.',
      assigneeId: 'video_editor',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'NLE Timeline Cutlist',
      artifactContent:
        `Timeline: ${format} · 24fps Master\nTrack V1: Opening Hook (00:00–00:08) -> Cross-dissolve 12f\nTrack V2: Studio Walkthrough (00:08–00:20) -> L-cut audio bridge\nTrack V3: Telemetry Overlay & CTA (00:20–00:36)`,
    },
    {
      stageNumber: 5,
      title: 'Generate Subtitles',
      description: 'Time-align captions and format multi-platform SRT tracks.',
      assigneeId: 'scriptwriter',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Timecoded Subtitles (.SRT)',
      artifactContent:
        custom?.subtitlesSrt ??
        `1\n00:00:00,000 --> 00:00:04,200\nInside ${safeTopic}, six specialized AI agents run in parallel.\n\n2\n00:00:04,300 --> 00:00:09,500\nEvery handoff from research to final render is tracked live.`,
    },
    {
      stageNumber: 6,
      title: 'Add Background Music',
      description: 'Mix ambient studio underscore and duck dialogue frequencies.',
      assigneeId: 'video_editor',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Audio Mix & Mastering',
      artifactContent:
        custom?.musicCue ??
        `Track: "Architectural Pulse (Ambient Tech, 108 BPM)"\nDialogue Stem: -14 LUFS integrated\nMusic Ducking: -18 dB under voiceover transients`,
    },
    {
      stageNumber: 7,
      title: 'Render Final Video',
      description: 'Encode H.264/HEVC master with loudness normalization.',
      assigneeId: 'video_editor',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Master Render Package',
      artifactContent:
        `Codec: H.264 High Profile · 1920x1080 (or 1080x1920)\nBitrate: 18 Mbps VBR 2-Pass\nAudio: AAC 320 kbps Stereo · Loudness -14.0 LUFS`,
    },
    {
      stageNumber: 8,
      title: 'Review & Approve Result',
      description: 'Human-in-the-loop quality gate before Content Publisher schedules.',
      assigneeId: 'manager',
      status: 'Pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      artifactTitle: 'Executive QA Gate',
      artifactContent:
        `Awaiting final approval from Studio Lead. Once approved, AI Content Publisher will stage metadata and schedule distribution.`,
    },
  ];
}

export function createInitialOfficeState(nowMs: number = Date.now()): OfficeState {
  const employees: EmployeeProfile[] = [
    {
      id: 'manager',
      name: 'Yendra AI Manager',
      role: 'Operations & Task Director',
      department: 'Executive Command',
      workstation: 'Suite A1 · Command Desk',
      deskPosition: [-4.8, 0, -3.5],
      deskRotationY: Math.PI / 8,
      appearance: {
        skinColor: '#e8be9e',
        hairColor: '#1e293b',
        shirtColor: '#f8fafc',
        jacketColor: '#1e3a8a',
        pantsColor: '#0f172a',
        accentColor: '#3b82f6',
        hairStyle: 'parted',
        accessory: 'tablet',
      },
      status: 'Working',
      currentActivity: 'Balancing Q4 sprint queues',
      currentTaskId: 'task-101',
      progress: 64,
      statusUpdatedAt: nowMs - 45000,
      tasksCompleted: 14,
      tasksFailed: 0,
      totalActiveSeconds: 1840,
      efficiencyScore: 98,
    },
    {
      id: 'researcher',
      name: 'AI Researcher',
      role: 'Intelligence & Topic Analyst',
      department: 'Research Lab',
      workstation: 'Pod B1 · Analytics Terminal',
      deskPosition: [-4.8, 0, 1.8],
      deskRotationY: 0,
      appearance: {
        skinColor: '#d9a077',
        hairColor: '#27272a',
        shirtColor: '#e2e8f0',
        jacketColor: '#0f766e',
        pantsColor: '#1e293b',
        accentColor: '#14b8a6',
        hairStyle: 'short',
        accessory: 'glasses',
      },
      status: 'Thinking',
      currentActivity: 'Synthesizing market benchmarks',
      currentTaskId: 'task-102',
      progress: 42,
      statusUpdatedAt: nowMs - 22000,
      tasksCompleted: 11,
      tasksFailed: 1,
      totalActiveSeconds: 1560,
      efficiencyScore: 94,
    },
    {
      id: 'scriptwriter',
      name: 'AI Scriptwriter',
      role: 'Narrative & Script Architect',
      department: 'Editorial Studio',
      workstation: 'Pod B2 · Editorial Desk',
      deskPosition: [-1.4, 0, -2.6],
      deskRotationY: 0,
      appearance: {
        skinColor: '#f2ccb0',
        hairColor: '#7c2d12',
        shirtColor: '#fef3c7',
        jacketColor: '#b45309',
        pantsColor: '#292524',
        accentColor: '#f59e0b',
        hairStyle: 'waves',
        accessory: 'headset',
      },
      status: 'Working',
      currentActivity: 'Drafting scene-by-scene hooks',
      currentTaskId: 'task-103',
      progress: 78,
      statusUpdatedAt: nowMs - 38000,
      tasksCompleted: 16,
      tasksFailed: 0,
      totalActiveSeconds: 2120,
      efficiencyScore: 97,
    },
    {
      id: 'video_editor',
      name: 'AI Video Editor',
      role: 'Automated NLE & Motion Specialist',
      department: 'Video Production Dept',
      workstation: 'Bay V1 · Dual-Timeline Rig',
      deskPosition: [0.2, 0, 2.2],
      deskRotationY: 0,
      appearance: {
        skinColor: '#c68b63',
        hairColor: '#09090b',
        shirtColor: '#e0e7ff',
        jacketColor: '#4338ca',
        pantsColor: '#18181b',
        accentColor: '#6366f1',
        hairStyle: 'fade',
        accessory: 'headphones',
      },
      status: 'Working',
      currentActivity: 'Auto-cutting B-roll & audio stems',
      currentTaskId: 'task-104',
      progress: 51,
      statusUpdatedAt: nowMs - 30000,
      tasksCompleted: 19,
      tasksFailed: 1,
      totalActiveSeconds: 2650,
      efficiencyScore: 95,
    },
    {
      id: 'designer',
      name: 'AI Graphic Designer',
      role: 'Visual & Thumbnail Designer',
      department: 'Creative Studio',
      workstation: 'Pod C1 · Pen Display Studio',
      deskPosition: [4.5, 0, 1.5],
      deskRotationY: -Math.PI / 2,
      appearance: {
        skinColor: '#f5d0b5',
        hairColor: '#581c87',
        shirtColor: '#ffe4e6',
        jacketColor: '#be123c',
        pantsColor: '#1e293b',
        accentColor: '#f43f5e',
        hairStyle: 'bun',
        accessory: 'stylus',
      },
      status: 'Completed',
      currentActivity: 'Delivered high-CTR thumbnail set',
      currentTaskId: 'task-105',
      progress: 100,
      statusUpdatedAt: nowMs - 8000,
      tasksCompleted: 13,
      tasksFailed: 0,
      totalActiveSeconds: 1490,
      efficiencyScore: 99,
    },
    {
      id: 'publisher',
      name: 'AI Content Publisher',
      role: 'Distribution & Release Lead',
      department: 'Distribution Hub',
      workstation: 'Pod C2 · Release Console',
      deskPosition: [4.5, 0, 4.2],
      deskRotationY: -Math.PI / 2,
      appearance: {
        skinColor: '#8d5524',
        hairColor: '#18181b',
        shirtColor: '#ecfdf5',
        jacketColor: '#047857',
        pantsColor: '#0f172a',
        accentColor: '#10b981',
        hairStyle: 'curly',
        accessory: 'watch',
      },
      status: 'Idle',
      currentActivity: 'Standing by for approved masters',
      currentTaskId: null,
      progress: 0,
      statusUpdatedAt: nowMs - 15000,
      tasksCompleted: 10,
      tasksFailed: 0,
      totalActiveSeconds: 1120,
      efficiencyScore: 96,
    },
    {
      id: 'qc',
      name: 'AI Quality Control',
      role: 'Technical & Broadcast QA Lead',
      department: 'Quality Assurance',
      workstation: 'Pod Q1 · Verification Station',
      deskPosition: [1.2, 0, 4.5],
      deskRotationY: 0,
      appearance: {
        skinColor: '#e0b394',
        hairColor: '#1e293b',
        shirtColor: '#f8fafc',
        jacketColor: '#7c2d12',
        pantsColor: '#0f172a',
        accentColor: '#f97316',
        hairStyle: 'short',
        accessory: 'glasses',
      },
      status: 'Idle',
      currentActivity: 'Ready to inspect 1080x1920 masters',
      currentTaskId: null,
      progress: 0,
      statusUpdatedAt: nowMs - 10000,
      tasksCompleted: 12,
      tasksFailed: 0,
      totalActiveSeconds: 1310,
      efficiencyScore: 99,
    },
  ];

  const tasks: OfficeTask[] = [
    {
      id: 'task-101',
      title: 'Orchestrate Daily Production Sprint',
      description:
        'Evaluate incoming creative briefs, assign subtasks, and monitor throughput SLAs across departments.',
      assigneeId: 'manager',
      department: 'Executive Command',
      priority: 'High',
      status: 'Working',
      progress: 64,
      createdAt: nowMs - 90000,
      startedAt: nowMs - 45000,
      completedAt: null,
      estimatedSeconds: 28,
      elapsedSeconds: 18,
    },
    {
      id: 'task-102',
      title: 'Research AI Virtual Office Trends',
      description:
        'Compile competitor benchmarks, developer tooling adoption data, and citation links.',
      assigneeId: 'researcher',
      department: 'Research Lab',
      priority: 'Normal',
      status: 'Thinking',
      progress: 42,
      createdAt: nowMs - 65000,
      startedAt: nowMs - 22000,
      completedAt: null,
      estimatedSeconds: 26,
      elapsedSeconds: 11,
    },
    {
      id: 'task-103',
      title: 'Write Product Launch Narration Script',
      description:
        'Craft a crisp 45-second hook, storyboard cues, and call-to-action lines.',
      assigneeId: 'scriptwriter',
      department: 'Editorial Studio',
      priority: 'High',
      status: 'Working',
      progress: 78,
      createdAt: nowMs - 75000,
      startedAt: nowMs - 38000,
      completedAt: null,
      estimatedSeconds: 24,
      elapsedSeconds: 18.7,
    },
    {
      id: 'task-104',
      title: 'Assemble Studio Walkthrough Cut',
      description:
        'Sync multi-cam B-roll sequences, apply LUT color grade, and balance voiceover.',
      assigneeId: 'video_editor',
      department: 'Video Production Dept',
      priority: 'Urgent',
      status: 'Working',
      progress: 51,
      createdAt: nowMs - 60000,
      startedAt: nowMs - 30000,
      completedAt: null,
      estimatedSeconds: 30,
      elapsedSeconds: 15.3,
    },
    {
      id: 'task-105',
      title: 'Design Isometric Feature Thumbnails',
      description:
        'Produce 3 A/B thumbnail variants with bold studio contrast and clean typography.',
      assigneeId: 'designer',
      department: 'Creative Studio',
      priority: 'Normal',
      status: 'Completed',
      progress: 100,
      createdAt: nowMs - 140000,
      startedAt: nowMs - 110000,
      completedAt: nowMs - 8000,
      estimatedSeconds: 22,
      elapsedSeconds: 22,
      outputSummary: 'Exported 3 PNG variants (1280x720) + PSD layers.',
    },
    {
      id: 'task-106',
      title: 'Verify Channel SEO Tags & Chapters',
      description:
        'Prepare YouTube chapters, localized descriptions, and social teaser schedule.',
      assigneeId: 'publisher',
      department: 'Distribution Hub',
      priority: 'Normal',
      status: 'Queued',
      progress: 0,
      createdAt: nowMs - 18000,
      startedAt: null,
      completedAt: null,
      estimatedSeconds: 20,
      elapsedSeconds: 0,
    },
    {
      id: 'task-107',
      title: 'Audit Motion Graphics Frame Rate',
      description:
        'Ensure all lower-third overlays export cleanly at 60fps alpha.',
      assigneeId: 'designer',
      department: 'Creative Studio',
      priority: 'Low',
      status: 'Queued',
      progress: 0,
      createdAt: nowMs - 12000,
      startedAt: null,
      completedAt: null,
      estimatedSeconds: 18,
      elapsedSeconds: 0,
    },
    {
      id: 'task-108',
      title: 'Sync Legacy Webhook Schema Test',
      description:
        'Validate Laravel Reverb event payload delivery against sample endpoint.',
      assigneeId: 'researcher',
      department: 'Research Lab',
      priority: 'Low',
      status: 'Error',
      progress: 35,
      createdAt: nowMs - 240000,
      startedAt: nowMs - 220000,
      completedAt: null,
      estimatedSeconds: 20,
      elapsedSeconds: 7,
      errorMessage: 'Demo simulation: Upstream webhook timeout (HTTP 504) — ready to retry.',
    },
  ];

  const initialVideoRun: VideoProductionRun = {
    id: 'vrun-101',
    topic: 'How Yendra AI Office Automates Full-Stack Video Production',
    format: '16:9 YouTube',
    status: 'In Progress',
    createdAt: nowMs - 40000,
    completedAt: null,
    currentStage: 1,
    stages: buildVideoStages(
      'How Yendra AI Office Automates Full-Stack Video Production',
      '16:9 YouTube',
      nowMs - 40000,
    ),
    geminiAssisted: false,
  };

  const activityLog: ActivityLogEntry[] = [
    {
      id: 'log-1',
      timestamp: nowMs - 8000,
      agentId: 'designer',
      agentName: 'AI Graphic Designer',
      status: 'Completed',
      message: 'Completed "Design Isometric Feature Thumbnails" (100%).',
      taskId: 'task-105',
      source: 'demo-sim',
    },
    {
      id: 'log-2',
      timestamp: nowMs - 22000,
      agentId: 'researcher',
      agentName: 'AI Researcher',
      status: 'Thinking',
      message: 'Analyzing competitor data for "Research AI Virtual Office Trends".',
      taskId: 'task-102',
      source: 'demo-sim',
    },
    {
      id: 'log-3',
      timestamp: nowMs - 30000,
      agentId: 'video_editor',
      agentName: 'AI Video Editor',
      status: 'Working',
      message: 'Processing timeline cuts on "Assemble Studio Walkthrough Cut".',
      taskId: 'task-104',
      source: 'demo-sim',
    },
    {
      id: 'log-4',
      timestamp: nowMs - 38000,
      agentId: 'scriptwriter',
      agentName: 'AI Scriptwriter',
      status: 'Working',
      message: 'Writing scene beats for "Write Product Launch Narration Script".',
      taskId: 'task-103',
      source: 'demo-sim',
    },
    {
      id: 'log-5',
      timestamp: nowMs - 45000,
      agentId: 'manager',
      agentName: 'Yendra AI Manager',
      status: 'Working',
      message: 'Dispatched video pipeline brief to Research & Editorial teams.',
      taskId: 'task-101',
      source: 'demo-sim',
    },
    {
      id: 'log-6',
      timestamp: nowMs - 190000,
      agentId: 'researcher',
      agentName: 'AI Researcher',
      status: 'Error',
      message: 'Task "Sync Legacy Webhook Schema Test" paused on demo timeout error.',
      taskId: 'task-108',
      source: 'demo-sim',
    },
  ];

  return {
    employees,
    tasks,
    activityLog,
    videoRuns: [initialVideoRun],
    activeVideoRunId: initialVideoRun.id,
    simulationRunning: true,
    simulationSpeed: 1,
    modeLabel: 'Demo Simulation',
    lastTickAt: nowMs,
  };
}

function appendLog(
  logs: ActivityLogEntry[],
  entry: Omit<ActivityLogEntry, 'id'>,
): ActivityLogEntry[] {
  const newEntry: ActivityLogEntry = {
    ...entry,
    id: nextId('log'),
  };
  return [newEntry, ...logs].slice(0, 60);
}

const DEMO_CYCLIC_TOPICS: Record<AgentId, Array<{ title: string; activity: string }>> = {
  manager: [
    { title: 'Review Department Throughput', activity: 'Auditing task turnaround times' },
    { title: 'Reprioritize Editorial Backlog', activity: 'Rebalancing agent workloads' },
  ],
  researcher: [
    { title: 'Gather Multimodal Citations', activity: 'Cross-checking primary sources' },
    { title: 'Extract Viewer Retention Signals', activity: 'Evaluating audience hooks' },
  ],
  scriptwriter: [
    { title: 'Refine Voiceover Pacing', activity: 'Polishing spoken transitions' },
    { title: 'Draft Short-Form Teaser Copy', activity: 'Writing 30-sec vertical script' },
  ],
  video_editor: [
    { title: 'Color Match Studio B-Roll', activity: 'Applying ACES Filmic LUTs' },
    { title: 'Normalize Dialogue Track', activity: 'Balancing stereo stems to -14 LUFS' },
  ],
  designer: [
    { title: 'Create Motion Lower Thirds', activity: 'Designing crisp title overlays' },
    { title: 'Export Social Carousel Cards', activity: 'Rendering high-contrast graphics' },
  ],
  publisher: [
    { title: 'Stage YouTube Metadata Pack', activity: 'Formatting tags & chapter markers' },
    { title: 'Schedule Multi-Platform Drop', activity: 'Queued publishing calendar' },
  ],
  qc: [
    { title: 'Verify 9:16 Subtitle Sync', activity: 'Auditing Indonesian spelling & timings' },
    { title: 'Validate MP4 Audio & Dimensions', activity: 'Checking 1080x1920 & LUFS levels' },
  ],
};

export function stepOfficeSimulation(
  state: OfficeState,
  dtSeconds: number,
  nowMs: number = Date.now(),
): OfficeState {
  if (!state.simulationRunning || dtSeconds <= 0) {
    return state;
  }

  const scaledDt = Math.min(dtSeconds, 2) * state.simulationSpeed;
  let tasks = state.tasks.map((t) => ({ ...t }));
  let activityLog = [...state.activityLog];
  let employees = state.employees.map((e) => ({ ...e }));

  // 1. Advance active tasks & update corresponding employee state
  employees = employees.map((emp) => {
    if (emp.status === 'Error') {
      return emp;
    }

    const currentTask = emp.currentTaskId
      ? tasks.find((t) => t.id === emp.currentTaskId)
      : undefined;

    if (
      currentTask &&
      (currentTask.status === 'Working' || currentTask.status === 'Thinking')
    ) {
      const nextElapsed = currentTask.elapsedSeconds + scaledDt;
      const pct = Math.min(
        100,
        Math.round((nextElapsed / Math.max(4, currentTask.estimatedSeconds)) * 100),
      );
      const nextStatus: AgentStatus =
        pct < 28 ? 'Thinking' : pct >= 100 ? 'Completed' : 'Working';

      currentTask.elapsedSeconds = nextElapsed;
      currentTask.progress = pct;

      if (pct >= 100) {
        currentTask.status = 'Completed';
        currentTask.completedAt = nowMs;
        currentTask.outputSummary =
          currentTask.outputSummary ?? 'Completed cleanly in Demo Simulation.';

        activityLog = appendLog(activityLog, {
          timestamp: nowMs,
          agentId: emp.id,
          agentName: emp.name,
          status: 'Completed',
          message: `Completed "${currentTask.title}" (100%).`,
          taskId: currentTask.id,
          source: 'demo-sim',
        });

        return {
          ...emp,
          status: 'Completed' as AgentStatus,
          currentActivity: `Finished ${currentTask.title}`,
          progress: 100,
          statusUpdatedAt: nowMs,
          tasksCompleted: emp.tasksCompleted + 1,
          totalActiveSeconds: emp.totalActiveSeconds + Math.round(scaledDt),
        };
      }

      if (currentTask.status !== nextStatus) {
        currentTask.status = nextStatus;
        activityLog = appendLog(activityLog, {
          timestamp: nowMs,
          agentId: emp.id,
          agentName: emp.name,
          status: nextStatus,
          message:
            nextStatus === 'Working'
              ? `Executing "${currentTask.title}".`
              : `Thinking through "${currentTask.title}".`,
          taskId: currentTask.id,
          source: 'demo-sim',
        });
      }

      return {
        ...emp,
        status: nextStatus,
        progress: pct,
        totalActiveSeconds: emp.totalActiveSeconds + Math.round(scaledDt),
      };
    }

    // 2. If Idle or Completed for > 4s (scaled), pick up queued task or spawn a demo cycle task
    const dwellSeconds = (nowMs - emp.statusUpdatedAt) / 1000;
    const readyForNext =
      emp.status === 'Idle'
        ? dwellSeconds >= 2.5 / state.simulationSpeed
        : emp.status === 'Completed'
          ? dwellSeconds >= 3.5 / state.simulationSpeed
          : false;

    if (readyForNext) {
      const queued = tasks.find(
        (t) => t.assigneeId === emp.id && t.status === 'Queued',
      );
      if (queued) {
        queued.status = 'Thinking';
        queued.startedAt = nowMs;
        queued.progress = 5;
        queued.elapsedSeconds = 1;

        activityLog = appendLog(activityLog, {
          timestamp: nowMs,
          agentId: emp.id,
          agentName: emp.name,
          status: 'Thinking',
          message: `Picked up queued task "${queued.title}".`,
          taskId: queued.id,
          source: 'demo-sim',
        });

        return {
          ...emp,
          status: 'Thinking' as AgentStatus,
          currentTaskId: queued.id,
          currentActivity: queued.title,
          progress: 5,
          statusUpdatedAt: nowMs,
        };
      }

      // If agent finished and has no queued tasks, transition Completed -> Idle -> subtle next autonomous demo task
      if (emp.status === 'Completed') {
        return {
          ...emp,
          status: 'Idle' as AgentStatus,
          currentTaskId: null,
          currentActivity: 'Ready for next assignment',
          progress: 0,
          statusUpdatedAt: nowMs,
        };
      }

      if (emp.status === 'Idle' && dwellSeconds >= 5 / state.simulationSpeed) {
        const templates = DEMO_CYCLIC_TOPICS[emp.id];
        const pick = templates[emp.tasksCompleted % templates.length];
        const newTask: OfficeTask = {
          id: nextId('task'),
          title: pick.title,
          description: `Autonomous demo routine executed by ${emp.name}.`,
          assigneeId: emp.id,
          department: emp.department,
          priority: 'Normal',
          status: 'Working',
          progress: 8,
          createdAt: nowMs,
          startedAt: nowMs,
          completedAt: null,
          estimatedSeconds: 22,
          elapsedSeconds: 1.8,
        };
        tasks = [newTask, ...tasks];

        activityLog = appendLog(activityLog, {
          timestamp: nowMs,
          agentId: emp.id,
          agentName: emp.name,
          status: 'Working',
          message: `Started autonomous task "${newTask.title}".`,
          taskId: newTask.id,
          source: 'demo-sim',
        });

        return {
          ...emp,
          status: 'Working' as AgentStatus,
          currentTaskId: newTask.id,
          currentActivity: pick.activity,
          progress: 8,
          statusUpdatedAt: nowMs,
        };
      }
    }

    return emp;
  });

  // 3. Advance active Video Production Department runs (Stages 1..7 auto-advance; Stage 8 waits for human review!)
  const videoRuns = state.videoRuns.map((run) => {
    if (run.status !== 'In Progress') {
      return run;
    }

    const stages = run.stages.map((s) => ({ ...s }));
    const activeIdx = stages.findIndex((s) => s.status === 'Active');
    if (activeIdx === -1) return run;

    const activeStage = stages[activeIdx];

    // Stage 8 is human Review & Approve gate
    if (activeStage.stageNumber === 8) {
      return {
        ...run,
        status: 'Awaiting Review' as const,
        currentStage: 8,
        stages,
      };
    }

    const stageDuration = 7.5; // seconds per stage at 1x speed
    const nextProgress = Math.min(
      100,
      activeStage.progress + (scaledDt / stageDuration) * 100,
    );
    activeStage.progress = Math.round(nextProgress);

    // Sync assigned employee's visible activity with active pipeline stage!
    const empIdx = employees.findIndex((e) => e.id === activeStage.assigneeId);
    if (empIdx !== -1 && employees[empIdx].status !== 'Error') {
      employees[empIdx] = {
        ...employees[empIdx],
        status: activeStage.progress < 25 ? 'Thinking' : 'Working',
        currentActivity: `Video Step ${activeStage.stageNumber}/8: ${activeStage.title}`,
        progress: activeStage.progress,
      };
    }

    if (nextProgress >= 100) {
      activeStage.status = 'Completed';
      activeStage.progress = 100;
      activeStage.completedAt = nowMs;

      const stageOwner = employees.find((e) => e.id === activeStage.assigneeId);
      activityLog = appendLog(activityLog, {
        timestamp: nowMs,
        agentId: activeStage.assigneeId,
        agentName: stageOwner?.name ?? 'AI Agent',
        status: 'Completed',
        message: `Video Pipeline Step ${activeStage.stageNumber}/8 completed: ${activeStage.title}.`,
        source: 'demo-sim',
      });

      const nextStage = stages[activeIdx + 1];
      if (nextStage) {
        nextStage.status = 'Active';
        nextStage.startedAt = nowMs;
        nextStage.progress = nextStage.stageNumber === 8 ? 100 : 8;

        if (nextStage.stageNumber === 8) {
          activityLog = appendLog(activityLog, {
            timestamp: nowMs,
            agentId: 'manager',
            agentName: 'Yendra AI Manager',
            status: 'Completed',
            message: `Video "${run.topic}" rendered & ready for User Review & Approval.`,
            source: 'demo-sim',
          });
          return {
            ...run,
            status: 'Awaiting Review' as const,
            currentStage: 8,
            stages,
          };
        }

        return {
          ...run,
          currentStage: nextStage.stageNumber,
          stages,
        };
      }
    }

    return {
      ...run,
      stages,
    };
  });

  return {
    ...state,
    employees,
    tasks,
    activityLog,
    videoRuns,
    lastTickAt: nowMs,
  };
}

export interface AssignTaskInput {
  title: string;
  description: string;
  assigneeId: AgentId;
  priority: TaskPriority;
  estimatedSeconds?: number;
}

export function assignTaskToAgent(
  state: OfficeState,
  input: AssignTaskInput,
  nowMs: number = Date.now(),
): OfficeState {
  const title = input.title.trim();
  if (!title) return state;

  const targetEmp = state.employees.find((e) => e.id === input.assigneeId);
  if (!targetEmp) return state;

  const shouldStartImmediately =
    targetEmp.status === 'Idle' || targetEmp.status === 'Completed';

  const newTask: OfficeTask = {
    id: nextId('task'),
    title,
    description:
      input.description.trim() || `Assigned by Yendra AI Manager to ${targetEmp.name}.`,
    assigneeId: input.assigneeId,
    department: targetEmp.department,
    priority: input.priority,
    status: shouldStartImmediately ? 'Thinking' : 'Queued',
    progress: shouldStartImmediately ? 5 : 0,
    createdAt: nowMs,
    startedAt: shouldStartImmediately ? nowMs : null,
    completedAt: null,
    estimatedSeconds: input.estimatedSeconds ?? 24,
    elapsedSeconds: shouldStartImmediately ? 1 : 0,
  };

  const employees = state.employees.map((emp) => {
    if (emp.id !== input.assigneeId || !shouldStartImmediately) {
      return emp;
    }
    return {
      ...emp,
      status: 'Thinking' as AgentStatus,
      currentTaskId: newTask.id,
      currentActivity: newTask.title,
      progress: 5,
      statusUpdatedAt: nowMs,
    };
  });

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: input.assigneeId,
    agentName: targetEmp.name,
    status: shouldStartImmediately ? 'Thinking' : 'Idle',
    message: shouldStartImmediately
      ? `Manager assigned "${newTask.title}" — started immediately.`
      : `Manager queued "${newTask.title}" (${input.priority} priority).`,
    taskId: newTask.id,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    tasks: [newTask, ...state.tasks],
    activityLog,
  };
}

export function triggerAgentError(
  state: OfficeState,
  agentId: AgentId,
  reason: string = 'Simulated pipeline interruption (Demo Error).',
  nowMs: number = Date.now(),
): OfficeState {
  const emp = state.employees.find((e) => e.id === agentId);
  if (!emp) return state;

  let tasks = state.tasks.map((t) => ({ ...t }));
  let targetTaskId = emp.currentTaskId;

  if (targetTaskId) {
    const task = tasks.find((t) => t.id === targetTaskId);
    if (task) {
      task.status = 'Error';
      task.errorMessage = reason;
    }
  } else {
    const fallbackTask: OfficeTask = {
      id: nextId('task'),
      title: 'Diagnostic Check Task',
      description: 'Triggered for workstation error-recovery inspection.',
      assigneeId: agentId,
      department: emp.department,
      priority: 'High',
      status: 'Error',
      progress: 40,
      createdAt: nowMs,
      startedAt: nowMs,
      completedAt: null,
      estimatedSeconds: 20,
      elapsedSeconds: 8,
      errorMessage: reason,
    };
    tasks = [fallbackTask, ...tasks];
    targetTaskId = fallbackTask.id;
  }

  const employees = state.employees.map((e) =>
    e.id === agentId
      ? {
          ...e,
          status: 'Error' as AgentStatus,
          currentTaskId: targetTaskId,
          currentActivity: reason,
          statusUpdatedAt: nowMs,
          tasksFailed: e.tasksFailed + 1,
        }
      : e,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId,
    agentName: emp.name,
    status: 'Error',
    message: `Error state on ${emp.name}: ${reason}`,
    taskId: targetTaskId ?? undefined,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    tasks,
    activityLog,
  };
}

export function retryFailedTask(
  state: OfficeState,
  taskId: string,
  nowMs: number = Date.now(),
): OfficeState {
  const target = state.tasks.find((t) => t.id === taskId);
  if (!target || target.status !== 'Error') return state;

  const emp = state.employees.find((e) => e.id === target.assigneeId);
  if (!emp) return state;

  const tasks = state.tasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          status: 'Working' as const,
          errorMessage: undefined,
          startedAt: t.startedAt ?? nowMs,
          progress: Math.max(15, t.progress),
        }
      : t,
  );

  const employees = state.employees.map((e) =>
    e.id === target.assigneeId
      ? {
          ...e,
          status: 'Working' as AgentStatus,
          currentTaskId: target.id,
          currentActivity: `Retrying: ${target.title}`,
          progress: Math.max(15, target.progress),
          statusUpdatedAt: nowMs,
        }
      : e,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: target.assigneeId,
    agentName: emp.name,
    status: 'Working',
    message: `Retried failed task "${target.title}".`,
    taskId: target.id,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    tasks,
    activityLog,
  };
}

export function cancelTask(
  state: OfficeState,
  taskId: string,
  nowMs: number = Date.now(),
): OfficeState {
  const target = state.tasks.find((t) => t.id === taskId);
  if (!target) return state;

  const emp = state.employees.find((e) => e.id === target.assigneeId);
  const tasks = state.tasks.filter((t) => t.id !== taskId);

  const employees = state.employees.map((e) => {
    if (e.currentTaskId === taskId) {
      return {
        ...e,
        status: 'Idle' as AgentStatus,
        currentTaskId: null,
        currentActivity: 'Task removed from queue',
        progress: 0,
        statusUpdatedAt: nowMs,
      };
    }
    return e;
  });

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: target.assigneeId,
    agentName: emp?.name ?? 'AI Agent',
    status: 'Idle',
    message: `Cancelled task "${target.title}".`,
    source: 'manual',
  });

  return {
    ...state,
    employees,
    tasks,
    activityLog,
  };
}

export function startVideoProductionRun(
  state: OfficeState,
  input: VideoRunSeedInput,
  nowMs: number = Date.now(),
): OfficeState {
  const topic = input.topic.trim();
  if (!topic) return state;

  const newRun: VideoProductionRun = {
    id: nextId('vrun'),
    topic,
    format: input.format,
    status: 'In Progress',
    createdAt: nowMs,
    completedAt: null,
    currentStage: 1,
    stages: buildVideoStages(topic, input.format, nowMs, input.customArtifacts),
    geminiAssisted: Boolean(input.geminiAssisted),
  };

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: 'manager',
    agentName: 'Yendra AI Manager',
    status: 'Working',
    message: `Launched 8-step Video Production Run: "${topic}" (${input.format}).`,
    source: input.geminiAssisted ? 'gemini-api' : 'manual',
  });

  return {
    ...state,
    videoRuns: [newRun, ...state.videoRuns],
    activeVideoRunId: newRun.id,
    activityLog,
  };
}

export function approveVideoRun(
  state: OfficeState,
  runId: string,
  notes: string = 'Approved for multi-channel release.',
  nowMs: number = Date.now(),
): OfficeState {
  const run = state.videoRuns.find((r) => r.id === runId);
  if (!run) return state;

  const videoRuns = state.videoRuns.map((r) => {
    if (r.id !== runId) return r;
    const stages = r.stages.map((s) =>
      s.stageNumber === 8
        ? {
            ...s,
            status: 'Completed' as const,
            progress: 100,
            completedAt: nowMs,
          }
        : s,
    );
    return {
      ...r,
      status: 'Approved' as const,
      completedAt: nowMs,
      reviewNotes: notes,
      stages,
    };
  });

  const employees = state.employees.map((e) =>
    e.id === 'publisher'
      ? {
          ...e,
          status: 'Completed' as AgentStatus,
          currentActivity: `Staged "${run.topic}" for publishing`,
          progress: 100,
          statusUpdatedAt: nowMs,
          tasksCompleted: e.tasksCompleted + 1,
        }
      : e,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: 'publisher',
    agentName: 'AI Content Publisher',
    status: 'Completed',
    message: `Approved & queued "${run.topic}" for publishing.`,
    source: 'manual',
  });

  return {
    ...state,
    videoRuns,
    employees,
    activityLog,
  };
}

export function requestVideoRevision(
  state: OfficeState,
  runId: string,
  notes: string,
  nowMs: number = Date.now(),
): OfficeState {
  const run = state.videoRuns.find((r) => r.id === runId);
  if (!run) return state;

  const videoRuns = state.videoRuns.map((r) => {
    if (r.id !== runId) return r;
    const stages = r.stages.map((s) => {
      if (s.stageNumber >= 4 && s.stageNumber <= 7) {
        return {
          ...s,
          status: s.stageNumber === 4 ? ('Active' as const) : ('Pending' as const),
          progress: s.stageNumber === 4 ? 20 : 0,
          completedAt: null,
        };
      }
      if (s.stageNumber === 8) {
        return {
          ...s,
          status: 'Pending' as const,
          progress: 0,
          completedAt: null,
        };
      }
      return s;
    });

    return {
      ...r,
      status: 'In Progress' as const,
      currentStage: 4,
      reviewNotes: notes || 'Revision requested on assembly & pacing.',
      stages,
    };
  });

  const activityLog = appendLog(state.activityLog, {
    timestamp: nowMs,
    agentId: 'video_editor',
    agentName: 'AI Video Editor',
    status: 'Working',
    message: `Revision requested on "${run.topic}" — re-entering Step 4 Clip Assembly.`,
    source: 'manual',
  });

  return {
    ...state,
    videoRuns,
    activityLog,
  };
}

export function applyExternalAgentEvent(
  state: OfficeState,
  event: ExternalAgentEvent,
  nowMs: number = Date.now(),
): OfficeState {
  const { agentId, status, activity, progress, taskTitle, errorMessage } = event.data;
  const emp = state.employees.find((e) => e.id === agentId);
  if (!emp) return state;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  let tasks = [...state.tasks];
  let currentTaskId = emp.currentTaskId;

  if (taskTitle) {
    const newTask: OfficeTask = {
      id: nextId('evt-task'),
      title: taskTitle,
      description: `External event received on channel "${event.channel}" (${event.event}).`,
      assigneeId: agentId,
      department: emp.department,
      priority: 'High',
      status: status === 'Idle' ? 'Queued' : status,
      progress: clampedProgress,
      createdAt: nowMs,
      startedAt: nowMs,
      completedAt: status === 'Completed' ? nowMs : null,
      estimatedSeconds: 30,
      elapsedSeconds: 0,
      errorMessage,
    };
    tasks = [newTask, ...tasks];
    currentTaskId = newTask.id;
  }

  const employees = state.employees.map((e) =>
    e.id === agentId
      ? {
          ...e,
          status,
          currentActivity: activity,
          progress: clampedProgress,
          currentTaskId,
          statusUpdatedAt: nowMs,
          tasksCompleted:
            status === 'Completed' ? e.tasksCompleted + 1 : e.tasksCompleted,
          tasksFailed: status === 'Error' ? e.tasksFailed + 1 : e.tasksFailed,
        }
      : e,
  );

  const activityLog = appendLog(state.activityLog, {
    timestamp: event.data.timestamp ?? nowMs,
    agentId,
    agentName: emp.name,
    status,
    message: `[${event.event.split('\\').pop()}] ${activity} (${clampedProgress}%)`,
    taskId: currentTaskId ?? undefined,
    source: 'webhook-event',
  });

  return {
    ...state,
    employees,
    tasks,
    activityLog,
  };
}

export function computeDashboardMetrics(state: OfficeState): DashboardMetrics {
  const totalEmployees = state.employees.length;
  const activeTasks = state.tasks.filter(
    (t) => t.status === 'Working' || t.status === 'Thinking',
  ).length;
  const queuedTasks = state.tasks.filter((t) => t.status === 'Queued').length;
  const completedTasks = state.tasks.filter((t) => t.status === 'Completed').length;
  const failedTasks = state.tasks.filter((t) => t.status === 'Error').length;
  const workingCount = state.employees.filter((e) => e.status === 'Working').length;
  const thinkingCount = state.employees.filter((e) => e.status === 'Thinking').length;
  const idleCount = state.employees.filter((e) => e.status === 'Idle').length;
  const awaitingVideoReview = state.videoRuns.filter(
    (r) => r.status === 'Awaiting Review',
  ).length;

  return {
    totalEmployees,
    activeTasks,
    queuedTasks,
    completedTasks,
    failedTasks,
    workingCount,
    thinkingCount,
    idleCount,
    awaitingVideoReview,
  };
}
