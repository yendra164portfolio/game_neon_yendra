import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AgentId, EmployeeProfile, TaskPriority } from '../office/types';

interface AssignTaskModalProps {
  isOpen: boolean;
  employees: EmployeeProfile[];
  defaultAssigneeId?: AgentId;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    description: string;
    assigneeId: AgentId;
    priority: TaskPriority;
    estimatedSeconds: number;
  }) => void;
}

export const AssignTaskModal: React.FC<AssignTaskModalProps> = ({
  isOpen,
  employees,
  defaultAssigneeId,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<AgentId>(
    defaultAssigneeId ?? 'researcher',
  );
  const [priority, setPriority] = useState<TaskPriority>('High');
  const [estimatedSeconds, setEstimatedSeconds] = useState(24);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (defaultAssigneeId) {
      setAssigneeId(defaultAssigneeId);
    }
  }, [defaultAssigneeId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError('Silakan masukkan judul tugas terlebih dahulu.');
      return;
    }
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      assigneeId,
      priority,
      estimatedSeconds,
    });
    setTitle('');
    setDescription('');
    setValidationError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-task-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2
              id="assign-task-modal-title"
              className="font-display text-lg font-bold text-slate-50"
            >
              Beri Tugas ke Karyawan
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Dikirim oleh Yendra Owner ke antrean meja kerja terpilih.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Dialog Tugas"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="modal-task-assignee"
              className="block text-xs font-medium text-slate-300"
            >
              Karyawan
            </label>
            <select
              id="modal-task-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value as AgentId)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} — {emp.role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="modal-task-title"
              className="block text-xs font-medium text-slate-300"
            >
              Judul Tugas
            </label>
            <input
              id="modal-task-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (validationError) setValidationError('');
              }}
              placeholder="Contoh: Susun Naskah Video Motivasi Pagi"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            {validationError && (
              <p className="mt-1 text-xs text-red-400">{validationError}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="modal-task-desc"
              className="block text-xs font-medium text-slate-300"
            >
              Instruksi / Brief
            </label>
            <textarea
              id="modal-task-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Catatan kriteria atau detail tugas (opsional)..."
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="modal-task-priority"
                className="block text-xs font-medium text-slate-300"
              >
                Prioritas
              </label>
              <select
                id="modal-task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="Low">Rendah</option>
                <option value="Normal">Normal</option>
                <option value="High">Tinggi</option>
                <option value="Urgent">Mendesak</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="modal-task-duration"
                className="block text-xs font-medium text-slate-300"
              >
                Estimasi Siklus (detik)
              </label>
              <input
                id="modal-task-duration"
                type="number"
                min={8}
                max={120}
                value={estimatedSeconds}
                onChange={(e) =>
                  setEstimatedSeconds(Math.max(8, Number(e.target.value) || 20))
                }
                className="font-mono-num mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
            >
              Kirim Tugas
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
