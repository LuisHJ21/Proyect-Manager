import { formatMoney, localToday } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../../api/client';
import type { EvmTaskState, Performance, Task } from '../../api/types';
import { ErrorState, Loading } from '../../components/ErrorState';
import { BaselinePanel } from '../../components/performance/BaselinePanel';
import { MetricCards } from '../../components/performance/MetricCards';
import { SCurve } from '../../components/performance/SCurve';
import { tasksKey } from '../../components/tasks/taskQueries';
import { Badge, Button, Card, type Tone } from '../../components/ui';
import { signedDays } from '../../lib/display';
import { useProject } from './ProjectLayout';

export const performanceKey = (projectId: string) => ['project', projectId, 'performance'];

const STATE: Record<EvmTaskState, { label: string; tone: Tone }> = {
  LATE: { label: 'Atrasada', tone: 'danger' },
  ON_TIME: { label: 'A tiempo', tone: 'success' },
  OUTSIDE: { label: 'Fuera de línea base', tone: 'info' },
  DELETED: { label: 'Eliminada', tone: 'neutral' },
};

type BaselineBody = { reason?: string; changeRequestId?: string };

function MissingDates({ projectId, error }: { projectId: string; error: unknown }) {
  if (!error) return null;
  const tasks = error instanceof ApiError && error.code === 'baseline_missing_dates' ? ((error.details?.tasks as { id: string; title: string }[] | undefined) ?? []) : [];
  return (
    <div role="alert" className="mt-4 rounded-md bg-risk-bg px-3 py-2 text-sm text-risk-fg">
      <p>{errorMessage(error)}</p>
      {tasks.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link className="underline" to={`/proyectos/${projectId}/tareas/${t.id}`}>
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskTable({ rows, currency }: { rows: Performance['tasks']; currency: string }) {
  const money = (cents: number | null) => (cents === null ? '—' : formatMoney(cents, currency));
  return (
    <div className="overflow-x-auto">
      <table aria-label="Desempeño por tarea" className="w-full text-left text-sm">
        <thead className="text-xs text-ink-soft uppercase">
          <tr>
            {['Tarea', 'Costo base', 'Avance', 'Valor ganado', 'Gasto ligado', 'Desvío de fin', 'Estado'].map((h) => (
              <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.taskId}>
              <td className="min-w-40 py-2 pr-4 font-medium text-ink [overflow-wrap:break-word]">{row.title}</td>
              <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">{money(row.baselineCostCents)}</td>
              <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">{row.progress === null ? '—' : `${row.progress} %`}</td>
              <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">{money(row.evCents)}</td>
              <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">{money(row.linkedCostCents)}</td>
              <td className="py-2 pr-4 whitespace-nowrap text-ink-nav">{signedDays(row.finishVarianceDays)}</td>
              <td className="py-2 pr-4">
                <Badge tone={STATE[row.state].tone}>{STATE[row.state].label}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Valor ganado del proyecto contra su línea base. Solo para el Project Manager. */
export function PerformancePage() {
  const { project, readOnly } = useProject();
  const queryClient = useQueryClient();
  const currency = project.currency ?? 'USD';
  const performance = useQuery({ queryKey: performanceKey(project.id), queryFn: () => api<Performance>(`/api/projects/${project.id}/performance`) });
  const tasks = useQuery({ queryKey: tasksKey(project.id), queryFn: () => api<Task[]>(`/api/projects/${project.id}/tasks`) });
  const fix = useMutation({
    mutationFn: (body: BaselineBody) => api(`/api/projects/${project.id}/baselines`, { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
  });

  if (performance.isPending) return <Loading />;
  if (performance.isError) return <ErrorState message={errorMessage(performance.error)} onRetry={() => performance.refetch()} />;
  const data = performance.data;

  if (!data.baseline || !data.metrics) {
    // La línea base guarda solo tareas sin subtareas; una padre lleva el costo sumado de sus hijas.
    const costed = tasks.data?.filter((t) => !t.isSummary && (t.plannedCostCents ?? 0) > 0).length;
    return (
      <Card title="Desempeño">
        <p className="max-w-prose text-sm text-ink-nav">
          La línea base es una foto del plan: el costo planeado y las fechas de cada tarea. Al fijarla, podrás comparar lo planeado con lo ganado y lo gastado.
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          {costed === undefined ? 'Contando tareas…' : `${costed} ${costed === 1 ? 'tarea con costo planeado' : 'tareas con costo planeado'}.`}
        </p>
        {!readOnly && (
          <div className="mt-4">
            <Button disabled={fix.isPending} onClick={() => fix.mutate({})}>
              Fijar línea base
            </Button>
          </div>
        )}
        <MissingDates projectId={project.id} error={fix.error} />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <MetricCards metrics={data.metrics} currency={currency} />
      {data.outsideBaselineCostCents > 0 && (
        <p className="text-sm text-ink-soft">
          {`De este costo real, ${formatMoney(data.outsideBaselineCostCents, currency)} no está ligado a tareas de la línea base`}
        </p>
      )}
      <Card title="Curva S">
        <SCurve series={data.series} today={localToday(new Date())} currency={currency} />
      </Card>
      <Card title="Desempeño por tarea">
        {data.outsideBaseline > 0 && (
          <p role="status" className="mb-3 flex items-center gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <TriangleAlert size={16} aria-hidden="true" />
            {data.outsideBaseline === 1
              ? '1 tarea con costo está fuera de la línea base.'
              : `${data.outsideBaseline} tareas con costo están fuera de la línea base.`}
          </p>
        )}
        <TaskTable rows={data.tasks} currency={currency} />
      </Card>
      <BaselinePanel
        readOnly={readOnly}
        projectId={project.id}
        currency={currency}
        baseline={data.baseline}
        history={data.history}
        onFix={async (body) => {
          await fix.mutateAsync(body);
        }}
      />
    </div>
  );
}
