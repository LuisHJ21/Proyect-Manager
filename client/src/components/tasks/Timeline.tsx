import { addDays, diffDays, type TaskStatus } from '@pm/shared';
import { useId } from 'react';
import type { Milestone, Task } from '../../api/types';
import { EmptyState } from '../ui';
import { buildTimelineLayout, ROW_HEIGHT } from './timelineLayout';

const DAY_WIDTH = 24;
const HEADER_HEIGHT = 24;
const TICK_DAYS = 7;

const BAR_COLOR: Record<TaskStatus, string> = {
  TODO: 'fill-ink-soft',
  IN_PROGRESS: 'fill-link',
  BLOCKED: 'fill-risk-fg',
  DONE: 'fill-ok-fg',
};

export function Timeline({ tasks, milestones, onOpen }: { tasks: Task[]; milestones: Milestone[]; onOpen: (task: Task) => void }) {
  const markerId = useId();
  const layout = buildTimelineLayout(tasks, milestones, DAY_WIDTH);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  const undatedTasks = layout.undated.map((id) => byId.get(id)!);

  const totalDays = layout.rangeStart ? diffDays(layout.rangeStart, layout.rangeEnd) + 1 : 0;
  const width = totalDays * DAY_WIDTH;
  const rows = Math.max(layout.bars.length, 1);
  const height = rows * ROW_HEIGHT;
  const ticks = Array.from({ length: Math.ceil(totalDays / TICK_DAYS) }, (_, i) => i * TICK_DAYS);

  return (
    <div className="space-y-4">
      {totalDays === 0 ? (
        <EmptyState>Asigna fechas de inicio y límite a las tareas para verlas en el cronograma.</EmptyState>
      ) : (
        <div className="flex overflow-hidden rounded-lg border border-line bg-surface">
          <ul className="w-48 shrink-0 border-r border-line" style={{ paddingTop: HEADER_HEIGHT }}>
            {layout.bars.map((bar) => (
              <li key={bar.taskId} className="truncate px-3 text-sm leading-9" style={{ height: ROW_HEIGHT }}>
                <button type="button" className="max-w-full cursor-pointer truncate text-left text-ink hover:underline" onClick={() => onOpen(byId.get(bar.taskId)!)}>
                  {byId.get(bar.taskId)!.title}
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <svg width={width} height={height + HEADER_HEIGHT} role="img" aria-label="Cronograma de tareas">
              <defs>
                <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" className="fill-ink-soft" />
                </marker>
              </defs>
              {ticks.map((offset) => (
                <g key={offset}>
                  <line x1={offset * DAY_WIDTH} x2={offset * DAY_WIDTH} y1={0} y2={height + HEADER_HEIGHT} className="stroke-line" />
                  <text x={offset * DAY_WIDTH + 4} y={16} className="fill-ink-soft text-[11px]">
                    {addDays(layout.rangeStart, offset).slice(5)}
                  </text>
                </g>
              ))}
              <g transform={`translate(0 ${HEADER_HEIGHT})`}>
                {layout.milestones.map((milestone) => (
                  <g key={milestone.id}>
                    <line x1={milestone.x} x2={milestone.x} y1={0} y2={height} className="stroke-warn-fg" strokeDasharray="4 3" />
                    <title>{milestoneById.get(milestone.id)?.name}</title>
                  </g>
                ))}
                {layout.bars.map((bar) => {
                  const task = byId.get(bar.taskId)!;
                  return (
                    <rect
                      key={bar.taskId}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={bar.summary ? 2 : 4}
                      {...(bar.summary ? { 'data-summary': '' } : {})}
                      className={`cursor-pointer ${bar.summary ? 'fill-ink-nav' : BAR_COLOR[task.status]}`}
                      onClick={() => onOpen(task)}
                    >
                      <title>{`${task.title}: ${task.startDate} a ${task.dueDate}`}</title>
                    </rect>
                  );
                })}
                {layout.arrows.map((arrow) => (
                  <path key={`${arrow.from}-${arrow.to}`} d={arrow.path} fill="none" className="stroke-ink-soft" strokeWidth={1.5} markerEnd={`url(#${markerId})`} />
                ))}
              </g>
            </svg>
          </div>
        </div>
      )}
      {undatedTasks.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-xs font-medium text-ink-soft">Sin fechas completas</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {undatedTasks.map((task) => (
              <li key={task.id}>
                <button type="button" className="cursor-pointer text-ink hover:underline" onClick={() => onOpen(task)}>
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
