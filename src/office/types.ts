export type AgentId =
  | 'manager'
  | 'researcher'
  | 'scriptwriter'
  | 'video_editor'
  | 'designer'
  | 'publisher'
  | 'qc';

export type AgentStatus =
  | 'Working'
  | 'Thinking'
  | 'Idle'
  | 'Completed'
  | 'Error';

export type TaskPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type TaskStatus =
  | 'Queued'
  | 'Working'
  | 'Thinking'
  | 'Completed'
  | 'Error';

export interface AvatarAppearance {
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  jacketColor: string;
  pantsColor: string;
  accentColor: string;
  hairStyle: 'short' | 'parted' | 'curly' | 'bun' | 'fade' | 'waves';
  accessory: 'tablet' | 'glasses' | 'headset' | 'headphones' | 'stylus' | 'watch';
}

export interface EmployeeProfile {
  id: AgentId;
  name: string;
  role: string;
  department: string;
  workstation: string;
  deskPosition: [number, number, number];
  deskRotationY: number;
  appearance: AvatarAppearance;
  status: AgentStatus;
  currentActivity: string;
  currentTaskId: string | null;
  progress: number;
  statusUpdatedAt: number;
  tasksCompleted: number;
  tasksFailed: number;
  totalActiveSeconds: number;
  efficiencyScore: number;
}

export interface OfficeTask {
  id: string;
  title: string;
  description: string;
  assigneeId: AgentId;
  department: string;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  estimatedSeconds: number;
  elapsedSeconds: number;
  errorMessage?: string;
  outputSummary?: string;
  pipelineId?: string;
  stageNumber?: number;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  agentId: AgentId;
  agentName: string;
  status: AgentStatus;
  message: string;
  taskId?: string;
  source: 'demo-sim' | 'manual' | 'webhook-event' | 'gemini-api';
}

export type VideoFormat = '16:9 YouTube' | '9:16 Shorts' | 'LinkedIn Cut';

export type VideoPipelineStatus =
  | 'In Progress'
  | 'Awaiting Review'
  | 'Approved'
  | 'Revision Requested';

export interface VideoPipelineStage {
  stageNumber: number;
  title: string;
  description: string;
  assigneeId: AgentId;
  status: 'Pending' | 'Active' | 'Completed' | 'Error';
  progress: number;
  startedAt: number | null;
  completedAt: number | null;
  artifactTitle: string;
  artifactContent: string;
}

export interface VideoProductionRun {
  id: string;
  topic: string;
  format: VideoFormat;
  status: VideoPipelineStatus;
  createdAt: number;
  completedAt: number | null;
  currentStage: number;
  stages: VideoPipelineStage[];
  reviewNotes?: string;
  geminiAssisted: boolean;
}

export type ManagerPatrolPhase =
  | 'at_desk'
  | 'walking_to_colleague'
  | 'inspecting'
  | 'returning_to_desk';

export interface ManagerPatrolState {
  enabled: boolean;
  phase: ManagerPatrolPhase;
  targetAgentId: AgentId | null;
  targetPos: [number, number, number];
  targetLookAt: [number, number, number];
  currentPos: [number, number, number];
  currentYaw: number;
  dwellSeconds: number;
  visitedOrder: AgentId[];
}

export interface OfficeState {
  employees: EmployeeProfile[];
  tasks: OfficeTask[];
  activityLog: ActivityLogEntry[];
  videoRuns: VideoProductionRun[];
  activeVideoRunId: string | null;
  simulationRunning: boolean;
  simulationSpeed: 1 | 2 | 4;
  modeLabel: 'Simulasi Demo' | 'Live Event Bus';
  lastTickAt: number;
  managerPatrol: ManagerPatrolState;
}

export interface DashboardMetrics {
  totalEmployees: number;
  activeTasks: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  workingCount: number;
  thinkingCount: number;
  idleCount: number;
  awaitingVideoReview: number;
}

export interface ExternalAgentEvent {
  event: 'App\\Events\\AgentTaskUpdated' | 'App\\Events\\AgentStatusChanged';
  channel: string;
  data: {
    agentId: AgentId;
    status: AgentStatus;
    activity: string;
    progress: number;
    taskTitle?: string;
    errorMessage?: string;
    timestamp?: number;
  };
}

export type CameraPresetId =
  | 'isometric'
  | 'manager'
  | 'video_bay'
  | 'creative_pod'
  | 'meeting_room';
