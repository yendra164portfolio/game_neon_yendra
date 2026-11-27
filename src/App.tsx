import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnalyticsView } from './components/AnalyticsView';
import { AssignTaskModal } from './components/AssignTaskModal';
import { ContentStudioView } from './components/ContentStudioView';
import { IntegrationsView } from './components/IntegrationsView';
import { OfficeViewport } from './components/OfficeViewport';
import { TopNav, type WorkspaceTab } from './components/TopNav';
import {
  applyExternalAgentEvent,
  applyOfficeCustomizations,
  assignTaskToAgent,
  computeDashboardMetrics,
  createInitialOfficeState,
  moveEmployeeSeat,
  renameEmployee,
  retryFailedTask,
  rotateEmployeeSeat,
  sendManagerToInspect,
  setManagerPatrolEnabled,
  stepOfficeSimulation,
  swapEmployeeSeats,
  triggerAgentError,
  type OfficeCustomizationRecord,
} from './office/officeEngine';
import type {
  AgentId,
  EmployeeProfile,
  ExternalAgentEvent,
  OfficeState,
  TaskPriority,
} from './office/types';
import type { StudioDashboardPayload } from './studio/types';

const CUSTOMIZATION_STORAGE_KEY = 'yendra_office_customizations_v1';

function loadOfficeCustomizations(): OfficeCustomizationRecord | null {
  try {
    const raw = window.localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OfficeCustomizationRecord;
  } catch {
    return null;
  }
}

function saveOfficeCustomizations(employees: EmployeeProfile[]): void {
  try {
    const record: OfficeCustomizationRecord = {
      names: {},
      seats: {},
    };
    for (const emp of employees) {
      record.names![emp.id] = emp.name;
      record.seats![emp.id] = {
        deskPosition: emp.deskPosition,
        deskRotationY: emp.deskRotationY,
      };
    }
    window.localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function App() {
  const [officeState, setOfficeState] = useState<OfficeState>(() =>
    applyOfficeCustomizations(
      createInitialOfficeState(Date.now()),
      loadOfficeCustomizations(),
    ),
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
        'Simulasi Error: Gangguan tugas sementara — klik Ulangi Tugas untuk memulihkan.',
        Date.now(),
      ),
    );
  };

  const handleRetryTask = (taskId: string) => {
    setOfficeState((prev) => retryFailedTask(prev, taskId, Date.now()));
  };

  const handleInspectEmployee = (agentId: AgentId) => {
    setSelectedEmployeeId(agentId);
    setActiveTab('office');
  };

  const handleRenameEmployee = (agentId: AgentId, newName: string) => {
    setOfficeState((prev) => {
      const next = renameEmployee(prev, agentId, newName, Date.now());
      saveOfficeCustomizations(next.employees);
      return next;
    });
  };

  const handleMoveEmployeeSeat = (
    agentId: AgentId,
    position: [number, number, number],
  ) => {
    setOfficeState((prev) => {
      const next = moveEmployeeSeat(prev, agentId, position, undefined, Date.now());
      saveOfficeCustomizations(next.employees);
      return next;
    });
  };

  const handleRotateEmployeeSeat = (agentId: AgentId) => {
    setOfficeState((prev) => {
      const next = rotateEmployeeSeat(prev, agentId, Math.PI / 2, Date.now());
      saveOfficeCustomizations(next.employees);
      return next;
    });
  };

  const handleSwapEmployeeSeats = (agentA: AgentId, agentB: AgentId) => {
    setOfficeState((prev) => {
      const next = swapEmployeeSeats(prev, agentA, agentB, Date.now());
      saveOfficeCustomizations(next.employees);
      return next;
    });
  };

  const handleToggleManagerPatrol = () => {
    setOfficeState((prev) =>
      setManagerPatrolEnabled(prev, !prev.managerPatrol.enabled, Date.now()),
    );
  };

  const handleSendManagerToInspect = (targetAgentId: AgentId) => {
    setOfficeState((prev) => sendManagerToInspect(prev, targetAgentId, Date.now()));
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
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'office' && (
          <OfficeViewport
            employees={officeState.employees}
            tasks={officeState.tasks}
            activityLog={officeState.activityLog}
            metrics={metrics}
            managerPatrol={officeState.managerPatrol}
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
              try {
                window.localStorage.removeItem(CUSTOMIZATION_STORAGE_KEY);
              } catch {
                // Ignore storage errors
              }
              setSelectedEmployeeId(null);
              setOfficeState(createInitialOfficeState(Date.now()));
            }}
            onRenameEmployee={handleRenameEmployee}
            onMoveEmployeeSeat={handleMoveEmployeeSeat}
            onRotateEmployeeSeat={handleRotateEmployeeSeat}
            onSwapEmployeeSeats={handleSwapEmployeeSeats}
            onToggleManagerPatrol={handleToggleManagerPatrol}
            onSendManagerToInspect={handleSendManagerToInspect}
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
            dashboard={studioDashboard}
            onRefresh={refreshStudioDashboard}
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
