import React from 'react';
import { Plus } from 'lucide-react';

export type WorkspaceTab =
  | 'office'
  | 'studio'
  | 'tasks'
  | 'video'
  | 'analytics'
  | 'integrations';

interface TopNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onOpenAssignModal: () => void;
  awaitingVideoReviewCount: number;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'office', label: '3D Office' },
  { id: 'studio', label: 'AI Content Studio' },
  { id: 'tasks', label: 'Tasks & Queue' },
  { id: 'video', label: 'Video Pipeline' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'integrations', label: 'Integrations' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenAssignModal,
  awaitingVideoReviewCount,
}) => {
  return (
    <header className="shrink-0 border-b border-slate-800 bg-slate-950 px-4 lg:px-6">
      <div className="flex h-14 items-center justify-between gap-4 lg:gap-8">
        {/* Zone 1: Single-line Brand Title */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-display text-base font-bold tracking-tight text-slate-50 whitespace-nowrap">
            YENDRA AI OFFICE
          </span>
        </div>

        {/* Zone 2 (Desktop): Primary Navigation Tabs */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="hidden md:flex items-center gap-1 overflow-x-auto py-1"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                  isActive
                    ? 'bg-slate-800 text-slate-50'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                {item.label}
                {item.id === 'video' && awaitingVideoReviewCount > 0 && (
                  <span className="ml-1.5 font-mono-num text-xs font-semibold text-amber-400">
                    ({awaitingVideoReviewCount})
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenAssignModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Assign Task</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Strip */}
      <nav
        aria-label="Mobile Workspace Navigation"
        className="flex md:hidden items-center gap-1 overflow-x-auto border-t border-slate-800/80 py-1.5"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-slate-800 text-slate-50'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
              }`}
            >
              {item.label}
              {item.id === 'video' && awaitingVideoReviewCount > 0 && (
                <span className="ml-1 font-mono-num text-[11px] font-semibold text-amber-400">
                  ({awaitingVideoReviewCount})
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
