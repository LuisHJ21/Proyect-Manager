import { diffDays, localToday } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Clock, FileText, Flag, GitPullRequestArrow, PackageCheck, Siren } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, isBlockingError } from '../api/client';
import type { Dashboard } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ErrorState } from '../components/ErrorState';
import { Avatar, AvatarStack, EmptyState, HealthBadge, ProgressBar, Skeleton } from '../components/ui';
import { projectColor, shortDate } from '../lib/display';
import { greeting, longDate } from '../lib/greeting';
import { formatHours } from '../components/tasks/TimeEntries';

type NoteTone = 'soft' | 'risk' | 'ok';
const NOTE_CLASS: Record<NoteTone, string> = { soft: 'text-ink-soft', risk: 'text-risk-fg', ok: 'text-ok-fg' };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function Kpi({ id, label, value, note, tone }: { id: string; label: string; value: number; note: string; tone: NoteTone }) {
  return (
    <div data-testid={`kpi-${id}`} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
      <span className="text-ink-soft">{label}</span>
      <span className="font-display text-3xl font-semibold text-ink">{value}</span>
      <span className={`text-[13px] ${NOTE_CLASS[tone]}`}>{note}</span>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function AttentionList({ items, today }: { items: Dashboard['attention']; today: string }) {
  if (items.length === 0) return <p className="px-5 py-4 text-sm text-ink-soft">Nada requiere atención</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const isTask = item.kind === 'task';
        const days = isTask ? diffDays(item.dueDate!, today) : 0;
        if (item.kind === 'deliverable') {
          return (
            <li key={`deliverable-${item.id}`}>
              <Link to={`/proyectos/${item.projectId}/entregables`} className="flex gap-2.5 px-5 py-3 transition-colors duration-150 hover:bg-raised">
                <PackageCheck size={16} className="mt-0.5 shrink-0 text-risk-fg" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    ENT-{item.number} · {item.title} está vencido
                  </span>
                  <span className="block text-xs text-ink-soft">
                    Comprometido para el {shortDate(item.dueDate)} · {item.projectName}
                  </span>
                </span>
              </Link>
            </li>
          );
        }
        if (item.kind === 'report') {
          return (
            <li key={`report-${item.id}`}>
              <Link to={`/proyectos/${item.projectId}/informes`} className="flex gap-2.5 px-5 py-3 transition-colors duration-150 hover:bg-raised">
                <FileText size={16} className="mt-0.5 shrink-0 text-warn-fg" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{item.title}</span>
                  <span className="block text-xs text-ink-soft">{item.projectName}</span>
                </span>
              </Link>
            </li>
          );
        }
        if (item.kind === 'change') {
          return (
            <li key={`change-${item.id}`}>
              <Link to={`/proyectos/${item.projectId}/cambios`} className="flex gap-2.5 px-5 py-3 transition-colors duration-150 hover:bg-raised">
                <GitPullRequestArrow size={16} className="mt-0.5 shrink-0 text-warn-fg" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    CR-{item.number} · {item.title}
                  </span>
                  <span className="block text-xs text-ink-soft">Aprobado sin aplicar · {item.projectName}</span>
                </span>
              </Link>
            </li>
          );
        }
        if (item.kind === 'incident') {
          return (
            <li key={`incident-${item.id}`}>
              <Link to={`/proyectos/${item.projectId}/incidentes`} className="flex gap-2.5 px-5 py-3 transition-colors duration-150 hover:bg-raised">
                <Siren size={16} className="mt-0.5 shrink-0 text-risk-fg" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    INC-{item.number} · {item.title}
                  </span>
                  <span className="block text-xs text-ink-soft">
                    {item.overdue ? 'Vencido' : 'Prioridad alta'} · {item.projectName}
                  </span>
                </span>
              </Link>
            </li>
          );
        }
        return (
          <li key={`${item.kind}-${item.id}`}>
            <Link
              to={isTask ? `/proyectos/${item.projectId}/tareas/${item.id}` : `/proyectos/${item.projectId}/riesgos`}
              className="flex gap-2.5 px-5 py-3 transition-colors duration-150 hover:bg-raised"
            >
              {isTask ? (
                <Clock size={16} className="mt-0.5 shrink-0 text-risk-fg" aria-hidden="true" />
              ) : (
                <CircleAlert size={16} className="mt-0.5 shrink-0 text-warn-fg" aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="block font-medium text-ink">{item.title}</span>
                <span className="block text-xs text-ink-soft">
                  {isTask ? `Venció hace ${plural(days, 'día', 'días')}` : `Riesgo alto, puntaje ${item.score}`} · {item.projectName}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/api/dashboard') });
  const now = new Date();
  const today = localToday(now);

  const header = (
    <div className="mb-7">
      <p className="mb-1 text-ink-soft">{longDate(now)}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{greeting(now, user?.name ?? '')}</h1>
    </div>
  );

  if (dashboard.isPending) {
    return (
      <>
        {header}
        <div role="status" aria-label="Cargando" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-32" />
          ))}
          <Skeleton className="h-72 sm:col-span-2 xl:col-span-4" />
        </div>
      </>
    );
  }
  if (isBlockingError(dashboard)) {
    return (
      <>
        {header}
        <ErrorState message={errorMessage(dashboard.error)} onRetry={() => dashboard.refetch()} />
      </>
    );
  }

  const { totals, projects, attention, workload, upcomingMilestones } = dashboard.data!;

  if (totals.activeProjects === 0) {
    return (
      <>
        {header}
        <EmptyState>Aún no hay proyectos activos. Crea tu primer proyecto con el botón «Nuevo proyecto».</EmptyState>
      </>
    );
  }

  const maxLoad = Math.max(...workload.map((w) => w.openTasks), 1);

  return (
    <>
      {header}
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi id="activeProjects" label="Proyectos activos" value={totals.activeProjects} note={`${totals.atRiskProjects} en riesgo`} tone="soft" />
          <Kpi
            id="overdueTasks"
            label="Tareas vencidas"
            value={totals.overdueTasks}
            note={totals.overdueTasks > 0 ? `en ${plural(totals.overdueProjects, 'proyecto', 'proyectos')}` : 'todo al día'}
            tone={totals.overdueTasks > 0 ? 'risk' : 'ok'}
          />
          <Kpi id="highRisks" label="Riesgos altos" value={totals.highRisks} note={totals.highRisks > 0 ? 'sin cerrar' : 'ninguno abierto'} tone={totals.highRisks > 0 ? 'risk' : 'ok'} />
          <Kpi
            id="overBudgetProjects"
            label="Sobre presupuesto"
            value={totals.overBudgetProjects}
            note={totals.overBudgetProjects > 0 ? plural(totals.overBudgetProjects, 'proyecto', 'proyectos') : 'todos dentro del plan'}
            tone={totals.overBudgetProjects > 0 ? 'risk' : 'ok'}
          />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <Section title="Salud de los proyectos" action={<Link to="/proyectos" className="font-semibold text-link hover:underline">Ver todos</Link>}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left">
                  <thead>
                    <tr className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
                      <th className="px-5 py-3 font-semibold">Proyecto</th>
                      <th className="px-3 py-3 font-semibold">Equipo</th>
                      <th className="px-3 py-3 font-semibold">Avance</th>
                      <th className="px-3 py-3 font-semibold">Salud</th>
                      <th className="px-5 py-3 font-semibold">Fin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr key={project.id} className="border-t border-line">
                        <td className="px-5 py-3">
                          <Link to={`/proyectos/${project.id}/resumen`} className="flex items-center gap-2.5 font-semibold text-ink hover:underline">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: projectColor(project.id) }} aria-hidden="true" />
                            {project.name}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <AvatarStack people={project.team} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-28">
                              <ProgressBar value={project.progress} label={`Avance de ${project.name}`} color={projectColor(project.id)} />
                            </div>
                            <span className="text-[13px] text-ink-nav">{project.progress} %</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">{project.health && <HealthBadge health={project.health} />}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-ink-nav">{shortDate(project.endDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Carga del equipo">
              {workload.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-soft">Ningún colaborador tiene tareas abiertas</p>
              ) : (
                <ul className="divide-y divide-line">
                  {workload.map((person) => (
                    <li key={person.userId} className="grid items-center gap-x-4 gap-y-2 px-5 py-3 text-[13px] sm:grid-cols-[11rem_1fr_11rem]">
                      <span className="flex min-w-0 items-center gap-2 text-ink">
                        <Avatar name={person.name} />
                        <span className="truncate">{person.name}</span>
                      </span>
                      <ProgressBar value={Math.round((person.openTasks / maxLoad) * 100)} label={`Carga de ${person.name}`} />
                      <span className="text-ink-nav">
                        {plural(person.openTasks, 'abierta', 'abiertas')}
                        {person.overdueTasks > 0 && <span className="font-semibold text-risk-fg"> · {plural(person.overdueTasks, 'vencida', 'vencidas')}</span>}
                      </span>
                      {person.weeks && person.weeks.length > 0 && (
                        <ul aria-label={`Carga semanal de ${person.name}`} className="grid grid-cols-2 gap-2 sm:col-span-3 sm:grid-cols-4">
                          {person.weeks.map((week) => (
                            <li key={week.start} className={`rounded-md px-2 py-1 text-xs ${week.overloaded ? 'bg-risk-bg text-risk-fg' : 'bg-raised text-ink-nav'}`}>
                              <span className="block text-ink-soft">Semana del {shortDate(week.start)}</span>
                              <span className="font-medium">{`${formatHours(week.assignedHours)} / ${formatHours(week.capacityHours)}`}</span>
                              {week.overloaded && <span className="block font-semibold">Sobrecargada</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Section title="Requiere atención">
              <AttentionList items={attention} today={today} />
            </Section>
            <Section title="Próximos hitos">
              {upcomingMilestones.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-soft">Sin hitos en los próximos 14 días</p>
              ) : (
                <ul className="divide-y divide-line">
                  {upcomingMilestones.map((milestone) => (
                    <li key={milestone.id} className="flex gap-2.5 px-5 py-3">
                      <Flag size={16} className="mt-0.5 shrink-0 text-link" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block font-medium text-ink">{milestone.name}</span>
                        <span className="block text-xs text-ink-soft">
                          {shortDate(milestone.dueDate)} · {milestone.projectName}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      </div>
    </>
  );
}
