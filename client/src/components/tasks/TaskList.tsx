import { LABELS } from '@pm/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Task } from '../../api/types';
import { shortDate } from '../../lib/display';
import { AvatarStack, Badge, Button, EmptyState } from '../ui';
import { PRIORITY_TONE, STATUS_TONE, StepCount, taskPath, WaitingNote } from './TaskCard';

const depthOf = (task: Task) => task.wbsCode.split('.').length;

type Props = {
  /** Todas las tareas del proyecto, en orden EDT. */
  tasks: Task[];
  /** Tareas que cumplen el filtro; sin filtro, todas. Las antecesoras de una coincidencia se muestran atenuadas. */
  matches?: Set<string>;
  emptyText: string;
  canMove?: boolean;
  onMove?: (task: Task, direction: 'up' | 'down') => void;
};

/** Lista de tareas como EDT: código, sangría por nivel, plegar ramas y, para el PM, subir y bajar. */
export function TaskList({ tasks, matches, emptyText, canMove = false, onMove }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ancestorsOf = (task: Task) => {
    const list: string[] = [];
    for (let id = task.parentId; id && byId.has(id); id = byId.get(id)!.parentId) list.push(id);
    return list;
  };
  // Con filtro: las coincidencias y, como contexto, sus antecesoras.
  const context = new Set<string>();
  if (matches) for (const task of tasks) if (matches.has(task.id)) for (const id of ancestorsOf(task)) if (!matches.has(id)) context.add(id);
  const shown = tasks.filter((t) => (!matches || matches.has(t.id) || context.has(t.id)) && !ancestorsOf(t).some((id) => collapsed.has(id)));
  // Hermanas visibles en el orden EDT, para saber si se puede subir o bajar.
  const siblings = (task: Task) => tasks.filter((t) => t.parentId === task.parentId);

  if (shown.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[46rem] border-collapse text-left">
        <thead className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
          <tr>
            <th scope="col" className="px-5 py-3 font-semibold">Tarea</th>
            <th scope="col" className="px-3 py-3 font-semibold">Asignados</th>
            <th scope="col" className="px-3 py-3 font-semibold">Estado</th>
            <th scope="col" className="px-3 py-3 font-semibold">Prioridad</th>
            <th scope="col" className="px-3 py-3 font-semibold">Vence</th>
            <th scope="col" className="px-5 py-3 font-semibold">Avance</th>
            {canMove && (
              <th scope="col" className="px-3 py-3 font-semibold">
                <span className="sr-only">Orden</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {shown.map((task) => {
            const depth = depthOf(task);
            const isOpen = !collapsed.has(task.id);
            const sisters = siblings(task);
            const index = sisters.findIndex((t) => t.id === task.id);
            const summaryText = task.isSummary ? 'text-ink-soft' : 'text-ink-nav';
            return (
              <tr
                key={task.id}
                data-depth={depth}
                {...(context.has(task.id) ? { 'data-context': '' } : {})}
                className={`border-t border-line transition-colors duration-150 hover:bg-raised ${context.has(task.id) ? 'opacity-60' : ''}`}
              >
                <td className="px-5 py-3 align-top">
                  <div className="flex items-start gap-1.5" style={{ paddingLeft: `${(depth - 1) * 1.25}rem` }}>
                    {task.isSummary ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Plegar' : 'Desplegar'} ${task.wbsCode} ${task.title}`}
                        onClick={() => toggle(task.id)}
                        className="mt-0.5 cursor-pointer rounded text-ink-soft hover:text-ink"
                      >
                        {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                      </button>
                    ) : (
                      <span className="inline-block w-4" aria-hidden="true" />
                    )}
                    <span data-wbs-code className="min-w-8 font-mono text-xs leading-6 text-ink-soft">
                      {task.wbsCode}
                    </span>
                    <div>
                      <Link to={taskPath(task)} className="font-semibold text-ink hover:underline">
                        {task.title}
                      </Link>
                      <WaitingNote task={task} />
                      {task.stepsTotal > 0 && <StepCount task={task} />}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <AvatarStack people={task.assignees} />
                </td>
                <td className="px-3 py-3 align-top">
                  <Badge tone={STATUS_TONE[task.status]}>{LABELS.taskStatus[task.status]}</Badge>
                </td>
                <td className="px-3 py-3 align-top">
                  <Badge tone={PRIORITY_TONE[task.priority]}>{LABELS.priority[task.priority]}</Badge>
                </td>
                <td className={`px-3 py-3 align-top whitespace-nowrap ${summaryText}`}>{shortDate(task.dueDate)}</td>
                <td className={`px-5 py-3 align-top ${summaryText}`}>
                  <span {...(task.isSummary ? { 'data-summary': '' } : {})}>{task.progress} %</span>
                </td>
                {canMove && (
                  <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                    <Button variant="ghost" aria-label={`Subir ${task.title}`} disabled={index <= 0} onClick={() => onMove?.(task, 'up')}>
                      Subir
                    </Button>
                    <Button variant="ghost" aria-label={`Bajar ${task.title}`} disabled={index === sisters.length - 1} onClick={() => onMove?.(task, 'down')}>
                      Bajar
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
