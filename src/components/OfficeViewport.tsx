import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Footprints,
  Move,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
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
  ManagerPatrolState,
  OfficeTask,
} from '../office/types';
import { OfficeScene, type ProjectedEmployeeTag } from '../three/OfficeScene';

interface OfficeViewportProps {
  employees: EmployeeProfile[];
  tasks: OfficeTask[];
  activityLog: ActivityLogEntry[];
  metrics: DashboardMetrics;
  managerPatrol: ManagerPatrolState;
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
  onRenameEmployee: (agentId: AgentId, newName: string) => void;
  onMoveEmployeeSeat: (agentId: AgentId, position: [number, number, number]) => void;
  onRotateEmployeeSeat: (agentId: AgentId) => void;
  onSwapEmployeeSeats: (agentA: AgentId, agentB: AgentId) => void;
  onToggleManagerPatrol: () => void;
  onSendManagerToInspect: (targetAgentId: AgentId) => void;
}

const CAMERA_LABELS: Array<{ id: CameraPresetId; label: string }> = [
  { id: 'isometric', label: 'Seluruh Kelas' },
  { id: 'manager', label: 'Meja Guru' },
  { id: 'video_bay', label: 'Baris Depan' },
  { id: 'creative_pod', label: 'Baris Belakang' },
  { id: 'meeting_room', label: 'Papan Tulis' },
];

