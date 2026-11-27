import { LABELS } from '@pm/shared';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Network, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Task } from '../../api/types';
import { shortDate } from '../../lib/display';
import { Badge, Button, EmptyState, inputClass, ProgressBar } from '../ui';
import { taskPath } from './TaskCard';

const STATUS_TONE = { TODO: 'neutral', IN_PROGRESS: 'info', BLOCKED: 'danger', DONE: 'success' } as const;

/** EDT visual: filas compactas por nivel, con las ramas en el orden guardado. */
export function WbsGraph({ tasks }: { tasks: Task[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  if (tasks.length === 0) return <EmptyState>Aún no hay tareas en la EDT.</EmptyState>;

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const roots = tasks.filter((task) => !task.parentId || !byId.has(task.parentId));
  const parents = tasks.filter((task) => task.isSummary);
  const query = search.trim().toLocaleLowerCase();
  const matches = new Set(tasks.filter((task) => !query || `${task.wbsCode} ${task.title}`.toLocaleLowerCase().includes(query)).map((task) => task.id));
  const context = new Set<string>();
  if (query) for (const task of tasks) if (matches.has(task.id)) {
    for (let id = task.parentId; id && byId.has(id); id = byId.get(id)!.parentId) context.add(id);
  }
  const visible = tasks.filter((task) => {
    if (query && !matches.has(task.id) && !context.has(task.id)) return false;
    if (query) return true;
    for (let id = task.parentId; id && byId.has(id); id = byId.get(id)!.parentId) if (collapsed.has(id)) return false;
    return true;
  });
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allCollapsed = parents.length > 0 && parents.every((task) => collapsed.has(task.id));
  const completed = tasks.filter((task) => task.status === 'DONE').length;

  return <section aria-label="Gráfico de la EDT" className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Network size={18} className="text-link" aria-hidden="true" /> Estructura del trabajo</div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:w-52"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" /><input className={`${inputClass} pl-9`} type="search" aria-label="Buscar en la EDT" placeholder="Buscar tarea…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {parents.length > 0 && <Button variant="secondary" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(parents.map((task) => task.id)))} aria-label={allCollapsed ? 'Expandir todas las fases' : 'Plegar todas las fases'}>{allCollapsed ? <ChevronsUpDown size={16} aria-hidden="true" /> : <ChevronsDownUp size={16} aria-hidden="true" />}<span className="hidden sm:inline">{allCollapsed ? 'Expandir todo' : 'Plegar todo'}</span></Button>}
      </div>
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_6rem] border-b border-line bg-raised px-4 py-2 text-[11px] font-semibold tracking-wide text-ink-soft uppercase sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_8rem]">
      <span>Tarea / fase</span><span className="hidden sm:block">Inicio</span><span className="hidden sm:block">Fin</span><span className="hidden sm:block">Estado</span><span className="text-right">Avance</span>
    </div>
    {visible.length === 0 ? <p className="px-4 py-8 text-center text-sm text-ink-soft">No hay tareas coincidentes.</p> : <ul>
      {visible.map((task, index) => {
        const depth = Math.max(0, task.wbsCode.split('.').length - 1);
        const expanded = !collapsed.has(task.id);
        return <li key={task.id} data-depth={depth + 1} className={`grid min-h-14 grid-cols-[minmax(0,1fr)_6rem] items-center gap-x-2 border-b border-line px-4 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_8rem] ${task.isSummary ? 'bg-raised/70' : index % 2 ? 'bg-surface' : 'bg-raised/30'} ${query && !matches.has(task.id) ? 'opacity-65' : ''}`}>
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `min(${depth * 1.25}rem, 5rem)` }}>
            {task.isSummary ? <button type="button" aria-label={`${expanded ? 'Plegar' : 'Desplegar'} ${task.title}`} aria-expanded={query ? true : expanded} onClick={() => toggle(task.id)} disabled={Boolean(query)} className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-soft hover:bg-active hover:text-link disabled:cursor-default">{expanded || query ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}</button> : <span className="w-8 shrink-0 border-b border-line" aria-hidden="true" />}
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold ${task.isSummary ? 'bg-primary text-white' : 'bg-active text-link'}`}>{task.wbsCode}</span>
            <div className="min-w-0"><Link to={taskPath(task)} className={`block truncate hover:text-link hover:underline ${task.isSummary ? 'font-semibold text-ink' : 'text-ink-nav'}`} title={task.title}>{task.title}</Link>{task.isSummary && <span className="text-[11px] text-ink-soft">{task.childCount} {task.childCount === 1 ? 'subtarea' : 'subtareas'}</span>}</div>
          </div>
          <span className="hidden text-xs text-ink-soft sm:block">{shortDate(task.startDate)}</span><span className="hidden text-xs text-ink-soft sm:block">{shortDate(task.dueDate)}</span>
          <span className="hidden sm:block"><Badge tone={STATUS_TONE[task.status]}>{LABELS.taskStatus[task.status]}</Badge></span>
          <div className="flex min-w-0 items-center justify-end gap-2"><div className="hidden min-w-0 flex-1 sm:block"><ProgressBar value={task.progress} label={`Avance de ${task.title}`} /></div><span className="shrink-0 text-xs font-semibold text-ink">{task.progress} %</span></div>
        </li>;
      })}
    </ul>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-raised px-4 py-3 text-xs text-ink-nav"><span>{roots.length} {roots.length === 1 ? 'fase o tarea raíz' : 'fases o tareas raíz'} · {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}</span><span>{completed} completadas · {parents.length} {parents.length === 1 ? 'grupo' : 'grupos'}</span></div>
  </section>;
}
