import React, { useCallback, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  formatClockTime,
  formatDurationSeconds,
  getStatusStyle,
} from '../office/statusStyles';
import type {
  ActivityLogEntry,
  AgentId,
  CameraPresetId,
  DashboardMetrics,
  EmployeeProfile,
  OfficeTask,
} from '../office/types';
import { OfficeScene, type ProjectedEmployeeTag } from '../three/OfficeScene';

interface OfficeViewportProps {
  employees: EmployeeProfile[];
  tasks: OfficeTask[];
  activityLog: ActivityLogEntry[];
  metrics: DashboardMetrics;
  selectedEmployeeId: AgentId | null;
  simulationRunning: boolean;
  simulationSpeed: 1 | 2 | 4;
  modeLabel: string;
  onSelectEmployee: (id: AgentId | null) => void;
  onToggleSimulation: () => void;
  onChangeSpeed: (speed: 1 | 2 | 4) => void;
  onOpenAssignForAgent: (agentId: AgentId) => void;
  onTriggerError: (agentId: AgentId) => void;
  onRetryTask: (taskId: string) => void;
  onResetDemo: () => void;
}

const CAMERA_LABELS: Array<{ id: CameraPresetId; label: string }> = [
  { id: 'isometric', label: 'Isometric' },
  { id: 'manager', label: 'Manager' },
  { id: 'video_bay', label: 'Video Bay' },
  { id: 'creative_pod', label: 'Design Pod' },
  { id: 'meeting_room', label: 'Meeting Room' },
];

