import { addDays, diffDays, type TaskStatus } from '@pm/shared';
import { useId } from 'react';
import type { Milestone, Task } from '../../api/types';
import { EmptyState } from '../ui';
import { buildTimelineLayout, ROW_HEIGHT } from './timelineLayout';

const DAY_WIDTH = 24;
const HEADER_HEIGHT = 24;
const TICK_DAYS = 7;

const BAR_COLOR: Record<TaskStatus, string> = {
  TODO: 'fill-slate-400',
  IN_PROGRESS: 'fill-blue-500',
  BLOCKED: 'fill-red-500',
  DONE: 'fill-green-600',
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
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
          <ul className="w-48 shrink-0 border-r border-slate-200" style={{ paddingTop: HEADER_HEIGHT }}>
            {layout.bars.map((bar) => (
              <li key={bar.taskId} className="truncate px-3 text-sm leading-9" style={{ height: ROW_HEIGHT }}>
                <button type="button" className="max-w-full cursor-pointer truncate text-left text-slate-800 hover:underline" onClick={() => onOpen(byId.get(bar.taskId)!)}>
                  {byId.get(bar.taskId)!.title}
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <svg width={width} height={height + HEADER_HEIGHT} role="img" aria-label="Cronograma de tareas">
              <defs>
                <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" className="fill-slate-500" />
                </marker>
              </defs>
              {ticks.map((offset) => (
                <g key={offset}>
                  <line x1={offset * DAY_WIDTH} x2={offset * DAY_WIDTH} y1={0} y2={height + HEADER_HEIGHT} className="stroke-slate-100" />
                  <text x={offset * DAY_WIDTH + 4} y={16} className="fill-slate-500 text-[11px]">
                    {addDays(layout.rangeStart, offset).slice(5)}
                  </text>
                </g>
              ))}
              <g transform={`translate(0 ${HEADER_HEIGHT})`}>
                {layout.milestones.map((milestone) => (
                  <g key={milestone.id}>
                    <line x1={milestone.x} x2={milestone.x} y1={0} y2={height} className="stroke-amber-500" strokeDasharray="4 3" />
                    <title>{milestoneById.get(milestone.id)?.name}</title>
                  </g>
                ))}
                {layout.bars.map((bar) => {
                  const task = byId.get(bar.taskId)!;
                  return (
                    <rect key={bar.taskId} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx={4} className={`cursor-pointer ${BAR_COLOR[task.status]}`} onClick={() => onOpen(task)}>
                      <title>{`${task.title}: ${task.startDate} a ${task.dueDate}`}</title>
                    </rect>
                  );
                })}
                {layout.arrows.map((arrow) => (
                  <path key={`${arrow.from}-${arrow.to}`} d={arrow.path} fill="none" className="stroke-slate-500" strokeWidth={1.5} markerEnd={`url(#${markerId})`} />
                ))}
              </g>
            </svg>
          </div>
        </div>
      )}
      {undatedTasks.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium text-slate-500">Sin fechas completas</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {undatedTasks.map((task) => (
              <li key={task.id}>
                <button type="button" className="cursor-pointer text-slate-800 hover:underline" onClick={() => onOpen(task)}>
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
