export type StudioJobStatus =
  | 'queued'
  | 'researching'
  | 'scripting'
  | 'designing'
  | 'editing'
  | 'qc'
  | 'waiting_review'
  | 'completed'
  | 'failed';

export type StudioActiveAgent =
  | 'researcher'
  | 'scriptwriter'
  | 'designer'
  | 'video_editor'
  | 'qc'
  | null;

export interface MissingConfigItem {
  key: string;
  label: string;
  reason: string;
}

export interface StudioServiceStatus {
  geminiConfigured: boolean;
  geminiModel: string;
  ttsModel: string;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  externalImageProvider: 'openai' | 'gemini-svg-resvg';
  storageReady: boolean;
  jakartaDate: string;
  jakartaClock: string;
  autoProduceEnabled: boolean;
  missingConfigs: MissingConfigItem[];
}

export interface StudioDashboardMetrics {
  dailyTarget: number;
  completedToday: number;
  currentlyEditing: number;
  waitingReview: number;
  failedTasks: number;
  totalProduced: number;
  queuedToday: number;
}

export interface DailyScheduleRow {
  scheduleDate: string;
  targetCount: number;
  topicSlugs: string[];
  createdAt: string;
}

export interface ProductionJobRecord {
  id: string;
  scheduleDate: string;
  topicSlug: string;
  topicTitle: string;
  category: string;
  angle: string;
  status: StudioJobStatus;
  currentStageIndex: number;
  activeAgent: StudioActiveAgent;
  researchJson: string | null;
  scriptJson: string | null;
  assetPathsJson: string | null;
  audioPath: string | null;
  subtitlePath: string | null;
  videoId: string | null;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProducedVideoRecord {
  id: string;
  jobId: string;
  scheduleDate: string;
  topicSlug: string;
  title: string;
  description: string;
  caption: string;
  hashtags: string[];
  hookText: string;
  endingText: string;
  scriptText: string;
  subtitlesSrt: string;
  researchSummary: string;
  researchReferences: string[];
  fileName: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  qcPassed: boolean;
  qcNotes: string;
  createdAt: string;
}

export interface StudioLogRow {
  id: number;
  jobId: string | null;
  agentId: string;
  level: 'info' | 'success' | 'error';
  message: string;
  createdAt: string;
}

export interface StudioDashboardPayload {
  serviceStatus: StudioServiceStatus;
  metrics: StudioDashboardMetrics;
  todaySchedule: DailyScheduleRow | null;
  jobs: ProductionJobRecord[];
  videos: ProducedVideoRecord[];
  logs: StudioLogRow[];
  runningJobId: string | null;
}