export const OfficeViewport: React.FC<OfficeViewportProps> = ({
  employees,
  tasks,
  activityLog,
  metrics,
  managerPatrol,
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
  onRenameEmployee,
  onMoveEmployeeSeat,
  onRotateEmployeeSeat,
  onSwapEmployeeSeats,
  onToggleManagerPatrol,
  onSendManagerToInspect,
}) => {
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('isometric');
  const [presetVersion, setPresetVersion] = useState(0);
  const [showFloatingLabels, setShowFloatingLabels] = useState(true);
  const [dockExpanded, setDockExpanded] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [projectedTags, setProjectedTags] = useState<ProjectedEmployeeTag[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [moveSeatAgentId, setMoveSeatAgentId] = useState<AgentId | null>(null);
  const [swapTargetId, setSwapTargetId] = useState<AgentId | ''>('');

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

  useEffect(() => {
    setEditingName(false);
    setMoveSeatAgentId(null);
    setNameDraft(selectedEmployee?.name ?? '');
    if (selectedEmployee) {
      const firstOther = employees.find((e) => e.id !== selectedEmployee.id);
      setSwapTargetId(firstOther ? firstOther.id : '');
    } else {
      setSwapTargetId('');
    }
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (!moveSeatAgentId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoveSeatAgentId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moveSeatAgentId]);

  const handlePlaceSeat = useCallback(
    (agentId: AgentId, position: [number, number, number]) => {
      onMoveEmployeeSeat(agentId, position);
      setMoveSeatAgentId(null);
    },
    [onMoveEmployeeSeat],
  );

  const selectedTask = selectedEmployee?.currentTaskId
    ? tasks.find((t) => t.id === selectedEmployee.currentTaskId) ?? null
    : null;

  const selectedAgentTasks = selectedEmployee
    ? tasks
        .filter((t) => t.assigneeId === selectedEmployee.id)
        .sort((a, b) => {
          const rank = (s: OfficeTask['status']) =>
            s === 'Working' || s === 'Thinking'
              ? 0
              : s === 'Error'
                ? 1
                : s === 'Queued'
                  ? 2
                  : 3;
          const diff = rank(a.status) - rank(b.status);
          return diff !== 0 ? diff : b.createdAt - a.createdAt;
        })
        .slice(0, 8)
    : [];

  const movingEmployee = moveSeatAgentId
    ? employees.find((e) => e.id === moveSeatAgentId) ?? null
    : null;

  const managerEmployee = employees.find((e) => e.id === 'manager');
  const managerPatrolActive =
    managerPatrol.enabled || managerPatrol.phase !== 'at_desk';

  return (
    <div className="relative flex flex-1 overflow-hidden bg-slate-950">
      {/* Main 3D Isometric Viewport */}
      <div className="relative flex-1 overflow-hidden">
        <OfficeScene
          employees={employees}
          managerPatrol={managerPatrol}
          selectedEmployeeId={selectedEmployeeId}
          moveSeatAgentId={moveSeatAgentId}
          cameraPreset={cameraPreset}
          presetVersion={presetVersion}
          onSelectEmployee={handleSelectFrom3D}
          onPlaceSeat={handlePlaceSeat}
          onProjectedLabels={setProjectedTags}
        />

        {/* Move Seat Mode Active Banner */}
        {movingEmployee && (
          <div
            data-testid="move-seat-banner"
            className="pointer-events-auto absolute top-14 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-400/60 bg-slate-900/95 px-3.5 py-2 text-xs text-amber-100 shadow-xl"
          >
            <Move className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>
              Klik lantai kelas yang kosong untuk memindahkan bangku{' '}
              <strong className="font-semibold text-white">{movingEmployee.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => setMoveSeatAgentId(null)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
            >
              Batal
            </button>
          </div>
        )}

        {/* Top-Left Compact KPI & System Mode Strip */}
        <div className="pointer-events-none absolute top-3 left-3 right-3 z-10 flex flex-wrap items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-800 bg-slate-900/95 px-3.5 py-2 text-xs shadow-lg">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Karyawan</span>
              <span className="font-mono-num font-semibold text-slate-50">
                {metrics.totalEmployees}
              </span>
            </div>
            <span className="text-slate-700" aria-hidden="true">
              /
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Aktif</span>
              <span className="font-mono-num font-semibold text-blue-400">
                {metrics.activeTasks}
              </span>
            </div>
            <span className="text-slate-700" aria-hidden="true">
              /
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Selesai</span>
              <span className="font-mono-num font-semibold text-emerald-400">
                {metrics.completedTasks}
              </span>
            </div>
            <span className="text-slate-700" aria-hidden="true">
              /
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Gagal</span>
              <span className="font-mono-num font-semibold text-red-400">
                {metrics.failedTasks}
              </span>
            </div>
            <span className="hidden text-slate-700 sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden text-slate-300 sm:inline">
              {modeLabel} ({simulationRunning ? `${simulationSpeed}x` : 'Dijeda'})
            </span>
          </div>

          {!drawerOpen && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs font-medium text-slate-100 shadow-lg hover:bg-slate-800"
            >
              <span>Inspektor &amp; Aktivitas</span>
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
                  aria-label={`Pantau ${emp.name} (${style.badgeText})`}
                  style={{
                    transform: `translate(${Math.round(tag.x)}px, ${Math.round(tag.y)}px) translate(-50%, -100%)`,
                  }}
                  className={`pointer-events-auto absolute left-0 top-0 max-w-[152px] rounded-md border px-2 py-0.5 text-left shadow-md transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-slate-900 text-white'
                      : 'border-slate-700/90 bg-slate-900/95 text-slate-100 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 text-[11px] font-semibold leading-tight">
                    <span className="truncate">{emp.name}</span>
                    <span className={`font-mono-num shrink-0 ${style.textClass}`}>
                      {emp.status === 'Working' || emp.status === 'Thinking'
                        ? `${emp.progress}%`
                        : style.badgeText}
                    </span>
                  </div>
                  <div className="truncate text-[10px] leading-tight text-slate-400">
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
                <span>Sembunyikan Kontrol</span>
              </>
            ) : (
              <>
                <ChevronUp className="h-3 w-3" />
                <span>Kontrol Kelas</span>
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

              {/* Simulation, Manager Patrol & Label Controls */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleManagerPatrol}
                  data-testid="toggle-manager-patrol"
                  title="Gerakkan Guru berkeliling memantau setiap bangku kelas"
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    managerPatrol.enabled
                      ? 'border-emerald-500/70 bg-emerald-950/80 text-emerald-200 hover:bg-emerald-900/70'
                      : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Footprints className="h-3.5 w-3.5" />
                  <span>
                    {managerPatrol.enabled
                      ? 'Patroli Aktif'
                      : managerPatrolActive
                        ? 'Kembali'
                        : 'Guru Keliling'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleSimulation}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  {simulationRunning ? (
                    <>
                      <Pause className="h-3 w-3" />
                      <span>Jeda</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" />
                      <span>Lanjut</span>
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
                  aria-label="Tampilkan/Sembunyikan Label 3D"
                  title="Tampilkan/Sembunyikan Label 3D"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  {showFloatingLabels ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">Label</span>
                </button>

                <button
                  type="button"
                  onClick={onResetDemo}
                  aria-label="Rapikan Kelas"
                  title="Rapikan Ulang Posisi Kelas"
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
          aria-label="Inspektor Kantor dan Log Aktivitas"
          className="fixed inset-x-0 bottom-0 h-[58vh] z-30 flex flex-col rounded-t-xl border-t border-l border-slate-800 bg-slate-900 shadow-2xl md:static md:h-auto md:rounded-none md:border-t-0 md:w-88 lg:w-96 shrink-0"
        >
          {/* Drawer Header & Quick Employee Selector */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              {selectedEmployee ? 'Inspektor Anggota' : 'Monitor Kelas Langsung'}
            </h2>
            <div className="flex items-center gap-2">
              {selectedEmployee && (
                <button
                  type="button"
                  onClick={() => onSelectEmployee(null)}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  Semua Feed
                </button>
              )}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Tutup Panel Inspektor"
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
                      {emp.name}
                    </span>
                    <span className={`font-mono-num text-[11px] ${st.textClass}`}>
                      {st.badgeText} · {emp.progress}%
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
                {/* Identity, Inline Rename & Status */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {editingName ? (
                        <form
                          className="flex items-center gap-1.5"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (nameDraft.trim()) {
                              onRenameEmployee(selectedEmployee.id, nameDraft.trim());
                            }
                            setEditingName(false);
                          }}
                        >
                          <input
                            type="text"
                            value={nameDraft}
                            maxLength={40}
                            autoFocus
                            aria-label="Nama Karyawan"
                            data-testid="employee-name-input"
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setEditingName(false);
                                setNameDraft(selectedEmployee.name);
                              }
                            }}
                            className="w-full min-w-0 rounded-md border border-blue-500 bg-slate-950 px-2 py-1 text-sm font-semibold text-white focus:outline-none"
                          />
                          <button
                            type="submit"
                            aria-label="Simpan Nama Karyawan"
                            data-testid="save-employee-name"
                            className="rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-500"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Batal Ubah Nama"
                            onClick={() => {
                              setEditingName(false);
                              setNameDraft(selectedEmployee.name);
                            }}
                            className="rounded-md border border-slate-700 bg-slate-950 p-1.5 text-slate-300 hover:bg-slate-800"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <h3
                            data-testid="inspector-employee-name"
                            className="font-display truncate text-base font-bold text-white"
                          >
                            {selectedEmployee.name}
                          </h3>
                          <button
                            type="button"
                            aria-label="Ubah Nama Karyawan"
                            data-testid="edit-employee-name-btn"
                            title="Ganti nama karyawan"
                            onClick={() => {
                              setNameDraft(selectedEmployee.name);
                              setEditingName(true);
                            }}
                            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-slate-400">
                        {selectedEmployee.role} · {selectedEmployee.workstation}
                      </p>
                    </div>
                    <span
                      className={`font-mono-num shrink-0 text-xs font-semibold ${
                        getStatusStyle(selectedEmployee.status).textClass
                      }`}
                    >
                      {getStatusStyle(selectedEmployee.status).badgeText}
                    </span>
                  </div>

                  {/* Current Activity & Progress */}
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Aktivitas Saat Ini</span>
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
                        <span className="block text-slate-500">Tugas Dimulai</span>
                        <span className="font-mono-num text-slate-200">
                          {formatClockTime(selectedTask.startedAt)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-slate-500">Selesai</span>
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

                {/* Task & Manager Inspection Actions */}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenAssignForAgent(selectedEmployee.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Beri Tugas</span>
                    </button>

                    {selectedEmployee.status === 'Error' && selectedTask ? (
                      <button
                        type="button"
                        onClick={() => onRetryTask(selectedTask.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-950/60 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Ulangi Tugas</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onTriggerError(selectedEmployee.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 hover:border-red-500/50 hover:text-red-300"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Uji Error</span>
                      </button>
                    )}
                  </div>

                  {selectedEmployee.id === 'manager' ? (
                    <button
                      type="button"
                      onClick={onToggleManagerPatrol}
                      data-testid="inspector-manager-patrol-btn"
                      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        managerPatrol.enabled
                          ? 'border-emerald-500/60 bg-emerald-950/60 text-emerald-200 hover:bg-emerald-900/60'
                          : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <Footprints className="h-3.5 w-3.5" />
                      <span>
                        {managerPatrol.enabled
                          ? 'Hentikan Patroli & Kembali ke Meja Guru'
                          : 'Keliling Pantau Kelas'}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSendManagerToInspect(selectedEmployee.id)}
                      data-testid="send-manager-inspect-btn"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 hover:bg-slate-800"
                    >
                      <Footprints className="h-3.5 w-3.5 text-blue-400" />
                      <span>
                        Kirim {managerEmployee?.name ?? 'Yendra Owner'} Memantau
                      </span>
                    </button>
                  )}
                </div>

                {/* Workstation Seat Relocation & Swap */}
                <div className="border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-400">
                      Posisi Bangku
                    </h4>
                    <span className="font-mono-num text-[11px] text-slate-500">
                      ({selectedEmployee.deskPosition[0].toFixed(1)},{' '}
                      {selectedEmployee.deskPosition[2].toFixed(1)})
                    </span>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      data-testid="move-seat-3d-btn"
                      onClick={() =>
                        setMoveSeatAgentId((prev) =>
                          prev === selectedEmployee.id ? null : selectedEmployee.id,
                        )
                      }
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        moveSeatAgentId === selectedEmployee.id
                          ? 'border-amber-400/70 bg-amber-950/60 text-amber-200'
                          : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <Move className="h-3.5 w-3.5" />
                      <span>
                        {moveSeatAgentId === selectedEmployee.id
                          ? 'Klik Lantai...'
                          : 'Pindah Bangku di 3D'}
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="rotate-seat-btn"
                      onClick={() => onRotateEmployeeSeat(selectedEmployee.id)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      title="Putar meja 90 derajat"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>90°</span>
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5">
                    <select
                      aria-label="Tukar Meja Dengan Karyawan"
                      data-testid="swap-seat-select"
                      value={swapTargetId}
                      onChange={(e) => setSwapTargetId(e.target.value as AgentId)}
                      className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                    >
                      {employees
                        .filter((e) => e.id !== selectedEmployee.id)
                        .map((other) => (
                          <option key={other.id} value={other.id}>
                            Tukar dengan {other.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      data-testid="swap-seat-btn"
                      disabled={!swapTargetId}
                      onClick={() => {
                        if (swapTargetId) {
                          onSwapEmployeeSeats(selectedEmployee.id, swapTargetId);
                        }
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-40"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      <span>Tukar</span>
                    </button>
                  </div>
                </div>

                {/* Performance Summary */}
                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-semibold text-slate-400">
                    Ringkasan Kinerja
                  </h4>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-slate-950/70 p-2.5">
                      <span className="block text-slate-500">Selesai</span>
                      <span className="font-mono-num text-sm font-bold text-emerald-400">
                        {selectedEmployee.tasksCompleted}
                      </span>
                    </div>
                    <div className="rounded-md bg-slate-950/70 p-2.5">
                      <span className="block text-slate-500">Gagal</span>
                      <span className="font-mono-num text-sm font-bold text-red-400">
                        {selectedEmployee.tasksFailed}
                      </span>
                    </div>
                    <div className="rounded-md bg-slate-950/70 p-2.5">
                      <span className="block text-slate-500">Waktu Aktif</span>
                      <span className="font-mono-num text-sm font-bold text-slate-200">
                        {formatDurationSeconds(selectedEmployee.totalActiveSeconds)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recent Tasks for Employee */}
                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-semibold text-slate-400">
                    Tugas Terkini
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
                              {ts.badgeText}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                            <span>Mulai {formatClockTime(task.startedAt)}</span>
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
                    Log Aktivitas Langsung
                  </h3>
                  <span className="font-mono-num text-[11px] text-slate-500">
                    {activityLog.length} kejadian
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
                          <span className={st.textClass}>{st.badgeText}</span>
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
