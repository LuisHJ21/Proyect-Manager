import { formatMoney, HEALTH, LABELS, PROJECT_STATUS } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, isBlockingError } from '../../api/client';
import type { Project } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorState } from '../../components/ErrorState';
import { AvatarStack, Button, EmptyState, HealthBadge, inputClass, PageHeader, ProgressBar, Skeleton } from '../../components/ui';
import { projectColor, shortDate } from '../../lib/display';
import { budgetPercent, filterProjects, sortProjects, type ProjectSortKey, type SortDirection } from '../../lib/projectList';

const NEAR_BUDGET_PERCENT = 90;
const INITIAL_FILTERS = { search: '', status: 'ACTIVE', health: 'ALL' };

function SortHeader({ label, sortKey, sort, onSort, className = '' }: { label: string; sortKey: ProjectSortKey; sort: { key: ProjectSortKey; direction: SortDirection }; onSort: (key: ProjectSortKey) => void; className?: string }) {
  const active = sort.key === sortKey;
  const Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined} className={`py-3 font-semibold ${className}`}>
      <button type="button" aria-label={`Ordenar por ${label.toLowerCase()}`} onClick={() => onSort(sortKey)} className={`inline-flex cursor-pointer items-center gap-1 uppercase ${active ? 'text-link' : 'hover:text-ink'}`}>
        {label}
        {active && <Icon size={12} aria-hidden="true" />}
      </button>
    </th>
  );
}

function Alerts({ project }: { project: Project }) {
  const overdue = project.overdueTasks ?? 0;
  const risks = project.highRisks ?? 0;
  if (overdue === 0 && risks === 0) return <span className="text-ink-soft">Sin alertas</span>;
  return (
    <>
      {overdue > 0 && <span className="block font-semibold text-risk-fg">{overdue} {overdue === 1 ? 'vencida' : 'vencidas'}</span>}
      {risks > 0 && <span className="block font-semibold text-warn-fg">{risks} {risks === 1 ? 'riesgo alto' : 'riesgos altos'}</span>}
    </>
  );
}

function Budget({ project }: { project: Project }) {
  const planned = project.plannedBudgetCents ?? 0;
  const spent = project.spentCents ?? 0;
  const percent = budgetPercent(spent, planned);
  const currency = project.currency ?? 'USD';
  return (
    <div className="min-w-44">
      <ProgressBar value={percent} label={`Presupuesto de ${project.name}`} tone={percent >= NEAR_BUDGET_PERCENT ? 'warning' : undefined} />
      <p className="mt-1 text-xs text-ink-soft">
        {formatMoney(spent, currency)} de {formatMoney(planned, currency)}
      </p>
    </div>
  );
}

export function ProjectListPage() {
  const { isPm } = useAuth();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/api/projects') });
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sort, setSort] = useState<{ key: ProjectSortKey; direction: SortDirection }>({ key: isPm ? 'health' : 'name', direction: 'asc' });

  const onSort = (key: ProjectSortKey) =>
    setSort((current) => (current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));

  const all = projects.data ?? [];
  const visible = sortProjects(filterProjects(all, filters), sort.key, sort.direction);

  let body: ReactNode;
  if (projects.isPending) {
    body = <Skeleton className="h-64" />;
  } else if (isBlockingError(projects)) {
    body = <ErrorState message={errorMessage(projects.error)} onRetry={() => projects.refetch()} />;
  } else if (all.length === 0) {
    body = <EmptyState>{isPm ? 'Aún no hay proyectos. Crea el primero con el botón «Nuevo proyecto».' : 'Todavía no eres miembro de ningún proyecto.'}</EmptyState>;
  } else if (visible.length === 0) {
    body = (
      <EmptyState>
        <p className="mb-3">Ningún proyecto coincide con los filtros.</p>
        <Button variant="secondary" onClick={() => setFilters(INITIAL_FILTERS)}>
          Limpiar filtros
        </Button>
      </EmptyState>
    );
  } else {
    body = (
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-surface">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface text-xs tracking-wide text-ink-soft uppercase">
            <tr>
              <SortHeader label="Proyecto" sortKey="name" sort={sort} onSort={onSort} className="px-5" />
              {isPm && <SortHeader label="Salud" sortKey="health" sort={sort} onSort={onSort} className="px-3" />}
              <SortHeader label="Avance" sortKey="progress" sort={sort} onSort={onSort} className="px-3" />
              {isPm && <th scope="col" className="px-3 py-3 font-semibold">Presupuesto</th>}
              <SortHeader label="Fin" sortKey="endDate" sort={sort} onSort={onSort} className="px-3" />
              <th scope="col" className="px-3 py-3 font-semibold">Equipo</th>
              {isPm && <th scope="col" className="px-5 py-3 font-semibold">Alertas</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((project) => (
              <tr key={project.id} className="border-t border-line transition-colors duration-150 hover:bg-raised">
                <td className="px-5 py-3">
                  <Link to={`/proyectos/${project.id}/resumen`} className="flex items-center gap-2.5 font-semibold text-ink hover:underline">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: projectColor(project.id) }} aria-hidden="true" />
                    {project.name}
                  </Link>
                  <span className="ml-5 text-xs text-ink-soft">{LABELS.projectStatus[project.status]}</span>
                </td>
                {isPm && <td className="px-3 py-3">{project.health ? <HealthBadge health={project.health} /> : <span className="text-ink-soft">—</span>}</td>}
                <td className="px-3 py-3">
                  <div className="flex min-w-32 items-center gap-2.5">
                    <div className="flex-1">
                      <ProgressBar value={project.progress ?? 0} label={`Avance de ${project.name}`} color={projectColor(project.id)} />
                    </div>
                    <span className="text-[13px] text-ink-nav">{project.progress ?? 0} %</span>
                  </div>
                </td>
                {isPm && (
                  <td className="px-3 py-3">
                    <Budget project={project} />
                  </td>
                )}
                <td className="px-3 py-3 whitespace-nowrap text-ink-nav">{shortDate(project.endDate)}</td>
                <td className="px-3 py-3">
                  <AvatarStack people={project.team ?? []} />
                </td>
                {isPm && (
                  <td className="px-5 py-3 text-[13px] whitespace-nowrap">
                    <Alerts project={project} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Proyectos" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar proyectos"
            placeholder="Buscar por nombre"
            className={`${inputClass} pl-9`}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <select aria-label="Estado" className={`${inputClass} !w-auto`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="ACTIVE">Activos</option>
          <option value="ALL">Todos</option>
          {PROJECT_STATUS.map((status) => (
            <option key={status} value={status}>
              {LABELS.projectStatus[status]}
            </option>
          ))}
        </select>
        {isPm && (
          <select aria-label="Salud" className={`${inputClass} !w-auto`} value={filters.health} onChange={(e) => setFilters({ ...filters, health: e.target.value })}>
            <option value="ALL">Salud: todas</option>
            {HEALTH.map((health) => (
              <option key={health} value={health}>
                {LABELS.health[health]}
              </option>
            ))}
          </select>
        )}
        {!projects.isPending && all.length > 0 && (
          <span className="ml-auto text-[13px] text-ink-soft">
            {visible.length} de {all.length} proyectos
          </span>
        )}
      </div>
      {body}
    </>
  );
}
