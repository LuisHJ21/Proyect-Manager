import { formatMoney } from '@pm/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorMessage } from '../../api/client';
import type { Indicators } from '../../api/types';
import { ErrorState, Loading } from '../ErrorState';
import { ProgressBar } from '../ui';

function Stat({ label, value, testId, children, alert }: { label: string; value: ReactNode; testId?: string; children?: ReactNode; alert?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p data-testid={testId} className={`mt-1 text-2xl font-semibold ${alert ? 'text-risk-fg' : 'text-ink'}`}>
        {value}
      </p>
      {children}
    </div>
  );
}

export function IndicatorCards({ query, currency = 'USD' }: { query: UseQueryResult<Indicators>; currency?: string }) {
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const data = query.data;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avance" value={`${data.progress} %`} testId="indicator-progress">
          <div className="mt-2">
            <ProgressBar value={data.progress} />
          </div>
        </Stat>
        <Stat label="Tareas vencidas" value={data.overdueTasks} alert={data.overdueTasks > 0} />
        <Stat label="Tareas bloqueadas" value={data.blockedTasks} alert={data.blockedTasks > 0} />
        {data.highRisks !== undefined && <Stat label="Riesgos altos" value={data.highRisks} alert={data.highRisks > 0} />}
      </div>
      {data.budget && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Presupuesto planificado" value={formatMoney(data.budget.plannedCents, currency)} />
          <Stat label="Presupuesto gastado" value={formatMoney(data.budget.spentCents, currency)} />
          <Stat label="Diferencia" value={formatMoney(data.budget.differenceCents, currency)} alert={data.budget.differenceCents < 0} />
        </div>
      )}
      {data.upcomingMilestones.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-xs font-medium text-ink-soft">Próximos hitos (14 días)</p>
          <ul className="space-y-1 text-sm text-ink">
            {data.upcomingMilestones.map((milestone) => (
              <li key={milestone.id}>
                {milestone.dueDate} · {milestone.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
