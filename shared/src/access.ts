import type { Role } from './enums';

/** Secciones de un proyecto con un mismo permiso. Ver la tabla de la especificación de perfiles. */
export const SECTIONS = [
  'project',
  'planning',
  'tasks',
  'comments',
  'attachments',
  'members',
  'raci',
  'deliverables',
  'lessons',
  'incidents',
  'decisions',
  'risks',
  'stakeholders',
  'budget',
  'performance',
  'changes',
  'closure',
  'activity',
  'reports',
  'meetings',
] as const;
export type Section = (typeof SECTIONS)[number];

/** `own`: solo los registros donde la persona es responsable o reportante; la ruta filtra. */
export type AccessLevel = 'write' | 'read' | 'own' | 'none';

// La bitácora solo se consulta: nadie escribe en ella desde la API.
const PM_ACCESS = { ...Object.fromEntries(SECTIONS.map((s) => [s, 'write'])), activity: 'read' } as Record<Section, AccessLevel>;

export const ACCESS: Record<Role, Record<Section, AccessLevel>> = {
  PM: PM_ACCESS,
  COLLABORATOR: {
    project: 'read', // sin costos ni indicadores de presupuesto
    planning: 'read', // acta, objetivos e hitos
    tasks: 'read', // además: avance y pasos de sus tareas (se resuelve en la ruta)
    comments: 'read', // además: comenta en sus tareas
    attachments: 'read', // además: sube a sus tareas y borra los suyos
    members: 'read',
    raci: 'none',
    deliverables: 'read',
    lessons: 'write', // edita solo las suyas
    incidents: 'own', // reporta; ve los suyos; cambia el estado de los que es responsable
    decisions: 'none',
    risks: 'own', // ve los suyos y solo cambia su estado
    stakeholders: 'none',
    budget: 'none',
    performance: 'none',
    changes: 'own', // propone; ve las suyas, sin impactos
    closure: 'none',
    activity: 'none',
    reports: 'none',
    meetings: 'own', // las reuniones a las que asistió, sin interesados
  },
  OBSERVER: {
    project: 'read',
    planning: 'read',
    tasks: 'read',
    comments: 'none',
    attachments: 'read',
    members: 'read',
    raci: 'none',
    deliverables: 'read',
    lessons: 'read',
    incidents: 'none',
    decisions: 'none',
    risks: 'none',
    stakeholders: 'none',
    budget: 'none',
    performance: 'none',
    changes: 'none',
    closure: 'none',
    activity: 'none',
    reports: 'read', // sin montos
    meetings: 'none',
  },
};

export const accessLevel = (role: Role, section: Section): AccessLevel => ACCESS[role]?.[section] ?? 'none';
export const canRead = (role: Role, section: Section) => accessLevel(role, section) !== 'none';
export const canWrite = (role: Role, section: Section) => accessLevel(role, section) === 'write';
