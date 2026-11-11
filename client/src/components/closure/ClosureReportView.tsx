import { formatMoney, LABELS } from '@pm/shared';
import type { ReactNode } from 'react';
import type { ClosureReport } from '../../api/types';
import { shortDate, signedDays } from '../../lib/display';
import { formatIndex } from '../../lib/evmDisplay';
import { Badge } from '../ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line p-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </>
  );
}

/** Informe de cierre: lo planificado frente a lo real. `preview` indica que aún no está congelado. */
export function ClosureReportView({ report, preview }: { report: ClosureReport; preview: boolean }) {
  const { dates, budget, performance } = report;
  const money = (cents: number) => formatMoney(cents, budget.currency);
  return (
    <div className="space-y-3">
      {preview && <Badge tone="info">Vista previa</Badge>}
      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Fechas">
          <Row label="Inicio plan">{shortDate(dates.plannedStart)}</Row>
          <Row label="Inicio real">{shortDate(dates.actualStart)}</Row>
          <Row label="Fin plan">{shortDate(dates.plannedEnd)}</Row>
          <Row label="Fin real">{shortDate(dates.actualEnd)}</Row>
          <Row label="Desviación">{dates.endVarianceDays === null ? '—' : signedDays(dates.endVarianceDays)}</Row>
        </Section>
        <Section title="Presupuesto">
          <Row label="Planificado">{money(budget.plannedCents)}</Row>
          <Row label="Real">{money(budget.actualCents)}</Row>
          <Row label="Desviación">
            <span className={budget.varianceCents < 0 ? 'text-danger' : undefined}>{money(budget.varianceCents)}</span>
          </Row>
        </Section>
        <Section title="Desempeño">
          {performance ? (
            <>
              <Row label="CPI">{formatIndex(performance.cpi)}</Row>
              <Row label="SPI">{formatIndex(performance.spi)}</Row>
              <Row label="EAC">{money(performance.eacCents)}</Row>
              <Row label="VAC">{money(performance.vacCents)}</Row>
            </>
          ) : (
            <Row label="Valor ganado">Sin línea base</Row>
          )}
        </Section>
        <Section title="Objetivos">
          <Row label="Cumplidos">{report.objectives.met}</Row>
          <Row label="No cumplidos">{report.objectives.notMet}</Row>
          <Row label="Sin evaluar">{report.objectives.pending}</Row>
        </Section>
        <Section title="Entregables">
          {(['ACCEPTED', 'REJECTED', 'IN_REVIEW', 'PENDING'] as const).map((s) => (
            <Row key={s} label={LABELS.deliverableStatus[s]}>
              {report.deliverables[s]}
            </Row>
          ))}
        </Section>
        <Section title="Cambios">
          <Row label="Aprobados">{report.changes.approved}</Row>
          <Row label="Rechazados">{report.changes.rejected}</Row>
          <Row label="Pendientes">{report.changes.pending}</Row>
        </Section>
        <Section title="Incidentes y riesgos">
          <Row label="Incidentes">{`${report.incidents.total} (${report.incidents.open} abiertos)`}</Row>
          <Row label="Riesgos">{`${report.risks.total} (${report.risks.open} abiertos)`}</Row>
        </Section>
      </div>
    </div>
  );
}
