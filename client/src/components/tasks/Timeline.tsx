import { addDays, diffDays, localToday, type TaskStatus } from '@pm/shared';
import { CalendarDays, Maximize2, Minus, Plus } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { Milestone, Schedule, Task } from '../../api/types';
import { shortDate } from '../../lib/display';
import { Badge, Button, EmptyState } from '../ui';
import { buildTimelineLayout, ROW_HEIGHT } from './timelineLayout';

const ZOOMS = [18, 26, 36, 48];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const STATUS_LABEL: Record<TaskStatus, string> = { TODO: 'Pendiente', IN_PROGRESS: 'En progreso', BLOCKED: 'Bloqueada', DONE: 'Completada' };
const STATUS_TONE: Record<TaskStatus, 'neutral' | 'info' | 'danger' | 'success'> = { TODO: 'neutral', IN_PROGRESS: 'info', BLOCKED: 'danger', DONE: 'success' };

const BAR_COLOR: Record<TaskStatus, string> = {
  TODO: 'fill-ink-soft',
  IN_PROGRESS: 'fill-link',
  BLOCKED: 'fill-risk-fg',
  DONE: 'fill-ok-fg',
};

export function Timeline({ tasks, milestones, onOpen, schedule }: { tasks: Task[]; milestones: Milestone[]; onOpen: (task: Task) => void; schedule?: Schedule }) {
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const dayWidth = ZOOMS[zoom]!;
  const scheduleOf = new Map((schedule?.tasks ?? []).map((t) => [t.id, t]));
  const markerId = useId();
  const layout = buildTimelineLayout(tasks, milestones, dayWidth);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  const undatedTasks = layout.undated.map((id) => byId.get(id)!);

  const totalDays = layout.rangeStart ? diffDays(layout.rangeStart, layout.rangeEnd) + 1 : 0;
  const width = totalDays * dayWidth;
  const rows = Math.max(layout.bars.length, 1);
  const height = rows * ROW_HEIGHT;
  const days = Array.from({ length: totalDays }, (_, offset) => ({ offset, date: addDays(layout.rangeStart, offset) }));
  const weeks = days.reduce<{ start: number; count: number; label: string }[]>((groups, { offset, date }) => {
    const [year, month, day] = date.split('-').map(Number);
    if (new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay() === 1 || groups.length === 0) groups.push({ start: offset, count: 0, label: `${MONTHS[month! - 1]} ${year}` });
    groups[groups.length - 1]!.count++;
    return groups;
  }, []);
  const today = localToday(new Date());
  const todayOffset = layout.rangeStart && today >= layout.rangeStart && today <= layout.rangeEnd ? diffDays(layout.rangeStart, today) : -1;
  const planned = tasks.filter((task) => task.startDate && task.dueDate);
  const progress = planned.length ? Math.round(planned.reduce((sum, task) => sum + task.progress, 0) / planned.length) : 0;

  return (
    <div className="space-y-4">
      {totalDays === 0 ? (
        <EmptyState>Asigna fechas de inicio y límite a las tareas para verlas en el cronograma.</EmptyState>
      ) : (
        <section aria-label="Diagrama de Gantt" className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Escala del cronograma">
              <Button variant="secondary" aria-label="Alejar cronograma" disabled={zoom === 0} onClick={() => setZoom((value) => Math.max(0, value - 1))}><Minus size={16} aria-hidden="true" /> Alejar</Button>
              <Button variant="secondary" aria-label="Acercar cronograma" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((value) => Math.min(ZOOMS.length - 1, value + 1))}><Plus size={16} aria-hidden="true" /> Acercar</Button>
              <Button variant="secondary" onClick={() => { setZoom(1); scroller.current?.scrollTo({ left: 0, behavior: 'smooth' }); }}><Maximize2 size={16} aria-hidden="true" /> Vista inicial</Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-nav" aria-label="Leyenda de estados">
              {(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as TaskStatus[]).map((status) => <span key={status} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${status === 'DONE' ? 'bg-ok-fg' : status === 'IN_PROGRESS' ? 'bg-link' : status === 'BLOCKED' ? 'bg-risk-fg' : 'bg-ink-soft'}`} />{STATUS_LABEL[status]}</span>)}
            </div>
          </div>
          <div ref={scroller} className="max-w-full overflow-x-auto" tabIndex={0} aria-label="Cronograma desplazable horizontalmente">
          <div className="flex min-w-max">
          <div className="sticky left-0 z-10 w-48 shrink-0 border-r border-line bg-surface sm:w-[27rem]">
            <div className="flex h-16 items-end border-b border-line bg-raised px-3 pb-2 text-[11px] font-semibold text-ink-soft uppercase"><span className="min-w-0 flex-1">Tarea</span><span className="hidden w-[5.5rem] sm:block">Inicio</span><span className="hidden w-[5.5rem] sm:block">Fin</span><span className="hidden w-[6rem] text-right sm:block">Estado</span></div>
            <ul>
            {layout.bars.map((bar) => (
              <li key={bar.taskId} className={`flex items-center gap-1 border-b border-line px-3 text-xs ${bar.summary ? 'bg-raised font-semibold' : ''}`} style={{ height: ROW_HEIGHT }}>
                <button type="button" title={byId.get(bar.taskId)!.title} aria-label={byId.get(bar.taskId)!.title} className="min-w-0 flex-1 truncate text-left text-ink hover:text-link hover:underline" onClick={() => onOpen(byId.get(bar.taskId)!)}>
                  {byId.get(bar.taskId)!.wbsCode} · {byId.get(bar.taskId)!.title}
                </button>
                <span className="hidden w-[5.5rem] shrink-0 text-ink-soft sm:block">{shortDate(byId.get(bar.taskId)!.startDate)}</span>
                <span className="hidden w-[5.5rem] shrink-0 text-ink-soft sm:block">{shortDate(byId.get(bar.taskId)!.dueDate)}</span>
                <span className="hidden w-[6rem] shrink-0 text-right sm:block"><Badge tone={STATUS_TONE[byId.get(bar.taskId)!.status]}>{STATUS_LABEL[byId.get(bar.taskId)!.status]}</Badge></span>
              </li>
            ))}
            </ul>
          </div>
          <div className="shrink-0" style={{ width }}>
            <div className="h-16 border-b border-line bg-raised"><div className="flex h-8 border-b border-line">{weeks.map((week) => <div key={week.start} className="truncate border-r border-line px-2 py-2 text-xs font-semibold text-ink-nav" style={{ width: week.count * dayWidth }}>{week.label}</div>)}</div><div className="flex h-8">{days.map(({ date }) => <div key={date} className={`flex shrink-0 items-center justify-center border-r border-line text-[11px] ${date === today ? 'bg-risk-bg font-bold text-risk-fg' : 'text-ink-soft'}`} style={{ width: dayWidth }} title={shortDate(date)}>{Number(date.slice(-2))}</div>)}</div></div>
            <svg width={width} height={height} role="img" aria-label="Barras y dependencias del cronograma" className="block">
              <defs>
                <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" className="fill-ink-soft" />
                </marker>
              </defs>
              {layout.bars.map((bar, index) => <rect key={`row-${bar.taskId}`} x={0} y={index * ROW_HEIGHT} width={width} height={ROW_HEIGHT} className={index % 2 ? 'fill-surface' : 'fill-raised'} />)}
              {days.map(({ date, offset }) => <line key={date} x1={offset * dayWidth} x2={offset * dayWidth} y1={0} y2={height} className="stroke-line" strokeWidth={1} />)}
              {layout.arrows.map((arrow) => <path key={`${arrow.from}-${arrow.to}`} d={arrow.path} fill="none" className="stroke-ink-soft" strokeWidth={1.5} markerEnd={`url(#${markerId})`} />)}
                {layout.milestones.map((milestone) => (
                  <g key={milestone.id}>
                    <line x1={milestone.x} x2={milestone.x} y1={0} y2={height} className="stroke-warn-fg" strokeDasharray="4 3" />
                    <title>{milestoneById.get(milestone.id)?.name}</title>
                  </g>
                ))}
                {layout.bars.map((bar) => {
                  const task = byId.get(bar.taskId)!;
                  return (
                    <g key={bar.taskId}>
                    <rect
                      x={bar.x + 2}
                      y={bar.y}
                      width={Math.max(2, bar.width - 4)}
                      height={bar.height}
                      rx={bar.summary ? 3 : 5}
                      {...(bar.summary ? { 'data-summary': '' } : {})}
                      {...(scheduleOf.get(task.id)?.critical ? { 'data-critical': '' } : {})}
                      className={`cursor-pointer ${bar.summary ? 'fill-primary' : BAR_COLOR[task.status]} ${scheduleOf.get(task.id)?.critical ? 'stroke-risk-fg stroke-2' : ''}`}
                      onClick={() => onOpen(task)}
                    >
                      <title>{`${task.title}: ${task.startDate} a ${task.dueDate}${scheduleOf.has(task.id) ? ` · Holgura: ${scheduleOf.get(task.id)!.totalFloat} d` : ''}`}</title>
                    </rect>
                    {bar.width >= 100 && !bar.summary && <text x={bar.x + 9} y={bar.y + bar.height / 2 + 4} className="pointer-events-none fill-white text-[10px] font-semibold">{task.title.length > Math.floor(bar.width / 8) ? `${task.title.slice(0, Math.max(1, Math.floor(bar.width / 8) - 1))}…` : task.title}</text>}
                    </g>
                  );
                })}
              {todayOffset >= 0 && <line x1={(todayOffset + 0.5) * dayWidth} x2={(todayOffset + 0.5) * dayWidth} y1={0} y2={height} className="stroke-risk-fg" strokeWidth={2} strokeDasharray="5 3" />}
            </svg>
          </div>
        </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line bg-raised px-4 py-3 text-sm text-ink-nav">
          <span className="inline-flex items-center gap-2"><CalendarDays size={16} aria-hidden="true" /> {totalDays} días · {shortDate(layout.rangeStart)} – {shortDate(layout.rangeEnd)}</span>
          <span>{planned.length} tareas programadas · Avance promedio <strong className="text-ink">{progress} %</strong></span>
          {(schedule?.critical.length ?? 0) > 0 && <span className="inline-flex items-center gap-2 text-xs"><span className="h-3 w-6 rounded border-2 border-risk-fg" aria-hidden="true" /> Ruta crítica</span>}
        </div>
        </section>
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
