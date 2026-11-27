import React from 'react';
import {
  formatClockTime,
  formatDurationSeconds,
  getStatusStyle,
} from '../office/statusStyles';
import type {
  AgentId,
  DashboardMetrics,
  EmployeeProfile,
  OfficeTask,
} from '../office/types';

interface AnalyticsViewProps {
  employees: EmployeeProfile[];
  tasks: OfficeTask[];
  metrics: DashboardMetrics;
  onInspectEmployee: (id: AgentId) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  employees,
  tasks,
  metrics,
  onInspectEmployee,
}) => {
  const maxCompleted = Math.max(
    1,
    ...employees.map((e) => e.tasksCompleted),
  );

  const totalCompletedAll = employees.reduce(
    (sum, e) => sum + e.tasksCompleted,
    0,
  );
  const totalFailedAll = employees.reduce((sum, e) => sum + e.tasksFailed, 0);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h1 className="font-display text-2xl font-bold text-slate-50">
            Ringkasan Kinerja Karyawan
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Produktivitas, ketuntasan tugas, dan waktu aktif seluruh 7 anggota tim kantor.
          </p>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <span className="text-xs text-slate-400">Total Karyawan</span>
            <div className="font-mono-num mt-1 text-2xl font-bold text-slate-50">
              {metrics.totalEmployees}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <span className="text-xs text-slate-400">Total Tugas Selesai</span>
            <div className="font-mono-num mt-1 text-2xl font-bold text-emerald-400">
              {totalCompletedAll}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <span className="text-xs text-slate-400">Total Kendala</span>
            <div className="font-mono-num mt-1 text-2xl font-bold text-red-400">
              {totalFailedAll}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <span className="text-xs text-slate-400">Aktif / Antre Saat Ini</span>
            <div className="font-mono-num mt-1 text-2xl font-bold text-blue-400">
              {metrics.activeTasks} / {metrics.queuedTasks}
            </div>
          </div>
        </div>

        {/* Employee Performance Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {employees.map((emp) => {
            const st = getStatusStyle(emp.status);
            const queuedCount = tasks.filter(
              (t) => t.assigneeId === emp.id && t.status === 'Queued',
            ).length;
            const barWidth = Math.round((emp.tasksCompleted / maxCompleted) * 100);

            return (
              <div
                key={emp.id}
                className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900 p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-100">
                        {emp.name}
                      </h2>
                      <p className="text-xs text-slate-400">
                        {emp.role} · {emp.workstation}
                      </p>
                    </div>
                    <span className={`font-mono-num text-xs font-semibold ${st.textClass}`}>
                      {st.badgeText}
                    </span>
                  </div>

                  {/* Throughput Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Hasil Selesai</span>
                      <span className="font-mono-num font-semibold text-slate-200">
                        {emp.tasksCompleted} tugas
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-xs">
                    <div>
                      <span className="block text-slate-500">Efisiensi</span>
                      <span className="font-mono-num font-semibold text-emerald-400">
                        {emp.efficiencyScore}%
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-500">Antre</span>
                      <span className="font-mono-num font-semibold text-slate-200">
                        {queuedCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-500">Waktu Aktif</span>
                      <span className="font-mono-num font-semibold text-slate-200">
                        {formatDurationSeconds(emp.totalActiveSeconds)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
                  <span className="font-mono-num text-slate-500">
                    Diperbarui {formatClockTime(emp.statusUpdatedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onInspectEmployee(emp.id)}
                    className="font-semibold text-blue-400 hover:text-blue-300"
                  >
                    Pantau di 3D
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
