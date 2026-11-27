import React, { useMemo, useState } from 'react';
import { RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  formatClockTime,
  getPriorityTextClass,
  getStatusStyle,
} from '../office/statusStyles';
import type {
  ActivityLogEntry,
  AgentId,
  EmployeeProfile,
  OfficeTask,
  TaskPriority,
  TaskStatus,
} from '../office/types';

interface TaskManagerViewProps {
  employees: EmployeeProfile[];
  tasks: OfficeTask[];
  activityLog: ActivityLogEntry[];
  onAssignTask: (payload: {
    title: string;
    description: string;
    assigneeId: AgentId;
    priority: TaskPriority;
    estimatedSeconds: number;
  }) => void;
  onRetryTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  onInspectEmployee: (id: AgentId) => void;
}

type QueueFilter = 'All' | 'Active' | 'Queued' | 'Completed' | 'Error';

export const TaskManagerView: React.FC<TaskManagerViewProps> = ({
  employees,
  tasks,
  activityLog,
  onAssignTask,
  onRetryTask,
  onCancelTask,
  onInspectEmployee,
}) => {
  const [filter, setFilter] = useState<QueueFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<AgentId>('researcher');
  const [priority, setPriority] = useState<TaskPriority>('Normal');
  const [formError, setFormError] = useState('');

  const employeeMap = useMemo(() => {
    const map = new Map<AgentId, EmployeeProfile>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filter === 'Active' && t.status !== 'Working' && t.status !== 'Thinking') {
        return false;
      }
      if (filter === 'Queued' && t.status !== 'Queued') return false;
      if (filter === 'Completed' && t.status !== 'Completed') return false;
      if (filter === 'Error' && t.status !== 'Error') return false;

      if (q) {
        const empName = employeeMap.get(t.assigneeId)?.name.toLowerCase() ?? '';
        return (
          t.title.toLowerCase().includes(q) ||
          t.department.toLowerCase().includes(q) ||
          empName.includes(q)
        );
      }
      return true;
    });
  }, [tasks, filter, searchQuery, employeeMap]);

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Judul tugas wajib diisi.');
      return;
    }
    onAssignTask({
      title: title.trim(),
      description: description.trim(),
      assigneeId,
      priority,
      estimatedSeconds: 22,
    });
    setTitle('');
    setDescription('');
    setFormError('');
  };

  const countByStatus = (status: TaskStatus | 'Active') => {
    if (status === 'Active') {
      return tasks.filter((t) => t.status === 'Working' || t.status === 'Thinking').length;
    }
    return tasks.filter((t) => t.status === status).length;
  };

  const FILTER_LABELS: Record<QueueFilter, string> = {
    All: 'Semua',
    Active: 'Aktif',
    Queued: 'Antre',
    Completed: 'Selesai',
    Error: 'Error',
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-50">
              Antrean Tugas &amp; Riwayat Aktivitas
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Pembagian tugas oleh Yendra Owner, pemantauan antrean prioritas, dan log eksekusi karyawan.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>
              Aktif:{' '}
              <strong className="font-mono-num text-blue-400">
                {countByStatus('Active')}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Antre:{' '}
              <strong className="font-mono-num text-slate-200">
                {countByStatus('Queued')}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Selesai:{' '}
              <strong className="font-mono-num text-emerald-400">
                {countByStatus('Completed')}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Gagal:{' '}
              <strong className="font-mono-num text-red-400">
                {countByStatus('Error')}
              </strong>
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Manager Assignment Panel */}
          <section
            aria-labelledby="manager-assign-heading"
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-4"
          >
            <h2
              id="manager-assign-heading"
              className="font-display text-base font-semibold text-slate-100"
            >
              Penugasan Tugas Yendra Owner
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Berikan pekerjaan langsung ke karyawan. Karyawan yang sedang siaga akan langsung memprosesnya.
            </p>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-3.5">
              <div>
                <label
                  htmlFor="queue-assignee"
                  className="block text-xs font-medium text-slate-300"
                >
                  Pilih Karyawan
                </label>
                <select
                  id="queue-assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value as AgentId)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({getStatusStyle(emp.status).badgeText})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="queue-title"
                  className="block text-xs font-medium text-slate-300"
                >
                  Judul Tugas
                </label>
                <input
                  id="queue-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="Contoh: Evaluasi Thumbnail Video Minggu Ini"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                />
                {formError && (
                  <p className="mt-1 text-xs text-red-400">{formError}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="queue-desc"
                  className="block text-xs font-medium text-slate-300"
                >
                  Brief Tugas
                </label>
                <textarea
                  id="queue-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instruksi atau target hasil kerja..."
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="queue-priority"
                  className="block text-xs font-medium text-slate-300"
                >
                  Prioritas
                </label>
                <select
                  id="queue-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Low">Rendah</option>
                  <option value="Normal">Normal</option>
                  <option value="High">Tinggi</option>
                  <option value="Urgent">Mendesak</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Kirim ke Antrean
              </button>
            </form>
          </section>

          {/* Filterable Task Queue */}
          <section
            aria-labelledby="task-queue-heading"
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="task-queue-heading"
                className="font-display text-base font-semibold text-slate-100"
              >
                Antrean Tugas Langsung
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="search"
                    aria-label="Cari tugas"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari tugas..."
                    className="rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                  {(['All', 'Active', 'Queued', 'Completed', 'Error'] as QueueFilter[]).map(
                    (tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setFilter(tab)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          filter === tab
                            ? 'bg-slate-800 text-slate-50'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {FILTER_LABELS[tab]}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-400">
                Tidak ada tugas yang cocok dengan filter ini. Kirim tugas baru atau ubah tab filter.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 pr-3 font-medium">Tugas</th>
                      <th className="py-2.5 pr-3 font-medium">Karyawan</th>
                      <th className="py-2.5 pr-3 font-medium">Status</th>
                      <th className="py-2.5 pr-3 font-medium">Progres</th>
                      <th className="py-2.5 pr-3 font-medium">Mulai / Selesai</th>
                      <th className="py-2.5 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredTasks.map((task) => {
                      const emp = employeeMap.get(task.assigneeId);
                      const st = getStatusStyle(task.status);
                      return (
                        <tr key={task.id} className="hover:bg-slate-800/30">
                          <td className="py-3 pr-3">
                            <div className="font-semibold text-slate-100">
                              {task.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                              <span className={getPriorityTextClass(task.priority)}>
                                {task.priority}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{task.department}</span>
                            </div>
                            {task.errorMessage && (
                              <div className="mt-1 text-[11px] text-red-300">
                                {task.errorMessage}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onInspectEmployee(task.assigneeId)}
                              className="font-medium text-blue-400 hover:text-blue-300"
                            >
                              {emp?.name ?? task.assigneeId}
                            </button>
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <span className={`font-semibold ${st.textClass}`}>
                              {st.badgeText}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={`h-full ${st.barClass}`}
                                  style={{ width: `${task.progress}%` }}
                                />
                              </div>
                              <span className="font-mono-num text-slate-300">
                                {task.progress}%
                              </span>
                            </div>
                          </td>
                          <td className="font-mono-num py-3 pr-3 whitespace-nowrap text-[11px] text-slate-400">
                            <div>Mulai: {formatClockTime(task.startedAt)}</div>
                            <div>Selesai: {formatClockTime(task.completedAt)}</div>
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {task.status === 'Error' && (
                                <button
                                  type="button"
                                  onClick={() => onRetryTask(task.id)}
                                  aria-label={`Ulangi '${task.title}'`}
                                  className="inline-flex items-center gap-1 rounded border border-emerald-600/50 bg-emerald-950/60 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-900/60"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>Ulangi</span>
                                </button>
                              )}
                              {task.status !== 'Completed' && (
                                <button
                                  type="button"
                                  onClick={() => onCancelTask(task.id)}
                                  aria-label={`Hapus '${task.title}'`}
                                  className="inline-flex items-center rounded border border-slate-700 bg-slate-950 p-1 text-slate-400 hover:border-red-500/50 hover:text-red-300"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Full Activity History Table */}
        <section
          aria-labelledby="activity-history-heading"
          className="rounded-xl border border-slate-800 bg-slate-900 p-5"
        >
          <h2
            id="activity-history-heading"
            className="font-display text-base font-semibold text-slate-100"
          >
            Riwayat Log Aktivitas
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4 font-medium">Waktu</th>
                  <th className="py-2 pr-4 font-medium">Karyawan</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Sumber Event</th>
                  <th className="py-2 font-medium">Keterangan Aktivitas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {activityLog.slice(0, 25).map((entry) => {
                  const st = getStatusStyle(entry.status);
                  return (
                    <tr key={entry.id}>
                      <td className="font-mono-num py-2.5 pr-4 whitespace-nowrap text-slate-400">
                        {formatClockTime(entry.timestamp)}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap font-medium text-slate-200">
                        {entry.agentName}
                      </td>
                      <td className={`py-2.5 pr-4 whitespace-nowrap font-medium ${st.textClass}`}>
                        {st.badgeText}
                      </td>
                      <td className="font-mono-num py-2.5 pr-4 whitespace-nowrap text-slate-500">
                        {entry.source}
                      </td>
                      <td className="py-2.5 text-slate-300">{entry.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
