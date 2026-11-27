import React, { useEffect, useState } from 'react';
import { Check, Copy, Link2, Send } from 'lucide-react';
import {
  LARAVEL_CONTROLLER_PHP,
  LARAVEL_REVERB_EVENT_PHP,
  MYSQL_SCHEMA_SQL,
} from '../office/integrationBlueprints';
import type { AgentId, AgentStatus, EmployeeProfile } from '../office/types';
import { startTikTokOAuthPopup } from '../studio/tiktokClient';
import type { StudioDashboardPayload } from '../studio/types';

interface IntegrationsViewProps {
  employees: EmployeeProfile[];
  wsConnected: boolean;
  onJumpToOffice: () => void;
  dashboard?: StudioDashboardPayload | null;
  onRefresh?: () => Promise<void>;
}

type BlueprintTab = 'mysql' | 'reverb_event' | 'laravel_controller';

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  employees,
  wsConnected,
  onJumpToOffice,
  dashboard,
  onRefresh,
}) => {
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [blueprintTab, setBlueprintTab] = useState<BlueprintTab>('mysql');
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<'dev' | 'shared' | null>(null);
  const [tiktokNotice, setTikTokNotice] = useState<{
    type: 'info' | 'error';
    text: string;
  } | null>(null);
  const [tiktokBusy, setTikTokBusy] = useState(false);

  // Live Reverb Event Tester state
  const [agentId, setAgentId] = useState<AgentId>('video_editor');
  const [status, setStatus] = useState<AgentStatus>('Working');
  const [activity, setActivity] = useState(
    'Rendering 4K scene master from Laravel queue worker',
  );
  const [progress, setProgress] = useState(72);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setGeminiConfigured(Boolean(d.geminiConfigured)))
      .catch(() => setGeminiConfigured(false));
  }, []);

  const activeSnippet =
    blueprintTab === 'mysql'
      ? MYSQL_SCHEMA_SQL
      : blueprintTab === 'reverb_event'
        ? LARAVEL_REVERB_EVENT_PHP
        : LARAVEL_CONTROLLER_PHP;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleSendTestEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setDispatchResult(null);
    try {
      const res = await fetch('/api/events/reverb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'App\\Events\\AgentTaskUpdated',
          channel: 'yendra-office',
          data: {
            agentId,
            status,
            activity,
            progress,
            taskTitle: activity,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDispatchResult(json.error || 'Failed to dispatch event');
        return;
      }
      setDispatchResult(
        `Broadcasted AgentTaskUpdated over WebSocket (${json.broadcastedTo} client(s) notified).`,
      );
    } catch {
      setDispatchResult('Network error sending event to /api/events/reverb.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h1 className="font-display text-2xl font-bold text-slate-50">
            Arsitektur Backend &amp; Integrasi Event
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Arsitektur siap hubung untuk layanan produksi, WebSocket Laravel Reverb, dan skema MySQL. Berjalan dalam mode Simulasi Demo saat belum menerima event eksternal.
          </p>
        </div>

        {/* Status Overview Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">Konektor Mesin Studio</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              {geminiConfigured === null
                ? 'Memeriksa server...'
                : geminiConfigured
                  ? 'Terkonfigurasi (Naskah + Suara TTS)'
                  : 'Kunci API belum diatur (Mode Simulasi Demo)'}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Rute studio:{' '}
              <span className="font-mono-num">/api/studio/*, /api/gemini/generate-brief</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">Bus Event Laravel Reverb</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              {wsConnected ? 'WebSocket Terhubung (/ws/office)' : 'Menghubungkan...'}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Kanal: <span className="font-mono-num">yendra-office</span> · Event:{' '}
              <span className="font-mono-num">AgentTaskUpdated</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">Skema Persistensi MySQL</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              4 Tabel Relasional Siap
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              <span className="font-mono-num">ai_employees, office_tasks, video_production_runs, activity_logs</span>
            </p>
          </div>
        </div>

        {/* TikTok OAuth & Auto-Publish Integration */}
        {dashboard?.tiktok && (
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Integrasi TikTok OAuth 2.0 &amp; Content Posting API
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Menghubungkan akun TikTok Anda langsung melalui OAuth popup untuk auto-upload hasil video motivasi oleh Riko.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {dashboard.tiktok.connected ? (
                  <button
                    type="button"
                    disabled={tiktokBusy}
                    onClick={async () => {
                      setTikTokBusy(true);
                      setTikTokNotice(null);
                      try {
                        await fetch('/api/tiktok/disconnect', { method: 'POST' });
                        setTikTokNotice({
                          type: 'info',
                          text: 'Koneksi akun TikTok telah diputuskan.',
                        });
                        if (onRefresh) await onRefresh();
                      } finally {
                        setTikTokBusy(false);
                      }
                    }}
                    className="rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/50 disabled:opacity-50"
                  >
                    Putuskan Akun
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={tiktokBusy}
                    onClick={async () => {
                      setTikTokBusy(true);
                      setTikTokNotice(null);
                      await startTikTokOAuthPopup({
                        scopeMode: 'full',
                        onSuccess: async (username) => {
                          setTikTokNotice({
                            type: 'info',
                            text: username
                              ? `Terhubung dengan akun TikTok @${username}.`
                              : 'Akun TikTok berhasil terhubung.',
                          });
                          setTikTokBusy(false);
                          if (onRefresh) await onRefresh();
                        },
                        onError: (msg) => {
                          setTikTokNotice({ type: 'error', text: msg });
                          setTikTokBusy(false);
                        },
                      });
                      setTikTokBusy(false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-white disabled:opacity-50"
                  >
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Hubungkan Akun TikTok</span>
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 text-xs">
                <div className="text-slate-400">Status Kredensial &amp; Akun</div>
                <div className="mt-1 font-semibold text-slate-100">
                  {dashboard.tiktok.connected
                    ? `Terhubung (${dashboard.tiktok.username ? `@${dashboard.tiktok.username}` : dashboard.tiktok.displayName || dashboard.tiktok.openId})`
                    : dashboard.tiktok.configured
                      ? 'Secrets siap, menunggu login akun TikTok'
                      : `Belum diatur: ${dashboard.tiktok.missingKeys.join(', ')}`}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Simpan <code className="text-slate-300">TIKTOK_CLIENT_KEY</code> dan{' '}
                  <code className="text-slate-300">TIKTOK_CLIENT_SECRET</code> di{' '}
                  <strong className="text-slate-300">Settings &gt; Secrets</strong>. Token akses disimpan aman di SQLite server dan tidak pernah dikirim ke browser.
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-3.5 text-xs">
                <div className="text-slate-400">Redirect URI TikTok for Developers (Login Kit)</div>
                {(['dev', 'shared'] as const).map((kind) => {
                  const url = dashboard.tiktok.callbackUrls[kind];
                  return (
                    <div
                      key={kind}
                      className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">
                          {kind === 'dev' ? 'Development URL' : 'Shared App URL'}
                        </div>
                        <div className="truncate font-mono-num text-[11px] text-blue-300">
                          {url}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(url);
                            setCopiedUrl(kind);
                            setTimeout(() => setCopiedUrl(null), 1800);
                          } catch {
                            // Ignore clipboard restriction
                          }
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                      >
                        {copiedUrl === kind ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>{copiedUrl === kind ? 'Tersalin' : 'Salin'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {tiktokNotice && (
              <div
                role="status"
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  tiktokNotice.type === 'error'
                    ? 'border-rose-700/60 bg-rose-950/60 text-rose-200'
                    : 'border-emerald-700/60 bg-emerald-950/60 text-emerald-200'
                }`}
              >
                {tiktokNotice.text}
              </div>
            )}
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Live WebSocket Event Simulator */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-5">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Simulator Event WebSocket Langsung
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Mengirim payload event ke <span className="font-mono-num">/api/events/reverb</span> dan mendorong pembaruan langsung ke avatar karyawan 3D.
            </p>

            <form onSubmit={handleSendTestEvent} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="evt-agent"
                  className="block text-xs font-medium text-slate-300"
                >
                  Karyawan Target
                </label>
                <select
                  id="evt-agent"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value as AgentId)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="evt-status"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Status
                  </label>
                  <select
                    id="evt-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AgentStatus)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="Working">Bekerja</option>
                    <option value="Thinking">Berpikir</option>
                    <option value="Idle">Siaga</option>
                    <option value="Completed">Selesai</option>
                    <option value="Error">Error</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="evt-progress"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Progres (%)
                  </label>
                  <input
                    id="evt-progress"
                    type="number"
                    min={0}
                    max={100}
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value) || 0)}
                    className="font-mono-num mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="evt-activity"
                  className="block text-xs font-medium text-slate-300"
                >
                  Pesan Aktivitas
                </label>
                <input
                  id="evt-activity"
                  type="text"
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Kirim Event WebSocket</span>
                </button>
                <button
                  type="button"
                  onClick={onJumpToOffice}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Lihat di 3D
                </button>
              </div>

              {dispatchResult && (
                <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/40 p-2.5 text-xs text-emerald-200">
                  {dispatchResult}
                </div>
              )}
            </form>
          </section>

          {/* MySQL + Laravel Reverb Code Blueprints */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setBlueprintTab('mysql')}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    blueprintTab === 'mysql'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Skema MySQL
                </button>
                <button
                  type="button"
                  onClick={() => setBlueprintTab('reverb_event')}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    blueprintTab === 'reverb_event'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Event Laravel Reverb
                </button>
                <button
                  type="button"
                  onClick={() => setBlueprintTab('laravel_controller')}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    blueprintTab === 'laravel_controller'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Controller API Laravel
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Salin Kode</span>
                  </>
                )}
              </button>
            </div>

            <pre className="font-mono-num mt-4 max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
              {activeSnippet}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
};
