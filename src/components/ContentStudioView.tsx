import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Film,
  Link2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Subtitles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { MOTIVATION_TOPIC_CATALOG } from '../studio/topicCatalog';
import { startTikTokOAuthPopup } from '../studio/tiktokClient';
import type {
  ProducedVideoRecord,
  StudioDashboardPayload,
  TikTokPrivacyLevel,
  TikTokPublishMode,
} from '../studio/types';

interface ContentStudioViewProps {
  dashboard: StudioDashboardPayload | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onJumpToOffice: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ContentStudioView: React.FC<ContentStudioViewProps> = ({
  dashboard,
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
  const [customCategory, setCustomCategory] = useState('Motivasi & Pengembangan Diri');
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
        recovery?: {
          scannedFiles: number;
          recoveredVideos: string[];
          skippedDuplicates: string[];
        };
        result?: {
          updated: boolean;
          aiQcStatus: string;
          notes: string;
        };
        cleanup?: {
          cleanedCount: number;
          freedBytes: number;
          skipped: Array<{ videoId: string; reason: string }>;
          errors: Array<{ videoId: string; error: string }>;
          archivedCount: number;
        };
      };
      if (!res.ok) {
        setActionMessage({
          type: 'error',
          text: json.error || json.reason || `Permintaan gagal (${res.status}).`,
        });
      } else if (url.includes('/schedule/ensure')) {
        setActionMessage({
          type: 'info',
          text:
            json.createdCount && json.createdCount > 0
              ? `Menjadwalkan ${json.createdCount} topik baru untuk ${json.scheduleDate} (WIB).`
              : `Jadwal harian untuk ${json.scheduleDate} (WIB) sudah aktif.`,
        });
      } else if (url.includes('/recover')) {
        const recCount = json.recovery?.recoveredVideos.length ?? 0;
        const scanned = json.recovery?.scannedFiles ?? 0;
        setActionMessage({
          type: 'info',
          text:
            recCount > 0
              ? `Berhasil memulihkan ${recCount} video MP4 terverifikasi dari penyimpanan (${scanned} file dipindai).`
              : `Pemindaian penyimpanan selesai (${scanned} file MP4 dipindai; tidak ada video baru yang belum terdaftar).`,
        });
      } else if (url.includes('/ai-qc')) {
        setActionMessage({
          type: json.result?.aiQcStatus === 'rejected' ? 'error' : 'info',
          text:
            json.result?.aiQcStatus === 'passed'
              ? 'Kontrol Kualitas (Eko) terverifikasi dan lulus.'
              : json.result?.aiQcStatus === 'rejected'
                ? `Kontrol Kualitas (Eko) menolak video: ${json.result.notes}`
                : 'Verifikasi Kontrol Kualitas lanjutan masih tertunda; pemeriksaan FFprobe lokal tetap valid.',
        });
      } else if (url.includes('/cleanup-storage')) {
        const count = json.cleanup?.cleanedCount ?? 0;
        const freedMb = ((json.cleanup?.freedBytes ?? 0) / (1024 * 1024)).toFixed(2);
        const skippedCount = json.cleanup?.skipped.length ?? 0;
        setActionMessage({
          type: 'info',
          text:
            count > 0
              ? `Berhasil membersihkan ${count} file MP4 yang sudah terunggah ke TikTok (Hemat: ${freedMb} MB). Thumbnail & arsip tersimpan.`
              : `Tidak ada file MP4 yang memenuhi syarat pembersihan saat ini (${skippedCount} dilewati demi keamanan).`,
        });
      } else if (url.includes('/run-next') || url.includes('/retry') || url.includes('/rerender')) {
        setActionMessage({
          type: 'info',
          text: 'Tugas produksi dimulai di backend. Pantau avatar karyawan 3D & antrean secara langsung.',
        });
      }
      await onRefresh();
    } catch {
      setActionMessage({
        type: 'error',
        text: 'Gangguan jaringan saat menghubungi backend Studio Konten Yendra.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleEnqueueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const catalogTopic =
      selectedCatalogSlug !== 'custom'
        ? MOTIVATION_TOPIC_CATALOG.find((t) => t.slug === selectedCatalogSlug)
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
      setActionMessage({ type: 'error', text: 'Masukkan judul topik motivasi terlebih dahulu.' });
      return;
    }

    await postStudioAction('/api/studio/jobs', 'POST', payload, 'enqueue');
    setCustomTitle('');
    setCustomAngle('');
    setShowAddForm(false);
  };

  const handleConnectTikTok = async (scopeMode: 'full' | 'draft' = 'full') => {
    setBusyAction('tiktok-connect');
    setActionMessage(null);
    await startTikTokOAuthPopup({
      scopeMode,
      onSuccess: async (username) => {
        setActionMessage({
          type: 'info',
          text: username
            ? `Akun TikTok @${username} berhasil terhubung.`
            : 'Akun TikTok berhasil terhubung.',
        });
        setBusyAction(null);
        await onRefresh();
      },
      onError: (msg) => {
        setActionMessage({ type: 'error', text: msg });
        setBusyAction(null);
      },
    });
    setBusyAction((prev) => (prev === 'tiktok-connect' ? null : prev));
  };

  const handleTikTokSettingsChange = async (patch: {
    autoUploadEnabled?: boolean;
    defaultMode?: TikTokPublishMode;
    defaultPrivacy?: TikTokPrivacyLevel;
  }) => {
    await postStudioAction('/api/tiktok/settings', 'POST', patch, 'tiktok-settings');
  };

  const serviceStatus = dashboard?.serviceStatus;
  const metrics = dashboard?.metrics;
  const videos: ProducedVideoRecord[] = dashboard?.videos ?? [];
  const tiktok = dashboard?.tiktok;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header Bar */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold text-slate-50">
                STUDIO KONTEN
              </h1>
              <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono-num text-xs text-slate-300">
                WIB · {serviceStatus?.jakartaDate ?? '—'} ·{' '}
                {serviceStatus?.jakartaClock ?? '—'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Studio produksi video motivasi vertikal berbahasa Indonesia (9:16 · 1080×1920 · 30–60d) dengan target 3 video MP4 terverifikasi per hari.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onJumpToOffice}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Lihat Tim di Kantor 3D
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
              <span>Sinkronkan Jadwal Harian (3)</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tambah Topik</span>
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
              <span>{dashboard?.runningJobId ? 'Produksi Berjalan...' : 'Jalankan Tugas Berikutnya'}</span>
            </button>
          </div>
        </div>

        {/* Service & API Readiness Banner */}
        {serviceStatus && (
          <section
            aria-label="Status Konfigurasi Layanan"
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
                      ? 'Konfigurasi Diperlukan untuk Produksi Video Langsung'
                      : 'Seluruh Layanan Produksi & Render MP4 Siap'}
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
                      AI Naskah Motivasi ({serviceStatus.geminiModel}), Suara Bahasa Indonesia ({serviceStatus.ttsModel}), Renderer Visual ({serviceStatus.externalImageProvider}), FFmpeg 1080×1920 H.264/AAC, dan penyimpanan SQLite aktif.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300 sm:flex sm:items-center sm:gap-4">
                  <span>
                    Kunci Studio:{' '}
                    <strong
                      className={
                        serviceStatus.geminiConfigured ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {serviceStatus.geminiConfigured ? 'Siap' : 'Belum Diatur'}
                    </strong>
                  </span>
                  <span>
                    FFmpeg 1080×1920:{' '}
                    <strong
                      className={
                        serviceStatus.ffmpegAvailable ? 'text-emerald-400' : 'text-rose-400'
                      }
                    >
                      {serviceStatus.ffmpegAvailable ? 'Siap' : 'Tidak Tersedia'}
                    </strong>
                  </span>
                  <span>
                    Visual:{' '}
                    <strong className="text-slate-100">
                      {serviceStatus.externalImageProvider === 'openai'
                        ? 'OpenAI DALL-E 3'
                        : 'SVG Motivasi + Resvg PNG'}
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
                  <span>Jalankan Antrean Otomatis</span>
                </label>
              </div>
            </div>
          </section>
        )}

        {/* TikTok Auto-Publish Panel */}
        {tiktok && (
          <section
            aria-label="Publikasi Otomatis TikTok"
            className="rounded-xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-sm font-semibold text-slate-100">
                    Publikasi Otomatis TikTok (Riko)
                  </h2>
                  <span
                    className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                      tiktok.connected
                        ? 'border-emerald-700/60 bg-emerald-950/60 text-emerald-300'
                        : tiktok.configured
                          ? 'border-blue-700/60 bg-blue-950/60 text-blue-300'
                          : 'border-amber-700/60 bg-amber-950/60 text-amber-300'
                    }`}
                  >
                    {tiktok.connected
                      ? `Terhubung: ${tiktok.username ? `@${tiktok.username}` : tiktok.displayName || tiktok.openId}`
                      : tiktok.configured
                        ? 'Siap Dihubungkan'
                        : 'Kunci Developer Belum Diatur'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {tiktok.connected
                    ? 'Video motivasi yang lulus QC Eko dapat dikirim otomatis maupun manual oleh Riko ke Draft Inbox atau Direct Post akun TikTok Anda.'
                    : !tiktok.configured
                      ? `Atur ${tiktok.missingKeys.join(' dan ')} di Settings > Secrets serta daftarkan Redirect URI di TikTok for Developers agar koneksi akun aktif.`
                      : 'Hubungkan akun TikTok Anda melalui login resmi TikTok OAuth 2.0 untuk mengaktifkan auto-upload video motivasi.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {tiktok.connected ? (
                  <>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={tiktok.autoUploadEnabled}
                        disabled={busyAction !== null}
                        onChange={(e) =>
                          void handleTikTokSettingsChange({
                            autoUploadEnabled: e.target.checked,
                          })
                        }
                        className="h-3.5 w-3.5 accent-emerald-500"
                      />
                      <span>Auto-Upload Setelah QC</span>
                    </label>
                    <select
                      aria-label="Mode upload TikTok"
                      value={tiktok.defaultMode}
                      disabled={busyAction !== null}
                      onChange={(e) =>
                        void handleTikTokSettingsChange({
                          defaultMode: e.target.value as TikTokPublishMode,
                        })
                      }
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value="draft">Kirim ke Draft (Inbox TikTok)</option>
                      <option value="direct">Post Langsung (Direct Post)</option>
                    </select>
                    {tiktok.defaultMode === 'direct' && (
                      <select
                        aria-label="Privasi post TikTok"
                        value={tiktok.defaultPrivacy}
                        disabled={busyAction !== null}
                        onChange={(e) =>
                          void handleTikTokSettingsChange({
                            defaultPrivacy: e.target.value as TikTokPrivacyLevel,
                          })
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
                      >
                        <option value="SELF_ONLY">Hanya Saya (Sandbox/Privat)</option>
                        <option value="PUBLIC_TO_EVERYONE">Publik (Semua Orang)</option>
                        <option value="MUTUAL_FOLLOW_FRIENDS">Teman Saling Ikuti</option>
                        <option value="FOLLOWER_OF_CREATOR">Pengikut Saja</option>
                      </select>
                    )}
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void postStudioAction(
                          '/api/tiktok/cleanup-storage',
                          'POST',
                          undefined,
                          'tiktok-cleanup',
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Bersihkan Storage</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void postStudioAction(
                          '/api/tiktok/disconnect',
                          'POST',
                          undefined,
                          'tiktok-disconnect',
                        )
                      }
                      className="rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/50 disabled:opacity-50"
                    >
                      Putuskan Akun
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void postStudioAction(
                          '/api/tiktok/cleanup-storage',
                          'POST',
                          undefined,
                          'tiktok-cleanup',
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Bersihkan Storage</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void handleConnectTikTok('full')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-white disabled:opacity-50"
                    >
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Hubungkan Akun TikTok</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-400">
              <span>
                <span className="font-semibold text-slate-300">Jadwal Auto-Upload WIB:</span>{' '}
                <code className="font-mono-num text-emerald-300">
                  {(tiktok.scheduledHoursWib ?? ['09:00', '12:00', '18:00']).join(' · ')} WIB
                </code>
                {' · '}
                <span>Arsip terbersihkan: {tiktok.archivedCount ?? 0} video</span>
              </span>
              {!tiktok.connected && (
                <span>
                  <span className="font-semibold text-slate-300">Redirect URI:</span>{' '}
                  <code className="font-mono-num text-blue-300">{tiktok.callbackUrls.dev}</code>
                </span>
              )}
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
                Jadwalkan Topik Video Motivasi (Mencegah Duplikat Hari yang Sama)
              </h2>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-slate-200"
                aria-label="Tutup form topik"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="studio-catalog-select" className="block text-xs text-slate-300">
                  Preset Topik Motivasi atau Kustom
                </label>
                <select
                  id="studio-catalog-select"
                  value={selectedCatalogSlug}
                  onChange={(e) => setSelectedCatalogSlug(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="custom">Topik Motivasi Kustom...</option>
                  {MOTIVATION_TOPIC_CATALOG.map((t) => (
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
                      Kategori Motivasi
                    </label>
                    <input
                      id="studio-custom-cat"
                      type="text"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                      placeholder="Contoh: Disiplin, Ketangguhan, & Mindset"
                    />
                  </div>
                  <div>
                    <label htmlFor="studio-custom-title" className="block text-xs text-slate-300">
                      Judul Topik Motivasi (Bahasa Indonesia)
                    </label>
                    <input
                      id="studio-custom-title"
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                      placeholder="Contoh: Kekuatan Langkah Kecil Saat Hampir Menyerah"
                    />
                  </div>
                  <div>
                    <label htmlFor="studio-custom-angle" className="block text-xs text-slate-300">
                      Pesan Utama &amp; Sudut Pandang Motivasi
                    </label>
                    <input
                      id="studio-custom-angle"
                      type="text"
                      value={customAngle}
                      onChange={(e) => setCustomAngle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                      placeholder="Mengapa konsistensi 1% setiap hari mengalahkan semangat sesaat..."
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
                Batal
              </button>
              <button
                type="submit"
                disabled={busyAction !== null}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Masukkan ke Antrean
              </button>
            </div>
          </form>
        )}

        {/* 6 Production KPI Cards */}
        <section aria-label="Metrik Harian Studio Konten" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Target Harian</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-slate-50">
              {metrics?.dailyTarget ?? 3}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Video / hari (WIB)</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Selesai Hari Ini</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-emerald-400">
              {metrics?.completedToday ?? 0}
              <span className="text-sm font-normal text-slate-500"> / {metrics?.dailyTarget ?? 3}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">MP4 terverifikasi hari ini</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Sedang Dikerjakan</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-blue-400">
              {metrics?.currentlyEditing ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Tahap aktif 1–4</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Menunggu Tinjauan</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-amber-400">
              {metrics?.waitingReview ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Pemeriksaan Eko (QC)</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Tugas Gagal</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-rose-400">
              {metrics?.failedTasks ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Dapat diulang</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Total Diproduksi</div>
            <div className="font-mono-num mt-1 text-2xl font-bold text-slate-50">
              {metrics?.totalProduced ?? 0}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Total MP4 terverifikasi</div>
          </div>
        </section>

        {/* Video Library */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Pustaka Video (Output MP4 1080×1920 Terverifikasi)
              </h2>
              <p className="text-xs text-slate-400">
                Video terverifikasi FFprobe (1080×1920 H.264/AAC, 30–60d) tersedia di sini lengkap dengan unduhan MP4, naskah, SRT, dan status kontrol kualitas Eko.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void postStudioAction('/api/studio/recover', 'POST', undefined, 'recover')
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                <span>Pindai &amp; Pulihkan MP4</span>
              </button>
              <span className="font-mono-num text-xs text-slate-400">
                {videos.length} video tersimpan
              </span>
            </div>
          </div>

          {videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Film className="h-9 w-9 text-slate-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-300">
                Belum ada video MP4 selesai di penyimpanan permanen
              </p>
              <p className="mt-1 max-w-lg text-xs text-slate-500">
                Setelah topik motivasi menyelesaikan seluruh 5 tahap dan lolos kontrol kualitas Eko, pratinjau MP4 1080×1920, naskah Indonesia, subtitle, dan tombol unduh akan muncul di sini.
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
                      <p className="line-clamp-2">{video.caption}</p>
                      <p className="mt-1 font-mono-num text-[11px] text-blue-300">
                        {video.hashtags.join(' ')}
                      </p>
                    </div>

                    <div
                      className={`mt-2 flex items-center gap-1.5 text-[11px] ${
                        video.aiQcStatus === 'pending'
                          ? 'text-amber-300'
                          : video.aiQcStatus === 'rejected'
                            ? 'text-rose-300'
                            : 'text-emerald-300'
                      }`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="shrink-0 font-semibold">
                        {video.aiQcStatus === 'pending'
                          ? 'QC Pending ·'
                          : video.aiQcStatus === 'rejected'
                            ? 'QC Ditolak ·'
                            : 'QC Lulus ·'}
                      </span>
                      <span className="truncate">{video.qcNotes}</span>
                    </div>

                    {video.tiktokStatus && video.tiktokStatus !== 'none' && (
                      <div
                        className={`mt-1.5 rounded border px-2 py-1 text-[11px] ${
                          video.tiktokStatus === 'draft_sent' ||
                          video.tiktokStatus === 'published'
                            ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
                            : video.tiktokStatus === 'uploading'
                              ? 'border-blue-800/60 bg-blue-950/40 text-blue-300'
                              : 'border-rose-800/60 bg-rose-950/40 text-rose-300'
                        }`}
                      >
                        <div className="font-semibold">
                          {video.tiktokStatus === 'draft_sent'
                            ? 'TikTok: Masuk Draft (Inbox)'
                            : video.tiktokStatus === 'published'
                              ? 'TikTok: Terposting Langsung'
                              : video.tiktokStatus === 'uploading'
                                ? 'TikTok: Sedang Mengunggah...'
                                : 'TikTok: Gagal Upload'}
                        </div>
                        {video.tiktokError && (
                          <p className="mt-0.5 line-clamp-2 text-[10px] text-rose-200">
                            {video.tiktokError}
                          </p>
                        )}
                      </div>
                    )}
                    {video.fileCleanedUp && video.thumbnailFileName && (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                        <img
                          src={`/api/studio/videos/${video.id}/thumbnail`}
                          alt={`Thumbnail arsip ${video.title}`}
                          className="h-28 w-full object-cover"
                        />
                        <div className="px-2 py-1 text-[10px] font-medium text-slate-300">
                          MP4 Diarsipkan (Storage Dibersihkan)
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      {video.fileCleanedUp ? (
                        <span className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] font-semibold text-slate-400">
                          <span>MP4 Diarsipkan</span>
                        </span>
                      ) : (
                        <a
                          href={`/api/studio/videos/${video.id}/download`}
                          download
                          className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-bold tracking-wide text-white hover:bg-emerald-500"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>DOWNLOAD MP4</span>
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={
                          busyAction !== null ||
                          video.tiktokStatus === 'uploading' ||
                          Boolean(video.fileCleanedUp) ||
                          !tiktok?.connected
                        }
                        title={
                          video.fileCleanedUp
                            ? 'MP4 sudah dibersihkan setelah berhasil diunggah'
                            : tiktok?.connected
                              ? 'Unggah MP4 ini ke akun TikTok terhubung'
                              : 'Hubungkan akun TikTok terlebih dahulu'
                        }
                        onClick={() =>
                          void postStudioAction(
                            `/api/studio/videos/${video.id}/tiktok-upload`,
                            'POST',
                            {
                              mode: tiktok?.defaultMode ?? 'draft',
                              privacyLevel: tiktok?.defaultPrivacy ?? 'SELF_ONLY',
                            },
                            `tiktok-upload-${video.id}`,
                          )
                        }
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {video.tiktokStatus === 'uploading'
                            ? 'Mengunggah...'
                            : video.fileCleanedUp
                              ? 'Terarsip'
                              : (tiktok?.defaultMode ?? 'draft') === 'direct'
                                ? 'Post Langsung'
                                : 'Kirim Draft'}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewVideo(video)}
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <Play className="h-3 w-3" aria-hidden="true" />
                        <span>Pratinjau</span>
                      </button>
                      <a
                        href={`/api/studio/videos/${video.id}/text/script`}
                        download
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        <span>Naskah</span>
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

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-3">
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
                          <span>Render Ulang</span>
                        </button>
                        {video.aiQcStatus === 'pending' && (
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() =>
                              void postStudioAction(
                                `/api/studio/videos/${video.id}/ai-qc`,
                                'POST',
                                undefined,
                                `ai-qc-${video.id}`,
                              )
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 hover:text-amber-200 disabled:opacity-50"
                          >
                            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                            <span>Verifikasi QC</span>
                          </button>
                        )}
                      </div>

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
                            Konfirmasi Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[11px] text-slate-400 hover:text-slate-200"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(video.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>Hapus</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* In-Dashboard 9:16 Video Preview Dialog */}
      {previewVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Pratinjau ${previewVideo.title}`}
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
                aria-label="Tutup pratinjau video"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-12">
              <div className="flex flex-col items-center md:col-span-5">
                {previewVideo.fileCleanedUp && previewVideo.thumbnailFileName ? (
                  <img
                    src={`/api/studio/videos/${previewVideo.id}/thumbnail`}
                    alt={`Thumbnail arsip ${previewVideo.title}`}
                    className="aspect-[9/16] max-h-[65vh] w-full max-w-[320px] rounded-xl border border-slate-700 bg-black object-cover"
                  />
                ) : (
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    src={`/api/studio/videos/${previewVideo.id}/stream`}
                    className="aspect-[9/16] max-h-[65vh] w-full max-w-[320px] rounded-xl border border-slate-700 bg-black object-contain"
                  />
                )}
                {previewVideo.fileCleanedUp ? (
                  <span className="mt-3 flex w-full max-w-[320px] items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-400">
                    MP4 Diarsipkan (Storage Dibersihkan)
                  </span>
                ) : (
                  <a
                    href={`/api/studio/videos/${previewVideo.id}/download`}
                    download
                    className="mt-3 flex w-full max-w-[320px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>DOWNLOAD MP4</span>
                  </a>
                )}
              </div>

              <div className="space-y-3 text-xs text-slate-300 md:col-span-7">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="font-semibold text-blue-300">Hook Pembuka 3 Detik</div>
                  <p className="mt-1">{previewVideo.hookText}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="font-semibold text-slate-200">
                    Naskah Narasi Bahasa Indonesia
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap font-sans leading-relaxed text-slate-300">
                    {previewVideo.scriptText}
                  </pre>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="font-semibold text-slate-200">
                    Takarir Media Sosial &amp; Tagar
                  </div>
                  <p className="mt-1">{previewVideo.caption}</p>
                  <p className="mt-1 font-mono-num text-blue-300">
                    {previewVideo.hashtags.join(' ')}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="font-semibold text-slate-200">Catatan Riset Teknis Terverifikasi</div>
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
