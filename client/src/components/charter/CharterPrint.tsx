import { LABELS, localToday } from '@pm/shared';
import type { CharterVersionContent } from '../../api/types';
import { shortDate } from '../../lib/display';
import { RichTextView } from '../richText/RichTextView';

export const CHARTER_FIELDS = [
  { name: 'sponsor', label: 'Patrocinador', rows: 1 },
  { name: 'justification', label: 'Justificación', rows: 4 },
  { name: 'scopeIncluded', label: 'Alcance incluido', rows: 4 },
  { name: 'scopeExcluded', label: 'Alcance excluido', rows: 3 },
  { name: 'boundaries', label: 'Límites', rows: 3 },
  { name: 'assumptions', label: 'Supuestos', rows: 3 },
  { name: 'constraints', label: 'Restricciones', rows: 3 },
  { name: 'successCriteria', label: 'Criterios de éxito', rows: 4 },
] as const;

/** «Versión 2 · aprobada el 10 nov 2026 por Paula». */
export function versionHeading(number: number | null, approvedAt: string | null, approvedBy: { name: string } | null): string {
  if (!approvedAt) return 'Borrador sin aprobar';
  const when = `aprobada el ${shortDate(localToday(new Date(approvedAt)))} por ${approvedBy?.name ?? 'una cuenta eliminada'}`;
  return number === null ? `Acta ${when}` : `Versión ${number} · ${when}`;
}

/** Campos del acta, y objetivos e hitos si la versión los congeló. */
export function CharterContent({ content }: { content: CharterVersionContent }) {
  return (
    <div className="space-y-4">
      <dl className="space-y-4">
        {CHARTER_FIELDS.map((field) => (
          <div key={field.name}>
            <dt className="text-xs font-medium text-ink-soft">{field.label}</dt>
            <dd className="mt-0.5">
              {field.rows === 1 ? <span className="text-sm text-ink">{content[field.name] || '—'}</span> : <RichTextView html={content[field.name] ?? ''} />}
            </dd>
          </div>
        ))}
      </dl>
      {content.objectives && content.objectives.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">Objetivos</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
            {content.objectives.map((o, i) => (
              <li key={i}>
                <span>{o.description}</span>
                {(o.metric || o.target) && <span className="text-ink-soft">{` · ${[o.metric, o.target].filter(Boolean).join(': ')}`}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {content.milestones && content.milestones.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">Hitos</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
            {content.milestones.map((m, i) => (
              <li key={i}>
                <span>{m.name}</span>
                <span className="text-ink-soft">{` · ${shortDate(m.dueDate)} · ${LABELS.milestoneStatus[m.status as keyof typeof LABELS.milestoneStatus] ?? m.status}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Solo se ve al imprimir: nombre del proyecto, versión o borrador y el contenido. */
export function CharterPrint({ projectName, heading, content }: { projectName: string; heading: string; content: CharterVersionContent }) {
  return (
    <article aria-hidden="true" className="hidden print:block">
      <h1 className="text-2xl font-semibold text-ink">{`Acta del proyecto ${projectName}`}</h1>
      <p className="mb-6 text-sm text-ink-nav">{heading}</p>
      <CharterContent content={content} />
    </article>
  );
}
