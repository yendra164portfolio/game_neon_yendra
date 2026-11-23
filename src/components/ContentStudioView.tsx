import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Film,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Subtitles,
  Trash2,
  X,
} from 'lucide-react';
import { ENGINEERING_TOPIC_CATALOG } from '../studio/topicCatalog';
import type {
  ProducedVideoRecord,
  ProductionJobRecord,
  StudioDashboardPayload,
  StudioJobStatus,
} from '../studio/types';

interface ContentStudioViewProps {
  dashboard: StudioDashboardPayload | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onJumpToOffice: () => void;
}

const STAGE_META: Array<{ index: number; label: string; agentName: string }> = [
  { index: 1, label: 'Research', agentName: 'AI Researcher' },
  { index: 2, label: 'Script (ID)', agentName: 'AI Scriptwriter' },
  { index: 3, label: 'Diagrams', agentName: 'AI Visual Designer' },
  { index: 4, label: 'Render MP4', agentName: 'AI Video Editor' },
  { index: 5, label: 'Quality Control', agentName: 'AI Quality Control' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatStatusLabel(status: StudioJobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'researching':
      return '1 · AI Researcher';
    case 'scripting':
      return '2 · AI Scriptwriter';
    case 'designing':
      return '3 · AI Visual Designer';
    case 'editing':
      return '4 · AI Video Editor';
    case 'qc':
      return '5 · AI Quality Control';
    case 'waiting_review':
      return 'Waiting Review';
    case 'completed':
      return 'Completed (MP4 Verified)';
    case 'failed':
      return 'Failed';
  }
}

function statusBadgeStyle(status: StudioJobStatus): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-700/60 bg-emerald-950/60 text-emerald-300';
    case 'failed':
      return 'border-rose-700/60 bg-rose-950/60 text-rose-300';
    case 'queued':
      return 'border-slate-700 bg-slate-900 text-slate-300';
    case 'qc':
    case 'waiting_review':
      return 'border-amber-700/60 bg-amber-950/60 text-amber-300';
    default:
      return 'border-blue-700/60 bg-blue-950/60 text-blue-300';
  }
}

