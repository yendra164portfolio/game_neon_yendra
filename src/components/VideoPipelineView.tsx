import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Film,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatClockTime } from '../office/statusStyles';
import type {
  EmployeeProfile,
  VideoFormat,
  VideoProductionRun,
} from '../office/types';

interface VideoPipelineViewProps {
  employees: EmployeeProfile[];
  videoRuns: VideoProductionRun[];
  activeVideoRunId: string | null;
  onSelectRun: (runId: string) => void;
  onStartRun: (payload: {
    topic: string;
    format: VideoFormat;
    geminiAssisted: boolean;
    customArtifacts?: {
      researchNotes?: string;
      scriptText?: string;
      subtitlesSrt?: string;
      musicCue?: string;
    };
  }) => void;
  onApproveRun: (runId: string, notes: string) => void;
  onRequestRevision: (runId: string, notes: string) => void;
}

const PRESET_TOPICS = [
  'Autonomous AI Agents Inside a 3D Virtual Office',
  'Building Real-Time Production Pipelines with Laravel Reverb',
  'How AI Editors Assemble Multi-Track Timelines in Seconds',
];

export const VideoPipelineView: React.FC<VideoPipelineViewProps> = ({
  employees,
  videoRuns,
  activeVideoRunId,
  onSelectRun,
  onStartRun,
  onApproveRun,
  onRequestRevision,
}) => {
  const [topic, setTopic] = useState(PRESET_TOPICS[0]);
  const [format, setFormat] = useState<VideoFormat>('16:9 YouTube');
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiNotice, setGeminiNotice] = useState<string | null>(null);
  const [selectedStageNum, setSelectedStageNum] = useState(1);
  const [reviewNotes, setReviewNotes] = useState('');

  // Procedural Stage 8 Preview Player state
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewAudioOn, setPreviewAudioOn] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const activeRun =
    videoRuns.find((r) => r.id === activeVideoRunId) ?? videoRuns[0] ?? null;

  useEffect(() => {
    if (activeRun) {
      setSelectedStageNum(activeRun.currentStage);
    }
  }, [activeRun?.id, activeRun?.currentStage]);

  // Animated Canvas Video Preview for Stage 8 Review
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !activeRun) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = performance.now();

    const drawFrame = (tSec: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const sceneIdx = Math.floor(tSec / 4) % 4;
      const progress = (tSec % 16) / 16;

      // Studio gradient background per scene
      const palettes = [
        ['#0f172a', '#1e3a8a'],
        ['#0f172a', '#0f766e'],
        ['#18181b', '#4338ca'],
        ['#0f172a', '#047857'],
      ];
      const [c1, c2] = palettes[sceneIdx];
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle animated geometric wave lines
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 24) {
          const y = h * 0.48 + Math.sin(x * 0.015 + tSec * 2 + i) * (18 + i * 7);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Top corner studio stamp
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.fillRect(16, 16, 210, 28);
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`YENDRA STUDIO · ${activeRun.format}`, 26, 34);

      // Topic Headline (word-wrapped cleanly across max 2 lines)
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 20px sans-serif';
      const words = activeRun.topic.split(/\s+/);
      const lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > w - 48 && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      lines.slice(0, 2).forEach((ln, idx) => {
        ctx.fillText(ln, 24, h * 0.36 + idx * 28);
      });

      // Kinetic Subtitle Box at bottom
      const captions = [
        'Six specialized AI employees coordinate every stage live.',
        'Research & script beats aligned automatically to B-roll.',
        'Subtitles & -14 LUFS ambient score mastered for release.',
        'Ready for final review and multi-channel publishing.',
      ];
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.fillRect(24, h - 68, w - 48, 38);
      ctx.fillStyle = '#fef08a';
      ctx.font = '600 14px sans-serif';
      ctx.fillText(captions[sceneIdx], 38, h - 44);

      // Timeline scrubber bar
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(0, h - 6, w, 6);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(0, h - 6, w * progress, 6);
    };

    drawFrame(previewTime);

    if (!previewPlaying) return;

    const loop = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      setPreviewTime((prev) => {
        const next = (prev + dt) % 16;
        drawFrame(next);
        return next;
      });
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [activeRun, previewPlaying, previewTime]);

  // Optional gentle procedural ambient pad audio when previewAudioOn && previewPlaying
  useEffect(() => {
    if (!previewPlaying || !previewAudioOn) {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      return;
    }

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.value = 220;
      osc2.frequency.value = 330;
      gain.gain.value = 0.03;
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc2.start();
    } catch {
      // AudioContext blocked or unsupported
    }

    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [previewPlaying, previewAudioOn]);

  const handleLaunchDemoRun = () => {
    if (!topic.trim()) return;
    setGeminiNotice(null);
    onStartRun({
      topic: topic.trim(),
      format,
      geminiAssisted: false,
    });
  };

  const handleLaunchWithGemini = async () => {
    if (!topic.trim()) return;
    setGeminiLoading(true);
    setGeminiNotice(null);
    try {
      const res = await fetch('/api/gemini/generate-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), format }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGeminiNotice(
          data.error ||
            'Gemini API key not configured. You can run the full 8-stage workflow in Demo Simulation mode.',
        );
        return;
      }
      onStartRun({
        topic: topic.trim(),
        format,
        geminiAssisted: true,
        customArtifacts: data.artifacts,
      });
      setGeminiNotice(`Drafted live production brief via ${data.model}.`);
    } catch {
      setGeminiNotice('Unable to reach /api/gemini/generate-brief.');
    } finally {
      setGeminiLoading(false);
    }
  };

  const selectedStage =
    activeRun?.stages.find((s) => s.stageNumber === selectedStageNum) ??
    activeRun?.stages[0] ??
    null;

  const stageOwner = selectedStage
    ? employees.find((e) => e.id === selectedStage.assigneeId)
    : null;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header & New Video Production Run Launcher */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-50">
                Video Production Department
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Automated 8-step video creation pipeline synchronized live with the 3D AI office team.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {videoRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onSelectRun(run.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeRun?.id === run.id
                      ? 'border-blue-500 bg-blue-950/60 text-blue-200'
                      : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {run.topic.slice(0, 24)}
                  {run.topic.length > 24 ? '…' : ''} ({run.status})
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-12">
            <div className="md:col-span-6">
              <label
                htmlFor="video-topic-input"
                className="block text-xs font-medium text-slate-300"
              >
                Video Topic
              </label>
              <input
                id="video-topic-input"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter a video topic..."
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="video-format-select"
                className="block text-xs font-medium text-slate-300"
              >
                Output Format
              </label>
              <select
                id="video-format-select"
                value={format}
                onChange={(e) => setFormat(e.target.value as VideoFormat)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="16:9 YouTube">16:9 YouTube</option>
                <option value="9:16 Shorts">9:16 Shorts</option>
                <option value="LinkedIn Cut">LinkedIn Cut</option>
              </select>
            </div>

            <div className="flex items-end gap-2 md:col-span-4">
              <button
                type="button"
                onClick={handleLaunchDemoRun}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <Film className="h-3.5 w-3.5" />
                <span>Start Video Pipeline</span>
              </button>
              <button
                type="button"
                disabled={geminiLoading}
                onClick={handleLaunchWithGemini}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>{geminiLoading ? 'Drafting...' : 'Gemini Draft'}</span>
              </button>
            </div>
          </div>

          {geminiNotice && (
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
              {geminiNotice}
            </div>
          )}
        </div>

        {/* Active 8-Stage Pipeline Board */}
        {activeRun && (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* 8-Step Sequence List */}
            <section
              aria-label="8-Step Video Production Stages"
              className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-5"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-100">
                    8-Stage Production Workflow
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {activeRun.format} · {activeRun.status}
                    {activeRun.geminiAssisted ? ' · Gemini Assisted' : ' · Demo Simulation'}
                  </p>
                </div>
                <span className="font-mono-num text-xs font-semibold text-blue-400">
                  Step {activeRun.currentStage}/8
                </span>
              </div>

              <ol className="mt-3 space-y-2">
                {activeRun.stages.map((stage) => {
                  const owner = employees.find((e) => e.id === stage.assigneeId);
                  const isSelected = selectedStageNum === stage.stageNumber;
                  const statusTone =
                    stage.status === 'Completed'
                      ? 'text-emerald-400'
                      : stage.status === 'Active'
                        ? 'text-blue-400'
                        : stage.status === 'Error'
                          ? 'text-red-400'
                          : 'text-slate-500';

                  return (
                    <li key={stage.stageNumber}>
                      <button
                        type="button"
                        onClick={() => setSelectedStageNum(stage.stageNumber)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-slate-800/80'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-100">
                            {stage.stageNumber}. {stage.title}
                          </span>
                          <span className={`font-mono-num shrink-0 font-semibold ${statusTone}`}>
                            {stage.status === 'Active'
                              ? `${stage.progress}%`
                              : stage.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                          <span>{owner?.name ?? stage.assigneeId}</span>
                          {stage.completedAt && (
                            <span className="font-mono-num">
                              {formatClockTime(stage.completedAt)}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* Stage Deliverable Inspector + Stage 8 Review & Approval Studio */}
            <section className="space-y-6 lg:col-span-7">
              {selectedStage && (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-xs font-medium text-blue-400">
                        Stage {selectedStage.stageNumber} of 8 ·{' '}
                        {stageOwner?.name ?? selectedStage.assigneeId}
                      </span>
                      <h3 className="font-display mt-0.5 text-lg font-bold text-slate-50">
                        {selectedStage.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {selectedStage.description}
                      </p>
                    </div>
                    <span className="font-mono-num text-sm font-bold text-slate-200">
                      {selectedStage.progress}%
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-300">
                      {selectedStage.artifactTitle}
                    </div>
                    <pre className="font-mono-num mt-2 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3.5 text-xs leading-relaxed text-slate-300">
                      {selectedStage.artifactContent}
                    </pre>
                  </div>
                </div>
              )}

              {/* Stage 8 Video Preview & Human Review Gate */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-100">
                      Result Review & Approval Studio
                    </h3>
                    <p className="text-xs text-slate-400">
                      Preview assembled storyboard, kinetic subtitles, and studio audio mix before publishing.
                    </p>
                  </div>
                  <span className="font-mono-num text-xs font-semibold text-slate-300">
                    Status: {activeRun.status}
                  </span>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                  <canvas
                    ref={previewCanvasRef}
                    width={720}
                    height={320}
                    className="h-auto w-full"
                  />
                  <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewPlaying((p) => !p)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-slate-100 hover:bg-slate-700"
                      >
                        {previewPlaying ? (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            <span>Pause Preview</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            <span>Play Preview</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewAudioOn((a) => !a)}
                        aria-label="Toggle Background Music Preview"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        {previewAudioOn ? (
                          <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <VolumeX className="h-3.5 w-3.5" />
                        )}
                        <span>Music Mix</span>
                      </button>
                    </div>
                    <span className="font-mono-num text-xs text-slate-400">
                      {previewTime.toFixed(1)}s / 16.0s
                    </span>
                  </div>
                </div>

                {/* Approval Controls */}
                <div className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor="video-review-notes"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Reviewer Notes
                    </label>
                    <input
                      id="video-review-notes"
                      type="text"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Optional approval sign-off or revision feedback..."
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        onApproveRun(
                          activeRun.id,
                          reviewNotes.trim() || 'Approved for publishing.',
                        )
                      }
                      disabled={activeRun.status === 'Approved'}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        {activeRun.status === 'Approved'
                          ? 'Approved & Queued to Publish'
                          : 'Approve & Publish'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onRequestRevision(
                          activeRun.id,
                          reviewNotes.trim() || 'Adjust clip transitions and subtitle timing.',
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Request Revision (Re-cut)</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
