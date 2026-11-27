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

export type AiQcStatus = 'none' | 'pending' | 'passed' | 'rejected';

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
  pendingVideoFile?: string | null;
  aiQcStatus?: AiQcStatus;
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type TikTokPublishMode = 'draft' | 'direct';

export type TikTokPrivacyLevel =
  | 'SELF_ONLY'
  | 'MUTUAL_FOLLOW_FRIENDS'
  | 'FOLLOWER_OF_CREATOR'
  | 'PUBLIC_TO_EVERYONE';

export type TikTokUploadStatus =
  | 'none'
  | 'uploading'
  | 'draft_sent'
  | 'published'
  | 'failed';

export interface TikTokUploadArchiveRecord {
  id: number;
  videoId: string;
  publishId: string;
  fileNameOriginal: string;
  fileSizeBytes: number;
  uploadedAt: string;
  mode: TikTokPublishMode;
  privacyLevel: TikTokPrivacyLevel;
  thumbnailFileName: string | null;
  archivedAt: string;
}

export interface TikTokAccountStatus {
  configured: boolean;
  missingKeys: string[];
  connected: boolean;
  openId: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  scope: string | null;
  expiresAt: string | null;
  autoUploadEnabled: boolean;
  defaultMode: TikTokPublishMode;
  defaultPrivacy: TikTokPrivacyLevel;
  scheduledHoursWib: string[];
  archivedCount: number;
  activeCallbackUrl: string;
  callbackUrls: {
    dev: string;
    shared: string;
  };
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
  aiQcStatus?: Exclude<AiQcStatus, 'none'>;
  qcNotes: string;
  tiktokStatus?: TikTokUploadStatus;
  tiktokPublishId?: string | null;
  tiktokMode?: TikTokPublishMode | null;
  tiktokError?: string | null;
  tiktokUploadedAt?: string | null;
  thumbnailFileName?: string | null;
  fileCleanedUp?: boolean;
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
  tiktok: TikTokAccountStatus;
}
