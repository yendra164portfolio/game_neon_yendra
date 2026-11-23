import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnalyticsView } from './components/AnalyticsView';
import { AssignTaskModal } from './components/AssignTaskModal';
import { ContentStudioView } from './components/ContentStudioView';
import { IntegrationsView } from './components/IntegrationsView';
import { OfficeViewport } from './components/OfficeViewport';
import { TaskManagerView } from './components/TaskManagerView';
import { TopNav, type WorkspaceTab } from './components/TopNav';
import { VideoPipelineView } from './components/VideoPipelineView';
import {
  applyExternalAgentEvent,
  approveVideoRun,
  assignTaskToAgent,
  cancelTask,
  computeDashboardMetrics,
  createInitialOfficeState,
  requestVideoRevision,
  retryFailedTask,
  startVideoProductionRun,
  stepOfficeSimulation,
  triggerAgentError,
} from './office/officeEngine';
import type {
  AgentId,
  ExternalAgentEvent,
  OfficeState,
  TaskPriority,
  VideoFormat,
} from './office/types';
import type { StudioDashboardPayload } from './studio/types';

export function App() {
  const [officeState, setOfficeState] = useState<OfficeState>(() =>
    createInitialOfficeState(Date.now()),
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('office');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<AgentId | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignDefaultAgent, setAssignDefaultAgent] = useState<AgentId>('researcher');
  const [wsConnected, setWsConnected] = useState(false);
  const [studioDashboard, setStudioDashboard] = useState<StudioDashboardPayload | null>(null);
  const [studioLoading, setStudioLoading] = useState(false);

  const refreshStudioDashboard = useCallback(async () => {
    setStudioLoading(true);
    try {
      const res = await fetch('/api/studio/dashboard');
      if (res.ok) {
        const data = (await res.json()) as StudioDashboardPayload;
        setStudioDashboard(data);
      }
    } catch {
      // Ignore transient network errors during reload
    } finally {
      setStudioLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStudioDashboard();
  }, [refreshStudioDashboard]);

  // Deterministic 1Hz simulation loop (never coupled to WebGL render loop)
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setOfficeState((prev) => stepOfficeSimulation(prev, 1, Date.now()));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Connect to /ws/office for Laravel Reverb & Studio live events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/office`;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      try {
        socket = new WebSocket(wsUrl);
        socket.onopen = () => setWsConnected(true);
        socket.onclose = () => {
          setWsConnected(false);
          if (!unmounted) {
            reconnectTimer = window.setTimeout(connect, 4000);
          }
        };
        socket.onerror = () => {
          setWsConnected(false);
        };
        socket.onmessage = (evt) => {
          try {
            const payload = JSON.parse(String(evt.data));
            if (
              payload &&
              (payload.event === 'App\\Events\\AgentTaskUpdated' ||
                payload.event === 'App\\Events\\AgentStatusChanged') &&
              payload.data?.agentId
            ) {
              setOfficeState((prev) =>
                applyExternalAgentEvent(prev, payload as ExternalAgentEvent, Date.now()),
              );
            } else if (
              payload &&
              (payload.event === 'App\\Events\\StudioUpdated' ||
                payload.event === 'App\\Events\\VideoReady')
            ) {
              void refreshStudioDashboard();
            }
          } catch {
            // Ignore malformed socket frames
          }
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();

    return () => {
      unmounted = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [refreshStudioDashboard]);

  const metrics = useMemo(() => computeDashboardMetrics(officeState), [officeState]);

  const handleOpenAssignModal = (agentId?: AgentId) => {
    if (agentId) setAssignDefaultAgent(agentId);
    setAssignModalOpen(true);
  };

  const handleAssignTask = (payload: {
    title: string;
    description: string;
    assigneeId: AgentId;
    priority: TaskPriority;
    estimatedSeconds: number;
  }) => {
    setOfficeState((prev) => assignTaskToAgent(prev, payload, Date.now()));
  };

  const handleTriggerError = (agentId: AgentId) => {
    setOfficeState((prev) =>
      triggerAgentError(
        prev,
        agentId,
        'Demo Error: Simulated worker interruption — click Retry to recover.',
        Date.now(),
      ),
    );
  };

  const handleRetryTask = (taskId: string) => {
    setOfficeState((prev) => retryFailedTask(prev, taskId, Date.now()));
  };

  const handleCancelTask = (taskId: string) => {
    setOfficeState((prev) => cancelTask(prev, taskId, Date.now()));
  };

  const handleInspectEmployee = (agentId: AgentId) => {
    setSelectedEmployeeId(agentId);
    setActiveTab('office');
  };

  const handleStartVideoRun = (payload: {
    topic: string;
    format: VideoFormat;
    geminiAssisted: boolean;
    customArtifacts?: {
      researchNotes?: string;
      scriptText?: string;
      subtitlesSrt?: string;
      musicCue?: string;
    };
  }) => {
    setOfficeState((prev) => startVideoProductionRun(prev, payload, Date.now()));
  };

  const handleApproveVideoRun = (runId: string, notes: string) => {
    setOfficeState((prev) => approveVideoRun(prev, runId, notes, Date.now()));
  };

  const handleRequestRevision = (runId: string, notes: string) => {
    setOfficeState((prev) => requestVideoRevision(prev, runId, notes, Date.now()));
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-slate-950 text-slate-100"
      data-active-tab={activeTab}
    >
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAssignModal={() => handleOpenAssignModal()}
        awaitingVideoReviewCount={metrics.awaitingVideoReview}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'office' && (
          <OfficeViewport
            employees={officeState.employees}
            tasks={officeState.tasks}
            activityLog={officeState.activityLog}
            metrics={metrics}
            selectedEmployeeId={selectedEmployeeId}
            simulationRunning={officeState.simulationRunning}
            simulationSpeed={officeState.simulationSpeed}
            modeLabel={officeState.modeLabel}
            onSelectEmployee={setSelectedEmployeeId}
            onToggleSimulation={() =>
              setOfficeState((prev) => ({
                ...prev,
                simulationRunning: !prev.simulationRunning,
              }))
            }
            onChangeSpeed={(speed) =>
              setOfficeState((prev) => ({ ...prev, simulationSpeed: speed }))
            }
            onOpenAssignForAgent={(agentId) => handleOpenAssignModal(agentId)}
            onTriggerError={handleTriggerError}
            onRetryTask={handleRetryTask}
            onResetDemo={() => {
              setSelectedEmployeeId(null);
              setOfficeState(createInitialOfficeState(Date.now()));
            }}
          />
        )}

        {activeTab === 'studio' && (
          <ContentStudioView
            dashboard={studioDashboard}
            loading={studioLoading}
            onRefresh={refreshStudioDashboard}
            onJumpToOffice={() => setActiveTab('office')}
          />
        )}

        {activeTab === 'tasks' && (
          <TaskManagerView
            employees={officeState.employees}
            tasks={officeState.tasks}
            activityLog={officeState.activityLog}
            onAssignTask={handleAssignTask}
            onRetryTask={handleRetryTask}
            onCancelTask={handleCancelTask}
            onInspectEmployee={handleInspectEmployee}
          />
        )}

        {activeTab === 'video' && (
          <VideoPipelineView
            employees={officeState.employees}
            videoRuns={officeState.videoRuns}
            activeVideoRunId={officeState.activeVideoRunId}
            onSelectRun={(runId) =>
              setOfficeState((prev) => ({ ...prev, activeVideoRunId: runId }))
            }
            onStartRun={handleStartVideoRun}
            onApproveRun={handleApproveVideoRun}
            onRequestRevision={handleRequestRevision}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            employees={officeState.employees}
            tasks={officeState.tasks}
            metrics={metrics}
            onInspectEmployee={handleInspectEmployee}
          />
        )}

        {activeTab === 'integrations' && (
          <IntegrationsView
            employees={officeState.employees}
            wsConnected={wsConnected}
            onJumpToOffice={() => setActiveTab('office')}
          />
        )}
      </main>

      <AssignTaskModal
        isOpen={assignModalOpen}
        employees={officeState.employees}
        defaultAssigneeId={assignDefaultAgent}
        onClose={() => setAssignModalOpen(false)}
        onSubmit={handleAssignTask}
      />
    </div>
  );
}

export default App;
