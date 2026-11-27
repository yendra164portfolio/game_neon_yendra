import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  MOTIVATION_TOPIC_CATALOG,
  getJakartaDateString,
  selectDailyTopics,
} from '../src/studio/topicCatalog.ts';
import type {
  AiQcStatus,
  DailyScheduleRow,
  ProducedVideoRecord,
  ProductionJobRecord,
  StudioActiveAgent,
  StudioDashboardMetrics,
  StudioJobStatus,
  StudioLogRow,
  TikTokPrivacyLevel,
  TikTokPublishMode,
  TikTokUploadArchiveRecord,
  TikTokUploadStatus,
} from '../src/studio/types.ts';

const execFileAsync = promisify(execFile);

export interface StoredTikTokTokens {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  refreshExpiresAtMs: number;
  scope: string;
  openId: string;
}

export interface StoredTikTokProfile {
  openId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface StoredTikTokSettings {
  autoUploadEnabled: boolean;
  defaultMode: TikTokPublishMode;
  defaultPrivacy: TikTokPrivacyLevel;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{3,90}$/;

export function isValidResourceId(id: string): boolean {
  return VALID_ID_REGEX.test(id);
}

export type StorageSubDir =
  | 'videos'
  | 'audio'
  | 'assets'
  | 'subtitles'
  | 'thumbnails';

export class StudioDatabase {
  public readonly db: DatabaseSync;
  public readonly storageRoot: string;

  constructor(options?: { dbPath?: string; storageRoot?: string }) {
    this.storageRoot = path.resolve(options?.storageRoot ?? path.join(process.cwd(), 'storage'));
    const dbPath = path.resolve(
      options?.dbPath ?? path.join(this.storageRoot, 'yendra_studio.sqlite'),
    );

    fs.mkdirSync(this.storageRoot, { recursive: true });
    for (const sub of ['videos', 'audio', 'assets', 'subtitles', 'thumbnails'] as const) {
      fs.mkdirSync(path.join(this.storageRoot, sub), { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_schedules (
        schedule_date TEXT PRIMARY KEY,
        target_count INTEGER NOT NULL DEFAULT 3,
        topic_slugs_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS production_jobs (
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

      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        schedule_date TEXT NOT NULL,
        topic_slug TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        caption TEXT NOT NULL,
        hashtags_json TEXT NOT NULL,
        hook_text TEXT NOT NULL,
        ending_text TEXT NOT NULL,
        script_text TEXT NOT NULL,
        subtitles_srt TEXT NOT NULL,
        research_summary TEXT NOT NULL,
        research_references_json TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        duration_seconds REAL NOT NULL,
        qc_passed INTEGER NOT NULL DEFAULT 1,
        ai_qc_status TEXT NOT NULL DEFAULT 'passed',
        qc_notes TEXT NOT NULL,
        tiktok_status TEXT NOT NULL DEFAULT 'none',
        tiktok_publish_id TEXT,
        tiktok_mode TEXT,
        tiktok_error TEXT,
        tiktok_uploaded_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS studio_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT,
        agent_id TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS studio_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.ensureColumnExists('production_jobs', 'pending_video_file', 'TEXT');
    this.ensureColumnExists(
      'production_jobs',
      'ai_qc_status',
      "TEXT NOT NULL DEFAULT 'none'",
    );
    this.ensureColumnExists(
      'videos',
      'ai_qc_status',
      "TEXT NOT NULL DEFAULT 'passed'",
    );
    this.ensureColumnExists(
      'videos',
      'tiktok_status',
      "TEXT NOT NULL DEFAULT 'none'",
    );
    this.ensureColumnExists('videos', 'tiktok_publish_id', 'TEXT');
    this.ensureColumnExists('videos', 'tiktok_mode', 'TEXT');
    this.ensureColumnExists('videos', 'tiktok_error', 'TEXT');
    this.ensureColumnExists('videos', 'tiktok_uploaded_at', 'TEXT');
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_videos_job_id ON videos(job_id);
      CREATE INDEX IF NOT EXISTS idx_videos_file_name ON videos(file_name);
    `);

    this.runTikTokHardeningMigrations();
    this.revertTikTokDraftDefaultMigration();
    this.migrateLegacyMechanicalQueueToMotivation();
  }

  private runTikTokHardeningMigrations(): void {
    this.runInTransaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tiktok_upload_archive (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id TEXT NOT NULL UNIQUE,
          publish_id TEXT NOT NULL,
          file_name_original TEXT NOT NULL,
          file_size_bytes INTEGER NOT NULL,
          uploaded_at TEXT NOT NULL,
          mode TEXT NOT NULL,
          privacy_level TEXT NOT NULL,
          thumbnail_file_name TEXT,
          archived_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tiktok_archive_video_id
          ON tiktok_upload_archive(video_id);
      `);

      this.ensureColumnExists('videos', 'thumbnail_file_name', 'TEXT');
      this.ensureColumnExists(
        'videos',
        'file_cleaned_up',
        'INTEGER NOT NULL DEFAULT 0',
      );
      this.setSetting('schema_migration_tiktok_v1', 'applied');
    });
  }

  private revertTikTokDraftDefaultMigration(): void {
    if (
      this.getSetting('tiktok_direct_post_default_v1', '') === 'applied' &&
      this.getSetting('tiktok_revert_draft_v1', '') !== 'applied'
    ) {
      this.runInTransaction(() => {
        this.setSetting('tiktok_default_mode', 'draft');
        this.setSetting('tiktok_revert_draft_v1', 'applied');
      });
    }
  }

  private migrateLegacyMechanicalQueueToMotivation(): void {
    if (this.getSetting('studio_theme_v2', '') === 'motivation') {
      return;
    }

    const motivationSlugs = new Set(MOTIVATION_TOPIC_CATALOG.map((t) => t.slug));
    this.runInTransaction(() => {
      const unstartedQueued = this.db
        .prepare(
          `SELECT id, schedule_date, topic_slug
           FROM production_jobs
           WHERE status = 'queued'
             AND current_stage_index = 0
             AND video_id IS NULL
             AND research_json IS NULL`,
        )
        .all() as Array<{ id: string; schedule_date: string; topic_slug: string }>;

      const toRemove = unstartedQueued.filter((row) => !motivationSlugs.has(row.topic_slug));
      for (const row of toRemove) {
        this.db.prepare('DELETE FROM production_jobs WHERE id = ?').run(row.id);
      }

      if (toRemove.length > 0) {
        this.db.exec(`
          DELETE FROM daily_schedules
          WHERE schedule_date NOT IN (SELECT DISTINCT schedule_date FROM production_jobs)
        `);
        this.appendLog(
          'manager',
          'info',
          `Mengganti ${toRemove.length} antrean topik mesin lama ke tema Video Motivasi (video yang sudah selesai tetap dipertahankan).`,
        );
      }

      this.setSetting('studio_theme_v2', 'motivation');
    });
  }

  private ensureColumnExists(table: string, column: string, definition: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name?: string;
    }>;
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  public runInTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure if already rolled back
      }
      throw err;
    }
  }

  public createBackup(tag: string = 'manual'): string {
    const backupsDir = path.join(this.storageRoot, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'backup';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupsDir, `yendra_studio_${safeTag}_${stamp}.sqlite`);
    const escapedPath = backupPath.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escapedPath}'`);
    return backupPath;
  }

