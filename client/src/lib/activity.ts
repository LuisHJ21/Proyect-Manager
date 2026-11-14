import { formatMoney, LABELS, type ActivityAction, type ActivityEntity, type ActivityValue } from '@pm/shared';
import type { ActivityLog } from '../api/types';
import { shortDate } from './display';

/** El elemento con su artículo, para armar la frase. */
const NOUN: Record<ActivityEntity, string> = {
  project: 'el proyecto',
  member: 'al miembro',
  task: 'la tarea',
  step: 'el paso',
  comment: 'la tarea',
  attachment: 'el anexo',
  objective: 'el objetivo',
  milestone: 'el hito',
  stakeholder: 'al interesado',
  risk: 'el riesgo',
  expense: 'el gasto',
  raci: 'la RACI',
  change: 'la solicitud de cambio',
  incident: 'el incidente',
  decision: 'la decisión',
  deliverable: 'el entregable',
  lesson: 'la lección',
};

const VERB: Record<Exclude<ActivityAction, 'updated'>, string> = {
  created: 'creó',
  deleted: 'borró',
  approved: 'aprobó el acta de',
  closed: 'cerró',
  reopened: 'reabrió',
  baselined: 'fijó la línea base de',
  decided: 'decidió',
  reviewed: 'revisó',
  commented: 'comentó en',
  uploaded: 'subió',
};

/** «aprobó el acta de el proyecto» → «del proyecto». */
const contract = (text: string) => text.replace(/\bde el\b/g, 'del');

/** Frase de un registro: «creó el riesgo «Proveedor tarde»». */
export function describeActivity(log: ActivityLog): string {
  const verb = log.action === 'updated' ? (log.changes.some((c) => 'from' in c || 'to' in c) ? 'cambió' : 'actualizó') : VERB[log.action];
  return contract(`${verb} ${NOUN[log.entity]} «${log.entityLabel}»`);
}

/** Etiquetas de enumeración por tipo de elemento y campo. */
const STATUS_LABELS: Partial<Record<ActivityEntity, Record<string, string>>> = {
  project: LABELS.projectStatus,
  task: LABELS.taskStatus,
  objective: LABELS.objectiveStatus,
  milestone: LABELS.milestoneStatus,
  risk: LABELS.riskStatus,
  change: LABELS.changeStatus,
  incident: LABELS.incidentStatus,
  deliverable: LABELS.deliverableStatus,
};
const FIELD_LABELS: Record<string, Record<string, string>> = {
  priority: LABELS.priority,
  category: { ...LABELS.expenseCategory, ...LABELS.lessonCategory },
  type: LABELS.lessonType,
};

function formatValue(log: ActivityLog, field: string, value: ActivityValue | undefined, currency: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') {
    if (field.endsWith('Cents')) return formatMoney(value, currency);
    if (field === 'progress') return `${value} %`;
    return String(value);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return shortDate(value);
  const labels = field === 'status' ? STATUS_LABELS[log.entity] : FIELD_LABELS[field];
  return labels?.[value] ?? value;
}

/** Nombre en minúscula para «también cambió»; un campo sin etiqueta no muestra su nombre interno. */
function fieldLabel(field: string): string {
  if (field.startsWith('charter.')) return 'acta';
  const label = LABELS.activityField[field];
  return label ? label.charAt(0).toLowerCase() + label.slice(1) : 'otros datos';
}

/** Cambios legibles: con valores («Estado: En curso → Hecha») y campos que solo se nombran («descripción»). */
export function describeChanges(log: ActivityLog, currency: string): { valued: string[]; others: string[] } {
  const valued: string[] = [];
  const others: string[] = [];
  for (const change of log.changes) {
    if ('from' in change || 'to' in change) {
      const label = LABELS.activityField[change.field] ?? change.field;
      valued.push(`${label}: ${formatValue(log, change.field, change.from, currency)} → ${formatValue(log, change.field, change.to, currency)}`);
    } else {
      const label = fieldLabel(change.field);
      if (!others.includes(label)) others.push(label);
    }
  }
  return { valued, others };
}
