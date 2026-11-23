import React, { useEffect, useState } from 'react';
import { Check, Copy, Send } from 'lucide-react';
import {
  LARAVEL_CONTROLLER_PHP,
  LARAVEL_REVERB_EVENT_PHP,
  MYSQL_SCHEMA_SQL,
} from '../office/integrationBlueprints';
import type { AgentId, AgentStatus, EmployeeProfile } from '../office/types';

interface IntegrationsViewProps {
  employees: EmployeeProfile[];
  wsConnected: boolean;
  onJumpToOffice: () => void;
}

type BlueprintTab = 'mysql' | 'reverb_event' | 'laravel_controller';

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  employees,
  wsConnected,
  onJumpToOffice,
}) => {
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [blueprintTab, setBlueprintTab] = useState<BlueprintTab>('mysql');
  const [copied, setCopied] = useState(false);

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
            Backend Architecture & Event Integrations
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Ready-to-connect architecture for Gemini API, Laravel + Laravel Reverb WebSockets, and MySQL task persistence. Currently running in Demo Simulation mode unless external agents emit events.
          </p>
        </div>

        {/* Status Overview Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">Gemini API Connector</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              {geminiConfigured === null
                ? 'Checking server...'
                : geminiConfigured
                  ? 'Configured (gemini-4-hydrogen + TTS)'
                  : 'Missing GEMINI_API_KEY (Demo Simulation active)'}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Studio &amp; brief routes:{' '}
              <span className="font-mono-num">/api/studio/*, /api/gemini/generate-brief</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">Laravel Reverb Event Bus</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              {wsConnected ? 'WebSocket Connected (/ws/office)' : 'Connecting...'}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Channel: <span className="font-mono-num">yendra-office</span> · Event:{' '}
              <span className="font-mono-num">AgentTaskUpdated</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">MySQL Persistence Schema</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              4 Relational Tables Ready
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              <span className="font-mono-num">ai_employees, office_tasks, video_production_runs, activity_logs</span>
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Live WebSocket Event Simulator */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-5">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Live WebSocket Event Simulator
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Emits a real Laravel Reverb event payload to <span className="font-mono-num">/api/events/reverb</span>, which pushes live over WebSocket to update the 3D employee avatar.
            </p>

            <form onSubmit={handleSendTestEvent} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="evt-agent"
                  className="block text-xs font-medium text-slate-300"
                >
                  Target AI Employee
                </label>
                <select
                  id="evt-agent"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value as AgentId)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.id})
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
                    <option value="Working">Working</option>
                    <option value="Thinking">Thinking</option>
                    <option value="Idle">Idle</option>
                    <option value="Completed">Completed</option>
                    <option value="Error">Error</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="evt-progress"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Progress (%)
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
                  Activity Message
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
                  <span>Emit WebSocket Event</span>
                </button>
                <button
                  type="button"
                  onClick={onJumpToOffice}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  View in 3D
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
                  MySQL Schema
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
                  Laravel Reverb Event
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
                  Laravel API Controller
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
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Code</span>
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
