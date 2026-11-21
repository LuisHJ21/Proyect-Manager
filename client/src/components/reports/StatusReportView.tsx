import { formatMoney } from '@pm/shared';
import type { ReactNode } from 'react';
import type { StatusReportSnapshot } from '../../api/types';
import { shortDate } from '../../lib/display';
import { formatIndex } from '../../lib/evmDisplay';
import { RichTextView } from '../richText/RichTextView';
import { Badge, HealthBadge } from '../ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line p-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">{children}</dl>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-ink [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

function Milestones({ label, items }: { label: string; items: { name: string; dueDate: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-ink-soft">{label}</p>
      <ul className="text-sm text-ink">
        {items.map((m) => (
          <li key={`${m.name}-${m.dueDate}`}>{`${m.name} · ${shortDate(m.dueDate)}`}</li>
        ))}
      </ul>
    </div>
  );
}

type Props = {
  report: StatusReportSnapshot;
  period: { periodStart: string; periodEnd: string };
  comment?: string;
  nextSteps?: string;
  preview?: boolean;
};

/** Informe de estado. Las secciones con montos solo aparecen si la API las envió (solo al PM). */
export function StatusReportView({ report, period, comment, nextSteps, preview }: Props) {
  const { progress, performance, budget, milestones, risks, incidents, changes } = report;
  const money = (cents: number | undefined) => (cents === undefined ? '—' : formatMoney(cents, budget?.currency ?? 'USD'));
  const noMilestones = milestones.reached.length + milestones.upcoming.length + milestones.overdue.length === 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-nav">
        {preview && <Badge tone="info">Vista previa</Badge>}
        <span>{`Período: ${shortDate(period.periodStart)} – ${shortDate(period.periodEnd)}`}</span>
        {report.health && <HealthBadge health={report.health} />}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Avance">
          <Rows>
            <Row label="Avance">{`${progress.percent} %`}</Row>
            <Row label="Tareas terminadas">{`${progress.doneTasks} de ${progress.totalTasks}`}</Row>
            <Row label="Vencidas">{progress.overdueTasks}</Row>
            <Row label="Bloqueadas">{progress.blockedTasks}</Row>
          </Rows>
        </Section>
        <Section title="Desempeño">
          {performance ? (
            <Rows>
              <Row label="CPI">{formatIndex(performance.cpi)}</Row>
              <Row label="SPI">{formatIndex(performance.spi)}</Row>
              {performance.eacCents !== undefined && (
                <>
                  <Row label="EV">{money(performance.evCents)}</Row>
                  <Row label="AC">{money(performance.acCents)}</Row>
                  <Row label="EAC">{money(performance.eacCents)}</Row>
                  <Row label="VAC">{money(performance.vacCents)}</Row>
                </>
              )}
            </Rows>
          ) : (
            <p className="text-sm text-ink-nav">Sin línea base</p>
          )}
        </Section>
        {budget && (
          <Section title="Presupuesto">
            <Rows>
              <Row label="Planificado">{money(budget.plannedCents)}</Row>
              <Row label="Real">{money(budget.actualCents)}</Row>
              <Row label="Disponible">
                <span className={budget.varianceCents < 0 ? 'text-danger' : undefined}>{money(budget.varianceCents)}</span>
              </Row>
            </Rows>
          </Section>
        )}
        <Section title="Hitos">
          {noMilestones ? (
            <p className="text-sm text-ink-nav">Sin hitos que informar</p>
          ) : (
            <div className="space-y-2">
              <Milestones label="Alcanzados en el período" items={milestones.reached} />
              <Milestones label="Vencidos" items={milestones.overdue} />
              <Milestones label="Próximos 30 días" items={milestones.upcoming} />
            </div>
          )}
        </Section>
        <Section title="Riesgos principales">
          {risks.top.length === 0 ? (
            <p className="text-sm text-ink-nav">Sin riesgos abiertos</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink">
              {risks.top.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Badge tone={r.high ? 'danger' : 'neutral'}>{r.score}</Badge>
                  <span>{r.description}</span>
                </li>
              ))}
              {risks.openCount > risks.top.length && <li className="text-xs text-ink-soft">{`${risks.openCount} riesgos abiertos en total`}</li>}
            </ul>
          )}
        </Section>
        <Section title="Incidentes y cambios">
          <Rows>
            <Row label="Incidentes abiertos">{incidents.open}</Row>
            <Row label="Incidentes nuevos">{incidents.openedInPeriod}</Row>
            <Row label="Incidentes resueltos">{incidents.resolvedInPeriod}</Row>
            <Row label="Cambios pendientes">{changes.pending}</Row>
            <Row label="Cambios aprobados">{changes.approvedInPeriod}</Row>
            <Row label="Cambios rechazados">{changes.rejectedInPeriod}</Row>
            <Row label="Cambios aplicados">{changes.appliedInPeriod}</Row>
          </Rows>
        </Section>
      </div>
      {comment !== undefined && (
        <Section title="Comentario del PM">
          <RichTextView html={comment} empty="Sin comentario." />
        </Section>
      )}
      {nextSteps !== undefined && (
        <Section title="Próximos pasos">
          <RichTextView html={nextSteps} empty="Sin próximos pasos." />
        </Section>
      )}
    </div>
  );
}