export const OfficeViewport: React.FC<OfficeViewportProps> = ({
  employees,
  tasks,
  activityLog,
  metrics,
  selectedEmployeeId,
  simulationRunning,
  simulationSpeed,
  modeLabel,
  onSelectEmployee,
  onToggleSimulation,
  onChangeSpeed,
  onOpenAssignForAgent,
  onTriggerError,
  onRetryTask,
  onResetDemo,
}) => {
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('isometric');
  const [presetVersion, setPresetVersion] = useState(0);
  const [showFloatingLabels, setShowFloatingLabels] = useState(true);
  const [dockExpanded, setDockExpanded] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [projectedTags, setProjectedTags] = useState<ProjectedEmployeeTag[]>([]);

  const handleSelectCamera = (id: CameraPresetId) => {
    setCameraPreset(id);
    setPresetVersion((v) => v + 1);
  };

  const handleSelectFrom3D = useCallback(
    (id: AgentId) => {
      onSelectEmployee(id);
      setDrawerOpen(true);
    },
    [onSelectEmployee],
  );

  const selectedEmployee = selectedEmployeeId
    ? employees.find((e) => e.id === selectedEmployeeId) ?? null
    : null;

  const selectedTask = selectedEmployee?.currentTaskId
    ? tasks.find((t) => t.id === selectedEmployee.currentTaskId) ?? null
    : null;

  const selectedAgentTasks = selectedEmployee
    ? tasks.filter((t) => t.assigneeId === selectedEmployee.id).slice(0, 5)
    : [];

  return (
    <div className="relative flex flex-1 overflow-hidden bg-slate-950">
      {/* Main 3D Isometric Viewport */}
      <div className="relative flex-1 overflow-hidden">
        <OfficeScene
          employees={employees}
          selectedEmployeeId={selectedEmployeeId}
          cameraPreset={cameraPreset}
          presetVersion={presetVersion}
          onSelectEmployee={handleSelectFrom3D}
          onProjectedLabels={setProjectedTags}
        />

        {/* Top-Left Compact KPI & System Mode Strip */}
        <div className="pointer-events-none absolute top-3 left-3 right-3 z-10 flex flex-wrap items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-800 bg-slate-900/95 px-3.5 py-2 text-xs shadow-lg">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Employees</span>
              <span className="font-mono-num font-semibold text-slate-50">
                {metrics.totalEmployees}
              </span>
            </div>
            <span className="text-slate-700" aria-hidden="true">
              /
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Active</span>
              <span className="font-mono-num font-semibold text-blue-400">
                {metrics.activeTasks}
              </span>
            </div>
            <span className="text-slate-700" aria-hidden="true">
              /
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Completed</span>
              <span className="font-mono-num font-semibold text-emerald-400">
                {metrics.completedTasks}
              </span>
            </div>
            <span className="text-slate-700" aria-hidden="true">
              /
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Failed</span>
              <span className="font-mono-num font-semibold text-red-400">
                {metrics.failedTasks}
              </span>
            </div>
            <span className="hidden text-slate-700 sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden text-slate-300 sm:inline">
              {modeLabel} ({simulationRunning ? `${simulationSpeed}x` : 'Paused'})
            </span>
          </div>

          {!drawerOpen && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs font-medium text-slate-100 shadow-lg hover:bg-slate-800"
            >
              <span>Inspect & Activity Feed</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Floating Projected 3D Employee Activity Labels */}
        {showFloatingLabels && (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {projectedTags.map((tag) => {
              if (!tag.visible) return null;
              const emp = employees.find((e) => e.id === tag.id);
              if (!emp) return null;
              const style = getStatusStyle(emp.status);
              const isSelected = selectedEmployeeId === emp.id;

              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => handleSelectFrom3D(emp.id)}
                  aria-label={`Inspect ${emp.name} (${emp.status})`}
                  style={{
                    transform: `translate(${Math.round(tag.x)}px, ${Math.round(tag.y)}px) translate(-50%, -100%)`,
                  }}
                  className={`pointer-events-auto absolute left-0 top-0 max-w-[180px] rounded-md border px-2 py-1 text-left shadow-md transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-slate-900 text-white'
                      : 'border-slate-700/90 bg-slate-900/95 text-slate-100 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold leading-tight">
                    <span className="truncate">{emp.name}</span>
                    <span className={`font-mono-num shrink-0 ${style.textClass}`}>
                      {emp.status === 'Working' || emp.status === 'Thinking'
                        ? `${emp.progress}%`
                        : emp.status}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-400">
                    {emp.currentActivity}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Collapsible Bottom Control Dock */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockExpanded((prev) => !prev)}
            className="pointer-events-auto mb-1.5 inline-flex items-center gap-1 rounded-t-md border border-b-0 border-slate-700 bg-slate-900/95 px-3 py-1 text-[11px] font-medium text-slate-300 hover:text-white"
          >
            {dockExpanded ? (
              <>
                <ChevronDown className="h-3 w-3" />
                <span>Hide Controls</span>
              </>
            ) : (
              <>
                <ChevronUp className="h-3 w-3" />
                <span>Office Controls</span>
              </>
            )}
          </button>

          {dockExpanded && (
            <div className="pointer-events-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/95 px-3 py-2 shadow-2xl">
              {/* Camera Presets */}
              <div className="flex items-center gap-1 overflow-x-auto">
                {CAMERA_LABELS.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => handleSelectCamera(cam.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      cameraPreset === cam.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>

              {/* Simulation & Label Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleSimulation}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  {simulationRunning ? (
                    <>
                      <Pause className="h-3 w-3" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" />
                      <span>Resume</span>
                    </>
                  )}
                </button>

                <div className="flex items-center rounded-md border border-slate-700 bg-slate-950 p-0.5">
                  {([1, 2, 4] as const).map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onChangeSpeed(spd)}
                      className={`font-mono-num rounded px-2 py-0.5 text-xs font-medium ${
                        simulationSpeed === spd
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowFloatingLabels((v) => !v)}
                  aria-label="Toggle Floating 3D Labels"
                  title="Toggle Floating 3D Labels"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  {showFloatingLabels ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">Labels</span>
                </button>

                <button
                  type="button"
                  onClick={onResetDemo}
                  aria-label="Reset Demo Office"
                  title="Reset Demo Office"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Rail (Desktop) / Bottom Sheet (Mobile): Employee Inspector + Live Activity Feed */}
      {drawerOpen && (
        <aside
          aria-label="Office Inspector and Activity Feed"
          className="fixed inset-x-0 bottom-0 h-[58vh] z-30 flex flex-col rounded-t-xl border-t border-l border-slate-800 bg-slate-900 shadow-2xl md:static md:h-auto md:rounded-none md:border-t-0 md:w-88 lg:w-96 shrink-0"
        >
          {/* Drawer Header & Quick Employee Selector */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              {selectedEmployee ? 'Employee Inspector' : 'Live Office Monitor'}
            </h2>
            <div className="flex items-center gap-2">
              {selectedEmployee && (
                <button
                  type="button"
                  onClick={() => onSelectEmployee(null)}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  All Feed
                </button>
              )}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Collapse Inspector Panel"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Employee Directory Strip for 1-click switching */}
          <div className="border-b border-slate-800 px-4 py-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              {employees.map((emp) => {
                const st = getStatusStyle(emp.status);
                const active = selectedEmployeeId === emp.id;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => onSelectEmployee(emp.id)}
                    className={`flex flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                      active
                        ? 'border-blue-500 bg-slate-800'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                    }`}
                  >
                    <span className="truncate text-xs font-semibold text-slate-100">
                      {emp.name.replace('AI ', '').replace('Yendra ', '')}
                    </span>
                    <span className={`font-mono-num text-[11px] ${st.textClass}`}>
                      {emp.status} · {emp.progress}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Inspector or Live Activity Feed */}
          <div className="flex-1 overflow-y-auto p-4">
            {selectedEmployee ? (
              <div className="space-y-5">
                {/* Identity & Status */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-bold text-white">
                        {selectedEmployee.name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {selectedEmployee.role} · {selectedEmployee.workstation}
                      </p>
                    </div>
                    <span
                      className={`font-mono-num text-xs font-semibold ${
                        getStatusStyle(selectedEmployee.status).textClass
                      }`}
                    >
                      {selectedEmployee.status}
                    </span>
                  </div>

                  {/* Current Activity & Progress */}
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Current Activity</span>
                      <span className="font-mono-num font-semibold text-slate-200">
                        {selectedEmployee.progress}%
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-100">
                      {selectedEmployee.currentActivity}
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full transition-all duration-300 ${
                          getStatusStyle(selectedEmployee.status).barClass
                        }`}
                        style={{ width: `${selectedEmployee.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Timestamps */}
                  {selectedTask && (
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3 text-xs">
                      <div>
                        <span className="block text-slate-500">Task Started</span>
                        <span className="font-mono-num text-slate-200">
                          {formatClockTime(selectedTask.startedAt)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-slate-500">Completed</span>
                        <span className="font-mono-num text-slate-200">
                          {formatClockTime(selectedTask.completedAt)}
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedTask?.errorMessage && (
                    <div className="mt-3 rounded-lg border border-red-500/40 bg-red-950/40 p-2.5 text-xs text-red-200">
                      {selectedTask.errorMessage}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenAssignForAgent(selectedEmployee.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Assign Task</span>
                  </button>

                  {selectedEmployee.status === 'Error' && selectedTask ? (
                    <button
                      type="button"
                      onClick={() => onRetryTask(selectedTask.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-950/60 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Retry Task</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onTriggerError(selectedEmployee.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 hover:border-red-500/50 hover:text-red-300"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Test Error</span>
                    </button>
                  )}
                </div>

                {/* Performance Summary */}
                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-semibold text-slate-400">
                    Performance Overview
                  </h4>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-slate-950/70 p-2.5">
                      <span className="block text-slate-500">Done</span>
                      <span className="font-mono-num text-sm font-bold text-emerald-400">
                        {selectedEmployee.tasksCompleted}
                      </span>
                    </div>
                    <div className="rounded-md bg-slate-950/70 p-2.5">
                      <span className="block text-slate-500">Failed</span>
                      <span className="font-mono-num text-sm font-bold text-red-400">
                        {selectedEmployee.tasksFailed}
                      </span>
                    </div>
                    <div className="rounded-md bg-slate-950/70 p-2.5">
                      <span className="block text-slate-500">Active Time</span>
                      <span className="font-mono-num text-sm font-bold text-slate-200">
                        {formatDurationSeconds(selectedEmployee.totalActiveSeconds)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recent Tasks for Employee */}
                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-semibold text-slate-400">
                    Assigned & Recent Tasks
                  </h4>
                  <ul className="mt-2 space-y-2">
                    {selectedAgentTasks.map((task) => {
                      const ts = getStatusStyle(task.status);
                      return (
                        <li
                          key={task.id}
                          className="rounded-md border border-slate-800 bg-slate-950/60 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-slate-200">
                              {task.title}
                            </span>
                            <span className={`font-mono-num shrink-0 ${ts.textClass}`}>
                              {task.status}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                            <span>Started {formatClockTime(task.startedAt)}</span>
                            <span className="font-mono-num">{task.progress}%</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-400">
                    Real-Time Activity Feed
                  </h3>
                  <span className="font-mono-num text-[11px] text-slate-500">
                    {activityLog.length} events
                  </span>
                </div>
                <ul className="mt-3 divide-y divide-slate-800/80">
                  {activityLog.slice(0, 20).map((entry) => {
                    const st = getStatusStyle(entry.status);
                    return (
                      <li key={entry.id} className="py-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectEmployee(entry.agentId)}
                            className="font-semibold text-slate-200 hover:text-blue-400"
                          >
                            {entry.agentName}
                          </button>
                          <span className="font-mono-num text-[11px] text-slate-500">
                            {formatClockTime(entry.timestamp)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-slate-400">{entry.message}</p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <span className={st.textClass}>{entry.status}</span>
                          <span aria-hidden="true">·</span>
                          <span>{entry.source}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
