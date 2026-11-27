import type { AgentStatus, TaskPriority, TaskStatus } from './types';

export function getStatusStyle(status: AgentStatus | TaskStatus): {
  badgeText: string;
  textClass: string;
  borderClass: string;
  bgClass: string;
  barClass: string;
} {
  switch (status) {
    case 'Working':
      return {
        badgeText: 'Bekerja',
        textClass: 'text-blue-400',
        borderClass: 'border-blue-500/40',
        bgClass: 'bg-blue-950/60',
        barClass: 'bg-blue-500',
      };
    case 'Thinking':
      return {
        badgeText: 'Berpikir',
        textClass: 'text-amber-400',
        borderClass: 'border-amber-500/40',
        bgClass: 'bg-amber-950/60',
        barClass: 'bg-amber-500',
      };
    case 'Completed':
      return {
        badgeText: 'Selesai',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-500/40',
        bgClass: 'bg-emerald-950/60',
        barClass: 'bg-emerald-500',
      };
    case 'Error':
      return {
        badgeText: 'Error',
        textClass: 'text-red-400',
        borderClass: 'border-red-500/50',
        bgClass: 'bg-red-950/70',
        barClass: 'bg-red-500',
      };
    case 'Queued':
      return {
        badgeText: 'Antre',
        textClass: 'text-slate-300',
        borderClass: 'border-slate-700',
        bgClass: 'bg-slate-800/80',
        barClass: 'bg-slate-500',
      };
    case 'Idle':
    default:
      return {
        badgeText: 'Siaga',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-700',
        bgClass: 'bg-slate-800/70',
        barClass: 'bg-slate-500',
      };
  }
}

export function getPriorityTextClass(priority: TaskPriority): string {
  switch (priority) {
    case 'Urgent':
      return 'text-red-400';
    case 'High':
      return 'text-amber-400';
    case 'Normal':
      return 'text-blue-400';
    case 'Low':
    default:
      return 'text-slate-400';
  }
}

export function formatClockTime(timestamp: number | null): string {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDurationSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins === 0) return `${rem}s`;
  return `${mins}m ${rem.toString().padStart(2, '0')}s`;
}