  public close(): void {
    this.db.close();
  }

  public resolveConfinedPath(subDir: StorageSubDir, fileName: string): string {
    const baseDir = path.resolve(this.storageRoot, subDir);
    const safeName = path.basename(fileName);
    const resolved = path.resolve(baseDir, safeName);
    if (!resolved.startsWith(baseDir + path.sep)) {
      throw new Error('Invalid confined storage path.');
    }
    return resolved;
  }

  public getSetting(key: string, fallback: string): string {
    const row = this.db
      .prepare('SELECT value FROM studio_settings WHERE key = ?')
      .get(key) as { value?: string } | undefined;
    return typeof row?.value === 'string' ? row.value : fallback;
  }

  public setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO studio_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  public getAutoProduceEnabled(): boolean {
    return this.getSetting('auto_produce_enabled', 'false') === 'true';
  }

  public setAutoProduceEnabled(enabled: boolean): void {
    this.setSetting('auto_produce_enabled', enabled ? 'true' : 'false');
  }

  public getTikTokTokens(): StoredTikTokTokens | null {
    const raw = this.getSetting('tiktok_tokens_json', '');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredTikTokTokens>;
      if (!parsed.accessToken || !parsed.openId) return null;
      return {
        accessToken: String(parsed.accessToken),
        refreshToken: String(parsed.refreshToken ?? ''),
        expiresAtMs: Number(parsed.expiresAtMs ?? 0),
        refreshExpiresAtMs: Number(parsed.refreshExpiresAtMs ?? 0),
        scope: String(parsed.scope ?? ''),
        openId: String(parsed.openId),
      };
    } catch {
      return null;
    }
  }

  public setTikTokTokens(tokens: StoredTikTokTokens): void {
    this.setSetting('tiktok_tokens_json', JSON.stringify(tokens));
  }

  public getTikTokProfile(): StoredTikTokProfile | null {
    const raw = this.getSetting('tiktok_profile_json', '');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredTikTokProfile>;
      if (!parsed.openId) return null;
      return {
        openId: String(parsed.openId),
        username: typeof parsed.username === 'string' ? parsed.username : null,
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
        avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : null,
      };
    } catch {
      return null;
    }
  }

  public setTikTokProfile(profile: StoredTikTokProfile): void {
    this.setSetting('tiktok_profile_json', JSON.stringify(profile));
  }

  public clearTikTokConnection(): void {
    this.db
      .prepare(
        `DELETE FROM studio_settings WHERE key IN ('tiktok_tokens_json', 'tiktok_profile_json')`,
      )
      .run();
  }

  public getTikTokSettings(): StoredTikTokSettings {
    const autoUploadEnabled =
      this.getSetting('tiktok_auto_upload_enabled', 'false') === 'true';
    const rawMode = this.getSetting('tiktok_default_mode', 'draft');
    const defaultMode: TikTokPublishMode =
      rawMode === 'direct' ? 'direct' : 'draft';
    const rawPrivacy = this.getSetting('tiktok_default_privacy', 'SELF_ONLY');
    const validPrivacies = new Set<TikTokPrivacyLevel>([
      'SELF_ONLY',
      'MUTUAL_FOLLOW_FRIENDS',
      'FOLLOWER_OF_CREATOR',
      'PUBLIC_TO_EVERYONE',
    ]);
    const defaultPrivacy = validPrivacies.has(rawPrivacy as TikTokPrivacyLevel)
      ? (rawPrivacy as TikTokPrivacyLevel)
      : 'SELF_ONLY';
    return {
      autoUploadEnabled,
      defaultMode,
      defaultPrivacy,
    };
  }

  public setTikTokSettings(patch: Partial<StoredTikTokSettings>): StoredTikTokSettings {
    if (patch.autoUploadEnabled !== undefined) {
      this.setSetting(
        'tiktok_auto_upload_enabled',
        patch.autoUploadEnabled ? 'true' : 'false',
      );
    }
    if (patch.defaultMode === 'draft' || patch.defaultMode === 'direct') {
      this.setSetting('tiktok_default_mode', patch.defaultMode);
    }
    if (
      patch.defaultPrivacy === 'SELF_ONLY' ||
      patch.defaultPrivacy === 'MUTUAL_FOLLOW_FRIENDS' ||
      patch.defaultPrivacy === 'FOLLOWER_OF_CREATOR' ||
      patch.defaultPrivacy === 'PUBLIC_TO_EVERYONE'
    ) {
      this.setSetting('tiktok_default_privacy', patch.defaultPrivacy);
    }
    return this.getTikTokSettings();
  }

  public appendLog(
    agentId: string,
    level: 'info' | 'success' | 'error',
    message: string,
    jobId: string | null = null,
  ): void {
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO studio_logs (job_id, agent_id, level, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(jobId, agentId, level, message.slice(0, 500), nowIso);
  }

  public listLogs(limit: number = 60): StudioLogRow[] {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = this.db
      .prepare(
        `SELECT id, job_id, agent_id, level, message, created_at
         FROM studio_logs
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(safeLimit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: Number(r.id),
      jobId: typeof r.job_id === 'string' ? r.job_id : null,
      agentId: String(r.agent_id),
      level: (r.level as StudioLogRow['level']) ?? 'info',
      message: String(r.message),
      createdAt: String(r.created_at),
    }));
  }

  public resetInterruptedRunningJobs(): number {
    const inFlightStatuses = ['researching', 'scripting', 'designing', 'editing', 'qc'];
    const placeholders = inFlightStatuses.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT id, topic_title, current_stage_index, pending_video_file
         FROM production_jobs
         WHERE status IN (${placeholders})`,
      )
      .all(...inFlightStatuses) as Array<{
      id: string;
      topic_title: string;
      current_stage_index: number;
      pending_video_file: string | null;
    }>;

    if (rows.length === 0) return 0;

    const nowIso = new Date().toISOString();
    this.runInTransaction(() => {
      // Preserve current_stage_index, pending_video_file, and all stage checkpoints
      this.db
        .prepare(
          `UPDATE production_jobs
           SET status = 'queued', active_agent = NULL, updated_at = ?
           WHERE status IN (${placeholders})`,
        )
        .run(nowIso, ...inFlightStatuses);

      for (const row of rows) {
        const checkpointNote = row.pending_video_file
          ? ` (preserved Stage ${row.current_stage_index} & rendered MP4 "${row.pending_video_file}")`
          : ` (preserved Stage ${row.current_stage_index} checkpoints)`;
        this.appendLog(
          'manager',
          'info',
          `Safely re-queued interrupted task "${row.topic_title}" after server restart${checkpointNote}.`,
          row.id,
        );
      }
    });
    return rows.length;
  }

  public getUsedTopicSlugs(): string[] {
    const jobRows = this.db
      .prepare('SELECT DISTINCT topic_slug FROM production_jobs')
      .all() as Array<{ topic_slug: string }>;
    const videoRows = this.db
      .prepare('SELECT DISTINCT topic_slug FROM videos')
      .all() as Array<{ topic_slug: string }>;

    const set = new Set<string>();
    for (const r of jobRows) set.add(r.topic_slug);
    for (const r of videoRows) set.add(r.topic_slug);
    return Array.from(set);
  }

  public getScheduleForDate(scheduleDate: string): DailyScheduleRow | null {
    const row = this.db
      .prepare(
        `SELECT schedule_date, target_count, topic_slugs_json, created_at
         FROM daily_schedules
         WHERE schedule_date = ?`,
      )
      .get(scheduleDate) as Record<string, unknown> | undefined;

    if (!row) return null;
    let topicSlugs: string[] = [];
    try {
      topicSlugs = JSON.parse(String(row.topic_slugs_json));
    } catch {
      topicSlugs = [];
    }
    return {
      scheduleDate: String(row.schedule_date),
      targetCount: Number(row.target_count),
      topicSlugs,
      createdAt: String(row.created_at),
    };
  }

  public ensureScheduleForDate(
    scheduleDate: string = getJakartaDateString(),
  ): { schedule: DailyScheduleRow; createdJobs: ProductionJobRecord[] } {
    const existing = this.getScheduleForDate(scheduleDate);
    if (existing) {
      return { schedule: existing, createdJobs: [] };
    }

    const usedSlugs = this.getUsedTopicSlugs();
    const chosen = selectDailyTopics(usedSlugs, 3);
    const nowIso = new Date().toISOString();
    const slugs = chosen.map((t) => t.slug);

    this.db
      .prepare(
        `INSERT OR IGNORE INTO daily_schedules (schedule_date, target_count, topic_slugs_json, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(scheduleDate, 3, JSON.stringify(slugs), nowIso);

    const createdJobs: ProductionJobRecord[] = [];
    const insertJob = this.db.prepare(
      `INSERT OR IGNORE INTO production_jobs (
        id, schedule_date, topic_slug, topic_title, category, angle,
        status, current_stage_index, active_agent, attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, NULL, 0, ?, ?)`,
    );

    for (let i = 0; i < chosen.length; i += 1) {
      const topic = chosen[i];
      const jobId = `job_${scheduleDate.replace(/-/g, '')}_${i + 1}_${topic.slug.slice(0, 24)}`;
      const res = insertJob.run(
        jobId,
        scheduleDate,
        topic.slug,
        topic.title,
        topic.category,
        topic.angle,
        nowIso,
        nowIso,
      );
      if (Number(res.changes) > 0) {
        const job = this.getJobById(jobId);
        if (job) createdJobs.push(job);
      }
    }

    if (createdJobs.length > 0) {
      this.appendLog(
        'manager',
        'info',
        `Scheduled ${createdJobs.length} daily motivational video topics for ${scheduleDate} (Asia/Jakarta).`,
      );
    }

    const schedule = this.getScheduleForDate(scheduleDate) ?? {
      scheduleDate,
      targetCount: 3,
      topicSlugs: slugs,
      createdAt: nowIso,
    };

    return { schedule, createdJobs };
  }

  public enqueueJob(input: {
    scheduleDate?: string;
    topicSlug?: string;
    topicTitle: string;
    category?: string;
    angle?: string;
  }): ProductionJobRecord {
    const scheduleDate = input.scheduleDate ?? getJakartaDateString();
    const cleanTitle = input.topicTitle.trim().slice(0, 140);
    if (!cleanTitle) {
      throw new Error('Topic title is required.');
    }

    const catalogMatch = input.topicSlug
      ? MOTIVATION_TOPIC_CATALOG.find((t) => t.slug === input.topicSlug)
      : undefined;

    const rawSlug =
      catalogMatch?.slug ??
      (input.topicSlug?.trim() ||
        cleanTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 48)) ??
      `custom-${Date.now()}`;

    const duplicate = this.db
      .prepare(
        `SELECT id FROM production_jobs WHERE schedule_date = ? AND topic_slug = ?`,
      )
      .get(scheduleDate, rawSlug) as { id?: string } | undefined;

    if (duplicate?.id) {
      throw new Error(
        `Topic "${cleanTitle}" is already scheduled for ${scheduleDate} (prevents duplicate video generation).`,
      );
    }

    const nowIso = new Date().toISOString();
    const jobId = `job_${scheduleDate.replace(/-/g, '')}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    this.db
      .prepare(
        `INSERT INTO production_jobs (
          id, schedule_date, topic_slug, topic_title, category, angle,
          status, current_stage_index, active_agent, attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, NULL, 0, ?, ?)`,
      )
      .run(
        jobId,
        scheduleDate,
        rawSlug,
        catalogMatch?.title ?? cleanTitle,
        (input.category?.trim() || catalogMatch?.category || 'Motivasi & Pengembangan Diri').slice(0, 80),
        (
          input.angle?.trim() ||
          catalogMatch?.angle ||
          `Pesan motivasi reflektif, sudut pandang menguatkan, dan langkah aksi nyata tentang ${cleanTitle}.`
        ).slice(0, 320),
        nowIso,
        nowIso,
      );

    this.appendLog(
      'manager',
      'info',
      `Queued new production job "${cleanTitle}" for ${scheduleDate}.`,
      jobId,
    );

    const created = this.getJobById(jobId);
    if (!created) throw new Error('Failed to retrieve newly created job.');
    return created;
  }

  public getJobById(id: string): ProductionJobRecord | null {
    if (!isValidResourceId(id)) return null;
    const row = this.db
      .prepare('SELECT * FROM production_jobs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapJobRow(row) : null;
  }

  public listJobs(limit: number = 50): ProductionJobRecord[] {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = this.db
      .prepare(
        `SELECT * FROM production_jobs
         ORDER BY schedule_date DESC, created_at ASC
         LIMIT ?`,
      )
      .all(safeLimit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapJobRow(r));
  }

  public getNextQueuedJob(): ProductionJobRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM production_jobs
         WHERE status = 'queued'
         ORDER BY schedule_date ASC, created_at ASC
         LIMIT 1`,
      )
      .get() as Record<string, unknown> | undefined;
    return row ? this.mapJobRow(row) : null;
  }

  public updateJob(
    id: string,
    patch: Partial<{
      status: StudioJobStatus;
      currentStageIndex: number;
      activeAgent: StudioActiveAgent;
      researchJson: string | null;
      scriptJson: string | null;
      assetPathsJson: string | null;
      audioPath: string | null;
      subtitlePath: string | null;
      videoId: string | null;
      pendingVideoFile: string | null;
      aiQcStatus: AiQcStatus;
      errorMessage: string | null;
      attempts: number;
      startedAt: string | null;
      completedAt: string | null;
    }>,
  ): ProductionJobRecord | null {
    const sets: string[] = ['updated_at = ?'];
    const params: Array<string | number | null> = [new Date().toISOString()];

    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.currentStageIndex !== undefined) {
      sets.push('current_stage_index = ?');
      params.push(patch.currentStageIndex);
    }
    if (patch.activeAgent !== undefined) {
      sets.push('active_agent = ?');
      params.push(patch.activeAgent);
    }
    if (patch.researchJson !== undefined) {
      sets.push('research_json = ?');
      params.push(patch.researchJson);
    }
    if (patch.scriptJson !== undefined) {
      sets.push('script_json = ?');
      params.push(patch.scriptJson);
    }
    if (patch.assetPathsJson !== undefined) {
      sets.push('asset_paths_json = ?');
      params.push(patch.assetPathsJson);
    }
    if (patch.audioPath !== undefined) {
      sets.push('audio_path = ?');
      params.push(patch.audioPath);
    }
    if (patch.subtitlePath !== undefined) {
      sets.push('subtitle_path = ?');
      params.push(patch.subtitlePath);
    }
    if (patch.videoId !== undefined) {
      sets.push('video_id = ?');
      params.push(patch.videoId);
    }
    if (patch.pendingVideoFile !== undefined) {
      sets.push('pending_video_file = ?');
      params.push(patch.pendingVideoFile);
    }
    if (patch.aiQcStatus !== undefined) {
      sets.push('ai_qc_status = ?');
      params.push(patch.aiQcStatus);
    }
    if (patch.errorMessage !== undefined) {
      sets.push('error_message = ?');
      params.push(patch.errorMessage);
    }
    if (patch.attempts !== undefined) {
      sets.push('attempts = ?');
      params.push(patch.attempts);
    }
    if (patch.startedAt !== undefined) {
      sets.push('started_at = ?');
      params.push(patch.startedAt);
    }
    if (patch.completedAt !== undefined) {
      sets.push('completed_at = ?');
      params.push(patch.completedAt);
    }

    params.push(id);
    this.db
      .prepare(`UPDATE production_jobs SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params);

    return this.getJobById(id);
  }

  public insertVideo(video: ProducedVideoRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO videos (
          id, job_id, schedule_date, topic_slug, title, description, caption,
          hashtags_json, hook_text, ending_text, script_text, subtitles_srt,
          research_summary, research_references_json, file_name, file_size_bytes,
          width, height, duration_seconds, qc_passed, ai_qc_status, qc_notes,
          tiktok_status, tiktok_publish_id, tiktok_mode, tiktok_error, tiktok_uploaded_at,
          thumbnail_file_name, file_cleaned_up, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        video.id,
        video.jobId,
        video.scheduleDate,
        video.topicSlug,
        video.title,
        video.description,
        video.caption,
        JSON.stringify(video.hashtags),
        video.hookText,
        video.endingText,
        video.scriptText,
        video.subtitlesSrt,
        video.researchSummary,
        JSON.stringify(video.researchReferences),
        video.fileName,
        video.fileSizeBytes,
        video.width,
        video.height,
        video.durationSeconds,
        video.qcPassed ? 1 : 0,
        video.aiQcStatus ?? 'passed',
        video.qcNotes,
        video.tiktokStatus ?? 'none',
        video.tiktokPublishId ?? null,
        video.tiktokMode ?? null,
        video.tiktokError ?? null,
        video.tiktokUploadedAt ?? null,
        video.thumbnailFileName ?? null,
        video.fileCleanedUp ? 1 : 0,
        video.createdAt,
      );
  }

  public getTikTokArchiveByVideoId(videoId: string): TikTokUploadArchiveRecord | null {
    if (!isValidResourceId(videoId)) return null;
    const row = this.db
      .prepare('SELECT * FROM tiktok_upload_archive WHERE video_id = ? LIMIT 1')
      .get(videoId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      videoId: String(row.video_id),
      publishId: String(row.publish_id),
      fileNameOriginal: String(row.file_name_original),
      fileSizeBytes: Number(row.file_size_bytes),
      uploadedAt: String(row.uploaded_at),
      mode: row.mode === 'direct' ? 'direct' : 'draft',
      privacyLevel: String(row.privacy_level) as TikTokPrivacyLevel,
      thumbnailFileName:
        typeof row.thumbnail_file_name === 'string'
          ? row.thumbnail_file_name
          : null,
      archivedAt: String(row.archived_at),
    };
  }

  public listTikTokArchives(limit: number = 100): TikTokUploadArchiveRecord[] {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = this.db
      .prepare('SELECT * FROM tiktok_upload_archive ORDER BY archived_at DESC LIMIT ?')
      .all(safeLimit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      videoId: String(row.video_id),
      publishId: String(row.publish_id),
      fileNameOriginal: String(row.file_name_original),
      fileSizeBytes: Number(row.file_size_bytes),
      uploadedAt: String(row.uploaded_at),
      mode: row.mode === 'direct' ? 'direct' : 'draft',
      privacyLevel: String(row.privacy_level) as TikTokPrivacyLevel,
      thumbnailFileName:
        typeof row.thumbnail_file_name === 'string'
          ? row.thumbnail_file_name
          : null,
      archivedAt: String(row.archived_at),
    }));
  }

  public countTikTokArchives(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM tiktok_upload_archive')
      .get() as { cnt: number };
    return Number(row?.cnt ?? 0);
  }

  public async cleanupUploadedVideo(
    videoId: string,
    options?: {
      minAgeAfterUploadMs?: number;
      nowMs?: number;
      thumbnailGenerator?: (mp4Path: string, thumbPath: string) => Promise<void>;
    },
  ): Promise<{
    cleaned: boolean;
    freedBytes: number;
    thumbnailFileName: string | null;
    reason?: string;
  }> {
    const video = this.getVideoById(videoId);
    if (!video) {
      return {
        cleaned: false,
        freedBytes: 0,
        thumbnailFileName: null,
        reason: 'Video tidak ditemukan di database.',
      };
    }

    if (video.fileCleanedUp) {
      return {
        cleaned: false,
        freedBytes: 0,
        thumbnailFileName: video.thumbnailFileName ?? null,
        reason: 'File video ini sudah dibersihkan dan diarsipkan sebelumnya.',
      };
    }

    if (video.tiktokStatus === 'uploading') {
      return {
        cleaned: false,
        freedBytes: 0,
        thumbnailFileName: video.thumbnailFileName ?? null,
        reason: 'File tidak boleh dihapus karena masih dalam status mengunggah (uploading).',
      };
    }

    if (video.tiktokStatus === 'failed') {
      return {
        cleaned: false,
        freedBytes: 0,
        thumbnailFileName: video.thumbnailFileName ?? null,
        reason: 'File dipertahankan karena upload TikTok gagal (status failed).',
      };
    }

    if (video.tiktokStatus !== 'draft_sent' && video.tiktokStatus !== 'published') {
      return {
        cleaned: false,
        freedBytes: 0,
        thumbnailFileName: video.thumbnailFileName ?? null,
        reason: 'Video belum berhasil diunggah ke TikTok.',
      };
    }

    if (!video.tiktokPublishId) {
      return {
        cleaned: false,
        freedBytes: 0,
        thumbnailFileName: video.thumbnailFileName ?? null,
        reason: 'ID publikasi TikTok (tiktokPublishId) tidak tersedia.',
      };
    }

    if (video.tiktokError !== null && video.tiktokError !== '') {
      return {
        cleaned: false,
        freedBytes: 0,
        thumbnailFileName: video.thumbnailFileName ?? null,
        reason: 'File dipertahankan karena masih tercatat error upload TikTok.',
      };
    }

    const uploadedAtMs = video.tiktokUploadedAt
      ? Date.parse(video.tiktokUploadedAt)
      : NaN;
    const now = options?.nowMs ?? Date.now();
    const minAgeMs = options?.minAgeAfterUploadMs ?? 60_000;
    if (!Number.isFinite(uploadedAtMs) || now - uploadedAtMs <= minAgeMs) {
      const waitSec = Math.ceil(minAgeMs / 1000);
      return {
        cleaned: false,
        freedBytes: 0,
        thumbnailFileName: video.thumbnailFileName ?? null,
        reason: `Menunggu jendela keamanan ${waitSec} detik setelah upload selesai sebelum membersihkan storage.`,
      };
    }

    const mp4Path = this.resolveConfinedPath('videos', video.fileName);
    if (!fs.existsSync(mp4Path)) {
      return {
        cleaned: false,
        freedBytes: 0,
        thumbnailFileName: video.thumbnailFileName ?? null,
        reason: 'File fisik MP4 sudah tidak berada di direktori storage.',
      };
    }

    const actualFileSize = fs.statSync(mp4Path).size || video.fileSizeBytes;
    const thumbFileName = `${video.id}.jpg`;
    const thumbPath = this.resolveConfinedPath('thumbnails', thumbFileName);

    if (options?.thumbnailGenerator) {
      await options.thumbnailGenerator(mp4Path, thumbPath);
    } else {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        mp4Path,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        thumbPath,
      ]);
    }

    if (!fs.existsSync(thumbPath) || fs.statSync(thumbPath).size === 0) {
      throw new Error(
        `Gagal membuat thumbnail JPG untuk video ${video.id}; file MP4 tetap dipertahankan.`,
      );
    }

    const settings = this.getTikTokSettings();
    const archivedAtIso = new Date(now).toISOString();
    const savedMb = (actualFileSize / (1024 * 1024)).toFixed(2);

    this.runInTransaction(() => {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO tiktok_upload_archive (
            video_id, publish_id, file_name_original, file_size_bytes,
            uploaded_at, mode, privacy_level, thumbnail_file_name, archived_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          video.id,
          video.tiktokPublishId!,
          video.fileName,
          actualFileSize,
          video.tiktokUploadedAt!,
          video.tiktokMode ?? settings.defaultMode,
          settings.defaultPrivacy,
          thumbFileName,
          archivedAtIso,
        );

      this.db
        .prepare(
          `UPDATE videos
           SET thumbnail_file_name = ?, file_cleaned_up = 1
           WHERE id = ?`,
        )
        .run(thumbFileName, video.id);

      this.appendLog(
        'storage',
        'info',
        `Video ${video.id} dihapus dari storage setelah upload berhasil. Hemat: ${savedMb} MB`,
        video.jobId,
      );
    });

    fs.unlinkSync(mp4Path);

    return {
      cleaned: true,
      freedBytes: actualFileSize,
      thumbnailFileName: thumbFileName,
    };
  }

  public updateVideoTikTokStatus(
    videoId: string,
    patch: {
      tiktokStatus: TikTokUploadStatus;
      tiktokPublishId?: string | null;
      tiktokMode?: TikTokPublishMode | null;
      tiktokError?: string | null;
      tiktokUploadedAt?: string | null;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE videos
         SET tiktok_status = ?,
             tiktok_publish_id = ?,
             tiktok_mode = ?,
             tiktok_error = ?,
             tiktok_uploaded_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.tiktokStatus,
        patch.tiktokPublishId ?? null,
        patch.tiktokMode ?? null,
        patch.tiktokError ?? null,
        patch.tiktokUploadedAt ?? null,
        videoId,
      );
  }

  public updateVideoQc(
    videoId: string,
    qc: {
      qcPassed: boolean;
      aiQcStatus: Exclude<AiQcStatus, 'none'>;
      qcNotes: string;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE videos SET qc_passed = ?, ai_qc_status = ?, qc_notes = ? WHERE id = ?`,
      )
      .run(qc.qcPassed ? 1 : 0, qc.aiQcStatus, qc.qcNotes, videoId);
  }

  public getVideoById(id: string): ProducedVideoRecord | null {
    if (!isValidResourceId(id)) return null;
    const row = this.db
      .prepare('SELECT * FROM videos WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapVideoRow(row) : null;
  }

  public getVideoByJobId(jobId: string): ProducedVideoRecord | null {
    if (!isValidResourceId(jobId)) return null;
    const row = this.db
      .prepare('SELECT * FROM videos WHERE job_id = ? LIMIT 1')
      .get(jobId) as Record<string, unknown> | undefined;
    return row ? this.mapVideoRow(row) : null;
  }

  public getVideoByFileName(fileName: string): ProducedVideoRecord | null {
    const base = path.basename(fileName);
    const row = this.db
      .prepare('SELECT * FROM videos WHERE file_name = ? LIMIT 1')
      .get(base) as Record<string, unknown> | undefined;
    return row ? this.mapVideoRow(row) : null;
  }

  public listVideos(limit: number = 100): ProducedVideoRecord[] {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = this.db
      .prepare('SELECT * FROM videos ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapVideoRow(r));
  }

  public deleteVideo(id: string): boolean {
    const video = this.getVideoById(id);
    if (!video) return false;

    try {
      const filePath = this.resolveConfinedPath('videos', video.fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // File might already be absent; continue deleting metadata
    }

    this.db.prepare('DELETE FROM videos WHERE id = ?').run(id);
    this.db
      .prepare('UPDATE production_jobs SET video_id = NULL WHERE video_id = ?')
      .run(id);
    this.appendLog('manager', 'info', `Deleted video "${video.title}" (${id}) from library.`, video.jobId);
    return true;
  }

  public getDashboardMetrics(todayJakarta: string = getJakartaDateString()): StudioDashboardMetrics {
    const completedTodayRow = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM videos WHERE schedule_date = ? AND qc_passed = 1`,
      )
      .get(todayJakarta) as { cnt: number };

    const totalProducedRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM videos WHERE qc_passed = 1`)
      .get() as { cnt: number };

    const editingRow = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM production_jobs WHERE status IN ('researching', 'scripting', 'designing', 'editing')`,
      )
      .get() as { cnt: number };

    const waitingReviewRow = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM production_jobs WHERE status IN ('qc', 'waiting_review')`,
      )
      .get() as { cnt: number };

    const failedRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM production_jobs WHERE status = 'failed'`)
      .get() as { cnt: number };

    const queuedTodayRow = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM production_jobs WHERE schedule_date = ? AND status = 'queued'`,
      )
      .get(todayJakarta) as { cnt: number };

    return {
      dailyTarget: 3,
      completedToday: Number(completedTodayRow?.cnt ?? 0),
      currentlyEditing: Number(editingRow?.cnt ?? 0),
      waitingReview: Number(waitingReviewRow?.cnt ?? 0),
      failedTasks: Number(failedRow?.cnt ?? 0),
      totalProduced: Number(totalProducedRow?.cnt ?? 0),
      queuedToday: Number(queuedTodayRow?.cnt ?? 0),
    };
  }

  private mapJobRow(r: Record<string, unknown>): ProductionJobRecord {
    return {
      id: String(r.id),
      scheduleDate: String(r.schedule_date),
      topicSlug: String(r.topic_slug),
      topicTitle: String(r.topic_title),
      category: String(r.category),
      angle: String(r.angle),
      status: r.status as StudioJobStatus,
      currentStageIndex: Number(r.current_stage_index ?? 0),
      activeAgent: (typeof r.active_agent === 'string' ? r.active_agent : null) as StudioActiveAgent,
      researchJson: typeof r.research_json === 'string' ? r.research_json : null,
      scriptJson: typeof r.script_json === 'string' ? r.script_json : null,
      assetPathsJson: typeof r.asset_paths_json === 'string' ? r.asset_paths_json : null,
      audioPath: typeof r.audio_path === 'string' ? r.audio_path : null,
      subtitlePath: typeof r.subtitle_path === 'string' ? r.subtitle_path : null,
      videoId: typeof r.video_id === 'string' ? r.video_id : null,
      pendingVideoFile:
        typeof r.pending_video_file === 'string' ? r.pending_video_file : null,
      aiQcStatus:
        (typeof r.ai_qc_status === 'string'
          ? r.ai_qc_status
          : 'none') as AiQcStatus,
      errorMessage: typeof r.error_message === 'string' ? r.error_message : null,
      attempts: Number(r.attempts ?? 0),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      startedAt: typeof r.started_at === 'string' ? r.started_at : null,
      completedAt: typeof r.completed_at === 'string' ? r.completed_at : null,
    };
  }

  private mapVideoRow(r: Record<string, unknown>): ProducedVideoRecord {
    let hashtags: string[] = [];
    let researchReferences: string[] = [];
    try {
      hashtags = JSON.parse(String(r.hashtags_json ?? '[]'));
    } catch {
      hashtags = [];
    }
    try {
      researchReferences = JSON.parse(String(r.research_references_json ?? '[]'));
    } catch {
      researchReferences = [];
    }

    return {
      id: String(r.id),
      jobId: String(r.job_id),
      scheduleDate: String(r.schedule_date),
      topicSlug: String(r.topic_slug),
      title: String(r.title),
      description: String(r.description),
      caption: String(r.caption),
      hashtags,
      hookText: String(r.hook_text),
      endingText: String(r.ending_text),
      scriptText: String(r.script_text),
      subtitlesSrt: String(r.subtitles_srt),
      researchSummary: String(r.research_summary),
      researchReferences,
      fileName: String(r.file_name),
      fileSizeBytes: Number(r.file_size_bytes),
      width: Number(r.width),
      height: Number(r.height),
      durationSeconds: Number(r.duration_seconds),
      qcPassed: Number(r.qc_passed) === 1,
      aiQcStatus:
        (typeof r.ai_qc_status === 'string'
          ? r.ai_qc_status
          : 'passed') as Exclude<AiQcStatus, 'none'>,
      qcNotes: String(r.qc_notes),
      tiktokStatus:
        (typeof r.tiktok_status === 'string'
          ? r.tiktok_status
          : 'none') as TikTokUploadStatus,
      tiktokPublishId:
        typeof r.tiktok_publish_id === 'string' ? r.tiktok_publish_id : null,
      tiktokMode:
        r.tiktok_mode === 'direct' || r.tiktok_mode === 'draft'
          ? r.tiktok_mode
          : null,
      tiktokError:
        typeof r.tiktok_error === 'string' ? r.tiktok_error : null,
      tiktokUploadedAt:
        typeof r.tiktok_uploaded_at === 'string' ? r.tiktok_uploaded_at : null,
      thumbnailFileName:
        typeof r.thumbnail_file_name === 'string' ? r.thumbnail_file_name : null,
      fileCleanedUp: Number(r.file_cleaned_up ?? 0) === 1,
      createdAt: String(r.created_at),
    };
  }
}
