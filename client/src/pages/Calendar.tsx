import { localToday } from '@pm/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Flag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, isBlockingError } from '../api/client';
import type { CalendarData } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { Button, inputClass, Skeleton } from '../components/ui';
import { buildMonthGrid, groupByDate, monthTitle, shiftMonth, type CalendarEntry, type MonthRef } from '../lib/calendarGrid';
import { projectColor, shortDate } from '../lib/display';
import { useIsMobile } from '../lib/useIsMobile';

const MAX_PER_DAY = 3;
const WEEK_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
type Kind = 'ALL' | 'task' | 'milestone';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'task', label: 'Solo tareas' },
  { value: 'milestone', label: 'Solo hitos' },
];

function currentMonth(today: string): MonthRef {
  const [year, month] = today.split('-').map(Number);
  return { year: year!, month: month! };
}

function EntryLink({ entry, today, wide }: { entry: CalendarEntry; today: string; wide?: boolean }) {
  const base = `flex min-h-6 items-center gap-1.5 overflow-hidden rounded px-1.5 py-0.5 text-xs whitespace-nowrap transition-colors duration-150 ${wide ? 'min-h-10 text-sm' : ''}`;
  if (entry.kind === 'milestone') {
    return (
      <Link to={`/proyectos/${entry.projectId}/resumen`} title={`${entry.name} · ${entry.projectName}`} className={`${base} bg-info-bg font-semibold text-info-fg hover:brightness-125`}>
        <Flag size={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{entry.name}</span>
      </Link>
    );
  }
  const done = entry.status === 'DONE';
  const overdue = !done && entry.dueDate < today;
  const state = overdue ? 'bg-risk-bg font-semibold text-risk-fg' : done ? 'bg-raised text-ink-soft line-through' : 'bg-raised text-ink';
  return (
    <Link
      to={`/proyectos/${entry.projectId}/tareas/${entry.id}`}
      title={`${entry.title} · ${entry.projectName}`}
      aria-label={overdue ? `${entry.title}, vencida` : undefined}
      className={`${base} ${state} hover:brightness-125`}
    >
      {overdue ? (
        <Clock size={12} className="shrink-0" aria-hidden="true" />
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: projectColor(entry.projectId) }} aria-hidden="true" />
      )}
      <span className="truncate">{entry.title}</span>
    </Link>
  );
}

