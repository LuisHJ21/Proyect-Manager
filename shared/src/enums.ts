export const ROLE = ['PM', 'COLLABORATOR', 'OBSERVER'] as const;
export const PROJECT_STATUS = ['PLANNING', 'EXECUTING', 'PAUSED', 'CLOSED', 'CANCELLED'] as const;
export const APPROACH = ['PREDICTIVE', 'AGILE', 'HYBRID'] as const;
export const CHARTER_STATUS = ['DRAFT', 'APPROVED'] as const;
export const OBJECTIVE_STATUS = ['PENDING', 'MET', 'NOT_MET'] as const;
export const MILESTONE_STATUS = ['PENDING', 'REACHED'] as const;
export const TASK_STATUS = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;
export const PRIORITY = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const LEVEL = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const RISK_TYPE = ['THREAT', 'OPPORTUNITY'] as const;
export const RISK_STATUS = ['OPEN', 'TREATING', 'CLOSED'] as const;
export const RISK_RESPONSE = {
  THREAT: ['AVOID', 'MITIGATE', 'TRANSFER', 'ESCALATE', 'ACCEPT'],
  OPPORTUNITY: ['EXPLOIT', 'ENHANCE', 'SHARE', 'ESCALATE', 'ACCEPT'],
} as const;
export const HEALTH = ['AT_RISK', 'ATTENTION', 'ON_TRACK'] as const;
export const ACTIVE_PROJECT_STATUS = ['PLANNING', 'EXECUTING', 'PAUSED'] as const;
export const CLOSED_PROJECT_STATUS = ['CLOSED', 'CANCELLED'] as const;
export const LESSON_TYPE = ['WORKED_WELL', 'TO_IMPROVE'] as const;
export const LESSON_CATEGORY = ['SCOPE', 'SCHEDULE', 'COST', 'QUALITY', 'TEAM', 'COMMUNICATION', 'RISK', 'STAKEHOLDERS', 'PROCUREMENT', 'OTHER'] as const;
export const CLOSURE_PENDING_KIND = ['deliverables', 'incidents', 'risks', 'tasks', 'objectives', 'charter'] as const;
export type LessonType = (typeof LESSON_TYPE)[number];
export type LessonCategory = (typeof LESSON_CATEGORY)[number];
export type ClosurePendingKind = (typeof CLOSURE_PENDING_KIND)[number];
export const EXPENSE_CATEGORY = ['LABOR', 'MATERIALS', 'EQUIPMENT', 'SERVICES', 'OTHER'] as const;

export type Role = (typeof ROLE)[number];
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export type Approach = (typeof APPROACH)[number];
export type CharterStatus = (typeof CHARTER_STATUS)[number];
export type ObjectiveStatus = (typeof OBJECTIVE_STATUS)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];
export type TaskStatus = (typeof TASK_STATUS)[number];
export type Priority = (typeof PRIORITY)[number];
export type Level = (typeof LEVEL)[number];
export type RiskType = (typeof RISK_TYPE)[number];
export type RiskStatus = (typeof RISK_STATUS)[number];
export type Health = (typeof HEALTH)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORY)[number];

export const CHANGE_STATUS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const INCIDENT_STATUS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];
export type ChangeStatus = (typeof CHANGE_STATUS)[number];
export const DELIVERABLE_STATUS = ['PENDING', 'IN_REVIEW', 'ACCEPTED', 'REJECTED'] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUS)[number];
export const REVIEW_OUTCOME = ['ACCEPTED', 'REJECTED'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOME)[number];

export const ACTIVITY_ENTITY = [
  'project',
  'member',
  'task',
  'step',
  'comment',
  'attachment',
  'objective',
  'milestone',
  'stakeholder',
  'risk',
  'expense',
  'raci',
  'change',
  'incident',
  'decision',
  'deliverable',
  'lesson',
] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITY)[number];
export const ACTIVITY_ACTION = ['created', 'updated', 'deleted', 'approved', 'closed', 'reopened', 'baselined', 'decided', 'reviewed', 'commented', 'uploaded'] as const;
export type ActivityAction = (typeof ACTIVITY_ACTION)[number];
export type ActivityValue = string | number | boolean | string[] | null;
/** Sin `from`/`to`: el campo cambió pero no está vigilado. */
export type ActivityChange = { field: string; from?: ActivityValue; to?: ActivityValue };