export const ContentStudioView: React.FC<ContentStudioViewProps> = ({
  dashboard,
  loading,
  onRefresh,
  onJumpToOffice,
}) => {
  const [actionMessage, setActionMessage] = useState<{
    type: 'info' | 'error';
    text: string;
  } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCatalogSlug, setSelectedCatalogSlug] = useState<string>('custom');
  const [customTitle, setCustomTitle] = useState('');
  const [customCategory, setCustomCategory] = useState('Mechanical & Everyday Tech');
  const [customAngle, setCustomAngle] = useState('');
  const [previewVideo, setPreviewVideo] = useState<ProducedVideoRecord | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const postStudioAction = async (
    url: string,
    method: 'POST' | 'DELETE',
    body?: unknown,
    actionKey: string = url,
  ) => {
    setBusyAction(actionKey);
    setActionMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
        started?: boolean;
        createdCount?: number;
        scheduleDate?: string;
      };
      if (!res.ok) {
        setActionMessage({
          type: 'error',
          text: json.error || json.reason || `Request failed (${res.status}).`,
        });
      } else if (url.includes('/schedule/ensure')) {
        setActionMessage({
          type: 'info',
          text:
            json.createdCount && json.createdCount > 0
              ? `Scheduled ${json.createdCount} new topics for ${json.scheduleDate} (Asia/Jakarta).`
              : `Daily schedule for ${json.scheduleDate} (Asia/Jakarta) is already active.`,
        });
      } else if (url.includes('/run-next') || url.includes('/retry') || url.includes('/rerender')) {
        setActionMessage({
          type: 'info',
          text: 'Production job started on backend. Watch 3D Office avatars & queue stages update live.',
        });
      }
      await onRefresh();
    } catch {
      setActionMessage({
        type: 'error',
        text: 'Network error communicating with Yendra AI Content Studio backend.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleEnqueueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const catalogTopic =
      selectedCatalogSlug !== 'custom'
        ? ENGINEERING_TOPIC_CATALOG.find((t) => t.slug === selectedCatalogSlug)
        : undefined;

    const payload = catalogTopic
      ? {
          topicSlug: catalogTopic.slug,
          topicTitle: catalogTopic.title,
          category: catalogTopic.category,
          angle: catalogTopic.angle,
        }
      : {
          topicTitle: customTitle.trim(),
          category: customCategory.trim(),
          angle: customAngle.trim(),
        };

    if (!payload.topicTitle) {
      setActionMessage({ type: 'error', text: 'Enter an engineering topic title first.' });
      return;
    }

    await postStudioAction('/api/studio/jobs', 'POST', payload, 'enqueue');
    setCustomTitle('');
    setCustomAngle('');
    setShowAddForm(false);
  };

  const serviceStatus = dashboard?.serviceStatus;
  const metrics = dashboard?.metrics;
  const jobs: ProductionJobRecord[] = dashboard?.jobs ?? [];
  const videos: ProducedVideoRecord[] = dashboard?.videos ?? [];
  const logs = dashboard?.logs ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header Bar */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold text-slate-50">
                AI CONTENT STUDIO
              </h1>
              <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono-num text-xs text-slate-300">
                Asia/Jakarta · {serviceStatus?.jakartaDate ?? '—'} ·{' '}
                {serviceStatus?.jakartaClock ?? '—'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Automated Indonesian short-form (9:16 · 1080×1920 · 30–60s) mechanical &amp; technology education studio targeting 3 verified MP4 videos per day.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onJumpToOffice}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Watch Crew in 3D Office
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void postStudioAction(
                  '/api/studio/schedule/ensure',
                  'POST',
                  undefined,
                  'ensure-schedule',
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sync Daily Schedule (3)</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Topic</span>
            </button>
            <button
              type="button"
              disabled={busyAction !== null || Boolean(dashboard?.runningJobId)}
              onClick={() =>
                void postStudioAction('/api/studio/jobs/run-next', 'POST', undefined, 'run-next')
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{dashboard?.runningJobId ? 'Pipeline Running...' : 'Run Next Queued Job'}</span>
            </button>
          </div>
        </div>

        {/* Service & API Readiness Banner */}
        {serviceStatus && (
          <section
            aria-label="Service Configuration Status"
            className={`rounded-xl border p-4 ${
              serviceStatus.missingConfigs.length > 0
                ? 'border-amber-700/60 bg-amber-950/30'
                : 'border-emerald-800/60 bg-emerald-950/20'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                {serviceStatus.missingConfigs.length > 0 ? (
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-100">
                    {serviceStatus.missingConfigs.length > 0
                      ? 'Configuration Required for Live AI Video Production'
                      : 'All AI Production & MP4 Rendering Services Ready'}
                  </h2>
                  {serviceStatus.missingConfigs.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-xs text-amber-200/90">
                      {serviceStatus.missingConfigs.map((item) => (
                        <li key={item.key}>
                          <span className="font-mono-num font-semibold">{item.key}</span>:{' '}
                          {item.reason}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-0.5 text-xs text-emerald-200/90">
                      Gemini ({serviceStatus.geminiModel}), Indonesian TTS ({serviceStatus.ttsModel}), Visual Renderer ({serviceStatus.externalImageProvider}), FFmpeg 1080×1920 H.264/AAC, and SQLite storage are operational.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300 sm:flex sm:items-center sm:gap-4">
                  <span>
                    Gemini API:{' '}
                    <strong
                      className={
                        serviceStatus.geminiConfigured ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {serviceStatus.geminiConfigured ? 'Configured' : 'Missing Key'}
                    </strong>
                  </span>
                  <span>
                    FFmpeg 1080×1920:{' '}
                    <strong
                      className={
                        serviceStatus.ffmpegAvailable ? 'text-emerald-400' : 'text-rose-400'
                      }
                    >
                      {serviceStatus.ffmpegAvailable ? 'Ready' : 'Unavailable'}
                    </strong>
                  </span>
                  <span>
                    Diagrams:{' '}
                    <strong className="text-slate-100">
                      {serviceStatus.externalImageProvider === 'openai'
                        ? 'OpenAI DALL-E 3'
                        : 'Gemini SVG + Resvg PNG'}
                    </strong>
                  </span>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={serviceStatus.autoProduceEnabled}
                    onChange={(e) =>
                      void postStudioAction(
                        '/api/studio/autoproduce',
                        'POST',
                        { enabled: e.target.checked },
                        'autoproduce',
                      )
                    }
                    className="h-3.5 w-3.5 accent-blue-500"
                  />
                  <span>Auto-Run Queue</span>
                </label>
              </div>
            </div>
          </section>
        )}

        {actionMessage && (
          <div
            role="status"
            className={`rounded-lg border px-4 py-2.5 text-xs ${
              actionMessage.type === 'error'
                ? 'border-rose-700/60 bg-rose-950/60 text-rose-200'
                : 'border-blue-700/60 bg-blue-950/60 text-blue-200'
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        {/* Add Custom Topic Panel */}
        {showAddForm && (
          <form
            onSubmit={handleEnqueueSubmit}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Schedule Engineering Video Topic (Preventing Same-Day Duplicates)
              </h2>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-slate-200"
                aria-label="Close topic form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="studio-catalog-select" className="block text-xs text-slate-300">
                  Engineering Niche Preset or Custom
                </label>
                <select
                  id="studio-catalog-select"
                  value={selectedCatalogSlug}
                  onChange={(e) => setSelectedCatalogSlug(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="custom">Custom Mechanical / Technology Topic...</option>
                  {ENGINEERING_TOPIC_CATALOG.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      [{t.category}] {t.title}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCatalogSlug === 'custom' && (
                <>
                  <div>
                    <label htmlFor="studio-custom-cat" className="block text-xs text-slate-300">
                      Engineering Category
                    </label>
                    <input
                      id="studio-custom-cat"
                      type="text"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                      placeholder="e.g., Car Engines & Mechanical Systems"
                    />
                  </div>
                  <div>
                    <label htmlFor="studio-custom-title" className="block text-xs text-slate-300">
                      Topic Title (Indonesian / Technical)
                    </label>
                    <input
                      id="studio-custom-title"
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                      placeholder="e.g., Cara Kerja Turbocharger Pada Mesin Diesel"
                    />
                  </div>
                  <div>
                    <label htmlFor="studio-custom-angle" className="block text-xs text-slate-300">
                      Technical Explanation Angle
                    </label>
                    <input
                      id="studio-custom-angle"
                      type="text"
                      value={customAngle}
                      onChange={(e) => setCustomAngle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                      placeholder="Turbin gas buang, kompresor udara, intercooler..."
                    />
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction !== null}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Enqueue Topic
              </button>
            </div>
          </form>
        )}

        {/* 6 Production KPI Cards */}
        <section aria-label="Daily Content Studio Metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Daily Target</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-slate-50">
              {metrics?.dailyTarget ?? 3}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Videos / day (WIB)</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Completed Today</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-emerald-400">
              {metrics?.completedToday ?? 0}
              <span className="text-sm font-normal text-slate-500"> / {metrics?.dailyTarget ?? 3}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Verified MP4s today</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Currently Editing</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-blue-400">
              {metrics?.currentlyEditing ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Active stage 1–4 jobs</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Waiting for Review</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-amber-400">
              {metrics?.waitingReview ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">In AI Quality Control</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Failed Tasks</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-rose-400">
              {metrics?.failedTasks ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Retryable errors</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Total Produced</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-slate-50">
              {metrics?.totalProduced ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Lifetime verified MP4s</div>
          </div>
        </section>

        {/* Daily Production Queue & 5-Employee Workflow */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Daily Production Schedule &amp; Task Queue
              </h2>
              <p className="text-xs text-slate-400">
                Real 5-employee pipeline: AI Researcher → AI Scriptwriter → AI Visual Designer → AI Video Editor → AI Quality Control.
              </p>
            </div>
            <span className="font-mono-num text-xs text-slate-400">
              {loading ? 'Refreshing...' : `${jobs.length} total job(s)`}
            </span>
          </div>

          {jobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No scheduled jobs yet. Click &ldquo;Sync Daily Schedule (3)&rdquo; to generate today&apos;s Asia/Jakarta engineering queue.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {jobs.map((job) => (
                <article
                  key={job.id}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-num text-xs text-slate-500">
                          {job.scheduleDate}
                        </span>
                        <span className="text-xs text-slate-500">·</span>
                        <span className="text-xs font-medium text-blue-300">
                          {job.category}
                        </span>
                        <span
                          className={`rounded border px-2 py-0.5 text-[11px] font-medium ${statusBadgeStyle(
                            job.status,
                          )}`}
                        >
                          {formatStatusLabel(job.status)}
                        </span>
                      </div>
                      <h3 className="mt-1 font-display text-sm font-semibold text-slate-100">
                        {job.topicTitle}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-400">{job.angle}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {(job.status === 'queued' || job.status === 'failed') && (
                        <button
                          type="button"
                          disabled={busyAction !== null || Boolean(dashboard?.runningJobId)}
                          onClick={() =>
                            void postStudioAction(
                              `/api/studio/jobs/${job.id}/retry`,
                              'POST',
                              undefined,
                              `retry-${job.id}`,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          {job.status === 'failed' ? (
                            <>
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Retry</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Run Job</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Discrete Real Stage Progress Steps (Never Fake Percentage Bars) */}
                  <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                    {STAGE_META.map((stage) => {
                      const isDone =
                        job.status === 'completed' || job.currentStageIndex > stage.index;
                      const isCurrent =
                        job.status !== 'completed' &&
                        job.status !== 'failed' &&
                        job.currentStageIndex === stage.index;
                      const isFailedHere =
                        job.status === 'failed' && job.currentStageIndex === stage.index;

                      let cellStyle = 'border-slate-800 bg-slate-900 text-slate-500';
                      if (isDone) {
                        cellStyle = 'border-emerald-800/70 bg-emerald-950/40 text-emerald-300';
                      } else if (isCurrent) {
                        cellStyle = 'border-blue-600/80 bg-blue-950/60 text-blue-200';
                      } else if (isFailedHere) {
                        cellStyle = 'border-rose-700/80 bg-rose-950/60 text-rose-300';
                      }

                      return (
                        <div
                          key={stage.index}
                          className={`rounded border px-2 py-1 text-[11px] ${cellStyle}`}
                        >
                          <div className="font-mono-num font-semibold">
                            {stage.index}. {stage.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {job.errorMessage && (
                    <div className="mt-2.5 rounded-md border border-rose-800/70 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
                      <strong>Error:</strong> {job.errorMessage}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-num text-[11px] text-slate-500">
                    <span>Attempts: {job.attempts}</span>
                    {job.startedAt && (
                      <span>Started: {new Date(job.startedAt).toLocaleTimeString()}</span>
                    )}
                    {job.completedAt && (
                      <span>Completed: {new Date(job.completedAt).toLocaleTimeString()}</span>
                    )}
                    {job.videoId && <span>Video ID: {job.videoId}</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Video Library */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Video Library (Verified 1080×1920 MP4 Outputs)
              </h2>
              <p className="text-xs text-slate-400">
                Only videos that passed Indonesian narration, 1080×1920 vertical FFprobe verification, and AI Quality Control appear here.
              </p>
            </div>
            <span className="font-mono-num text-xs text-slate-400">
              {videos.length} stored video(s)
            </span>
          </div>

          {videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Film className="h-9 w-9 text-slate-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-300">
                No completed MP4 videos in persistent storage yet
              </p>
              <p className="mt-1 max-w-lg text-xs text-slate-500">
                When a queued engineering topic completes all 5 stages and passes Quality Control, its real 1080×1920 MP4 preview, Indonesian script, subtitles, and prominent Download button will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {videos.map((video) => (
                <article
                  key={video.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 font-mono-num text-[11px] text-slate-400">
                      <span>{video.scheduleDate}</span>
                      <span>
                        {video.width}×{video.height} · {video.durationSeconds.toFixed(1)}s ·{' '}
                        {formatBytes(video.fileSizeBytes)}
                      </span>
                    </div>

                    <h3 className="mt-2 font-display text-base font-semibold text-slate-100">
                      {video.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                      {video.description}
                    </p>

                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-xs text-slate-300">
                      <div className="text-[11px] font-semibold text-blue-300">
                        Social Caption
                      </div>
                      <p className="mt-0.5 line-clamp-2">{video.caption}</p>
                      <p className="mt-1 font-mono-num text-[11px] text-slate-400">
                        {video.hashtags.join(' ')}
                      </p>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{video.qcNotes}</span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                    {/* Prominent DOWNLOAD MP4 button */}
                    <a
                      href={`/api/studio/videos/${video.id}/download`}
                      download
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold tracking-wide text-white hover:bg-emerald-500"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      <span>DOWNLOAD MP4</span>
                    </a>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewVideo(video)}
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <Play className="h-3 w-3" aria-hidden="true" />
                        <span>Preview</span>
                      </button>
                      <a
                        href={`/api/studio/videos/${video.id}/text/script`}
                        download
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        <span>Script</span>
                      </a>
                      <a
                        href={`/api/studio/videos/${video.id}/text/subtitles`}
                        download
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <Subtitles className="h-3 w-3" aria-hidden="true" />
                        <span>SRT</span>
                      </a>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyAction !== null || Boolean(dashboard?.runningJobId)}
                        onClick={() =>
                          void postStudioAction(
                            `/api/studio/videos/${video.id}/rerender`,
                            'POST',
                            undefined,
                            `rerender-${video.id}`,
                          )
                        }
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>Re-render</span>
                      </button>

                      {confirmDeleteId === video.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              void postStudioAction(
                                `/api/studio/videos/${video.id}`,
                                'DELETE',
                                undefined,
                                `delete-${video.id}`,
                              );
                            }}
                            className="rounded bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-rose-500"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[11px] text-slate-400 hover:text-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(video.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Production History Log */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Production History &amp; Execution Log
            </h2>
            <span className="inline-flex items-center gap-1 font-mono-num text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{logs.length} recent events</span>
            </span>
          </div>

          <div className="mt-3 max-h-60 space-y-1.5 overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">No production logs recorded yet.</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-baseline justify-between gap-3 rounded border border-slate-800/80 bg-slate-950 px-3 py-1.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono-num font-semibold text-slate-300">
                      [{log.agentId}]
                    </span>{' '}
                    <span
                      className={
                        log.level === 'error'
                          ? 'text-rose-300'
                          : log.level === 'success'
                            ? 'text-emerald-300'
                            : 'text-slate-300'
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono-num text-[11px] text-slate-500">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* In-Dashboard 9:16 Video Preview Dialog */}
      {previewVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewVideo.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-100">
                  {previewVideo.title}
                </h3>
                <p className="font-mono-num text-xs text-slate-400">
                  {previewVideo.width}×{previewVideo.height} ·{' '}
                  {previewVideo.durationSeconds.toFixed(1)}s · {previewVideo.scheduleDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                aria-label="Close video preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-12">
              <div className="flex flex-col items-center md:col-span-5">
                <video
                  controls
                  playsInline
                  preload="metadata"
                  src={`/api/studio/videos/${previewVideo.id}/stream`}
                  className="aspect-[9/16] max-h-[65vh] w-full max-w-[320px] rounded-xl border border-slate-700 bg-black object-contain"
                />
                <a
                  href={`/api/studio/videos/${previewVideo.id}/download`}
                  download
                  className="mt-3 flex w-full max-w-[320px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>DOWNLOAD MP4</span>
                </a>
              </div>

              <div className="space-y-3 text-xs text-slate-300 md:col-span-7">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="font-semibold text-blue-300">3s Opening Hook</div>
                  <p className="mt-1">{previewVideo.hookText}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="font-semibold text-slate-200">
                    Indonesian Narration Script
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap font-sans leading-relaxed text-slate-300">
                    {previewVideo.scriptText}
                  </pre>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="font-semibold text-slate-200">
                    Social Caption &amp; Hashtags
                  </div>
                  <p className="mt-1">{previewVideo.caption}</p>
                  <p className="mt-1 font-mono-num text-blue-300">
                    {previewVideo.hashtags.join(' ')}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="font-semibold text-slate-200">Verified Engineering Notes</div>
                  <p className="mt-1 text-slate-400">{previewVideo.researchSummary}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