export function CalendarPage() {
  const { isPm } = useAuth();
  const isMobile = useIsMobile();
  const today = localToday(new Date());
  const [month, setMonth] = useState<MonthRef>(() => currentMonth(today));
  const [projectId, setProjectId] = useState('ALL');
  const [personId, setPersonId] = useState('ALL');
  const [kind, setKind] = useState<Kind>('ALL');
  const [showDone, setShowDone] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showUndated, setShowUndated] = useState(false);

  const grid = useMemo(() => buildMonthGrid(month.year, month.month), [month]);
  const from = grid[0]!.date;
  const to = grid[grid.length - 1]!.date;

  const calendar = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api<CalendarData>(`/api/calendar?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  });

  const data = calendar.data;
  const projects = useMemo(() => {
    const found = new Map<string, string>();
    for (const item of [...(data?.tasks ?? []), ...(data?.milestones ?? [])]) found.set(item.projectId, item.projectName);
    return [...found].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [data]);
  const people = useMemo(() => {
    const found = new Map<string, string>();
    for (const task of data?.tasks ?? []) for (const person of task.assignees) found.set(person.id, person.name);
    return [...found].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [data]);

  const days = useMemo(() => {
    const tasks = (data?.tasks ?? [])
      .filter((t) => kind !== 'milestone' && (showDone || t.status !== 'DONE'))
      .filter((t) => projectId === 'ALL' || t.projectId === projectId)
      .filter((t) => personId === 'ALL' || t.assignees.some((a) => a.id === personId))
      .map((t) => ({ kind: 'task' as const, ...t }));
    const milestones = (data?.milestones ?? [])
      .filter((m) => kind !== 'task' && (projectId === 'ALL' || m.projectId === projectId))
      .map((m) => ({ kind: 'milestone' as const, ...m }));
    return groupByDate(tasks, milestones);
  }, [data, kind, showDone, projectId, personId]);

  const undated = data?.undated ?? [];
  const inMonthDays = grid.filter((cell) => cell.inMonth && days.has(cell.date));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-3xl font-semibold tracking-tight text-ink">{monthTitle(month)}</h1>
        <Button variant="secondary" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <Button variant="secondary" onClick={() => setMonth(currentMonth(today))}>
          Hoy
        </Button>
        <Button variant="secondary" aria-label="Mes siguiente" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
        {undated.length > 0 && (
          <Button variant="ghost" className="ml-auto" onClick={() => setShowUndated(true)}>
            {undated.length} {undated.length === 1 ? 'tarea sin fecha' : 'tareas sin fecha'}
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={kind === option.value}
            onClick={() => setKind(option.value)}
            className={`min-h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150 ${kind === option.value ? 'border-primary bg-primary text-white' : 'border-control bg-surface text-ink-nav hover:bg-raised'}`}
          >
            {option.label}
          </button>
        ))}
        <select aria-label="Proyecto" className={`${inputClass} !w-auto`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="ALL">Proyecto: todos</option>
          {projects.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {isPm && (
          <select aria-label="Persona" className={`${inputClass} !w-auto`} value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="ALL">Persona: todas</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <label className="flex min-h-9 items-center gap-2 px-1 text-[13px] text-ink-nav">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Mostrar terminadas
        </label>
      </div>

      {calendar.isPending ? (
        <Skeleton className="h-96" />
      ) : isBlockingError(calendar) ? (
        <ErrorState message={errorMessage(calendar.error)} onRetry={() => calendar.refetch()} />
      ) : (
        <>
          {inMonthDays.length === 0 && <p className="mb-3 text-sm text-ink-soft">No hay actividades en este mes</p>}
          {isMobile ? (
            <div className="space-y-4">
              {inMonthDays.map((cell) => (
                <section key={cell.date}>
                  <h2 className={`mb-1.5 text-sm font-semibold ${cell.date === today ? 'text-link' : 'text-ink'}`}>{shortDate(cell.date)}</h2>
                  <div className="space-y-1">
                    {days.get(cell.date)!.map((entry) => (
                      <EntryLink key={`${entry.kind}-${entry.id}`} entry={entry} today={today} wide />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
              {WEEK_DAYS.map((name) => (
                <div key={name} className="bg-surface px-2.5 py-2 text-xs font-semibold text-ink-soft">
                  {name}
                </div>
              ))}
              {grid.map((cell) => {
                const entries = days.get(cell.date) ?? [];
                const extra = entries.length - MAX_PER_DAY;
                const isToday = cell.date === today;
                return (
                  <div key={cell.date} data-testid={`day-${cell.date}`} className={`flex min-h-28 min-w-0 flex-col gap-1 p-1.5 ${cell.inMonth ? 'bg-page' : 'bg-sidebar'}`}>
                    <span
                      aria-current={isToday ? 'date' : undefined}
                      className={`flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold ${isToday ? 'bg-primary text-white' : cell.inMonth ? 'text-ink-nav' : 'text-ink-soft'}`}
                    >
                      {Number(cell.date.slice(8))}
                    </span>
                    {entries.slice(0, MAX_PER_DAY).map((entry) => (
                      <EntryLink key={`${entry.kind}-${entry.id}`} entry={entry} today={today} />
                    ))}
                    {extra > 0 && (
                      <button type="button" onClick={() => setOpenDay(cell.date)} className="cursor-pointer self-start px-1.5 text-xs font-semibold text-link hover:underline">
                        +{extra} más
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {openDay && (
        <Modal title={shortDate(openDay)} onClose={() => setOpenDay(null)}>
          <div className="space-y-1">
            {(days.get(openDay) ?? []).map((entry) => (
              <EntryLink key={`${entry.kind}-${entry.id}`} entry={entry} today={today} wide />
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={() => setOpenDay(null)}>
              Cerrar
            </Button>
          </div>
        </Modal>
      )}
      {showUndated && (
        <Modal title="Tareas sin fecha" onClose={() => setShowUndated(false)}>
          <ul className="divide-y divide-line">
            {undated.map((task) => (
              <li key={task.id}>
                <Link to={`/proyectos/${task.projectId}/tareas/${task.id}`} className="block py-2.5 hover:underline">
                  <span className="block font-medium text-ink">{task.title}</span>
                  <span className="block text-xs text-ink-soft">{task.projectName}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={() => setShowUndated(false)}>
              Cerrar
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