export const LABELS = {
  role: { PM: 'Project Manager', COLLABORATOR: 'Colaborador', OBSERVER: 'Observador' },
  projectStatus: {
    PLANNING: 'Planificación',
    EXECUTING: 'En ejecución',
    PAUSED: 'En pausa',
    CLOSED: 'Cerrado',
    CANCELLED: 'Cancelado',
  },
  approach: { PREDICTIVE: 'Predictivo', AGILE: 'Ágil', HYBRID: 'Híbrido' },
  health: { AT_RISK: 'En riesgo', ATTENTION: 'Atención', ON_TRACK: 'Al día' },
  charterStatus: { DRAFT: 'Borrador', APPROVED: 'Aprobada' },
  changeStatus: { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada' },
  incidentStatus: { OPEN: 'Abierto', IN_PROGRESS: 'En curso', RESOLVED: 'Resuelto', CLOSED: 'Cerrado' },
  deliverableStatus: { PENDING: 'Pendiente', IN_REVIEW: 'En revisión', ACCEPTED: 'Aceptado', REJECTED: 'Rechazado' },
  reviewOutcome: { ACCEPTED: 'Aceptado', REJECTED: 'Rechazado' },
  lessonType: { WORKED_WELL: 'Funcionó bien', TO_IMPROVE: 'A mejorar' },
  lessonCategory: {
    SCOPE: 'Alcance',
    SCHEDULE: 'Cronograma',
    COST: 'Costos',
    QUALITY: 'Calidad',
    TEAM: 'Equipo',
    COMMUNICATION: 'Comunicación',
    RISK: 'Riesgos',
    STAKEHOLDERS: 'Interesados',
    PROCUREMENT: 'Proveedores',
    OTHER: 'Otro',
  },
  closurePending: {
    deliverables: 'Entregables sin aceptar',
    incidents: 'Incidentes abiertos',
    risks: 'Riesgos abiertos',
    tasks: 'Tareas sin terminar',
    objectives: 'Objetivos sin evaluar',
    charter: 'Acta sin aprobar',
  },
  objectiveStatus: { PENDING: 'Pendiente', MET: 'Cumplido', NOT_MET: 'No cumplido' },
  milestoneStatus: { PENDING: 'Pendiente', REACHED: 'Alcanzado' },
  taskStatus: { TODO: 'Por hacer', IN_PROGRESS: 'En curso', BLOCKED: 'Bloqueada', DONE: 'Hecha' },
  priority: { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta' },
  level: { LOW: 'Bajo', MEDIUM: 'Medio', HIGH: 'Alto' },
  riskType: { THREAT: 'Amenaza', OPPORTUNITY: 'Oportunidad' },
  riskStatus: { OPEN: 'Abierto', TREATING: 'En tratamiento', CLOSED: 'Cerrado' },
  riskResponse: {
    AVOID: 'Evitar',
    MITIGATE: 'Mitigar',
    TRANSFER: 'Transferir',
    ESCALATE: 'Escalar',
    ACCEPT: 'Aceptar',
    EXPLOIT: 'Explotar',
    ENHANCE: 'Mejorar',
    SHARE: 'Compartir',
  },
  expenseCategory: {
    LABOR: 'Mano de obra',
    MATERIALS: 'Materiales',
    EQUIPMENT: 'Equipos',
    SERVICES: 'Servicios',
    OTHER: 'Otros',
  },
  activityEntity: {
    project: 'Proyecto',
    member: 'Miembro',
    task: 'Tarea',
    step: 'Paso',
    comment: 'Comentario',
    attachment: 'Anexo',
    objective: 'Objetivo',
    milestone: 'Hito',
    stakeholder: 'Interesado',
    risk: 'Riesgo',
    expense: 'Gasto',
    raci: 'RACI',
    change: 'Solicitud de cambio',
    incident: 'Incidente',
    decision: 'Decisión',
    deliverable: 'Entregable',
    lesson: 'Lección',
  },
  activityField: {
    status: 'Estado',
    startDate: 'Inicio',
    endDate: 'Fin',
    dueDate: 'Fecha límite',
    plannedBudgetCents: 'Presupuesto',
    progress: 'Avance',
    plannedCostCents: 'Costo planeado',
    milestoneId: 'Hito',
    assignees: 'Asignados',
    done: 'Hecho',
    assigneeId: 'Responsable',
    ownerId: 'Responsable',
    probability: 'Probabilidad',
    impact: 'Impacto',
    amountCents: 'Monto',
    date: 'Fecha',
    category: 'Categoría',
    scheduleImpactDays: 'Impacto en plazo (días)',
    costImpactCents: 'Impacto en costo',
    priority: 'Prioridad',
    decidedOn: 'Fecha de decisión',
    met: 'Cumplido',
    type: 'Tipo',
    projectRole: 'Rol en el proyecto',
    role: 'Rol RACI',
    criteriaOrder: 'orden de criterios',
    description: 'descripción',
  } as Record<string, string>,
} as const;
