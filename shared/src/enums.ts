export const ROLE = ['PM', 'COLLABORATOR'] as const;
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

export const LABELS = {
  role: { PM: 'Project Manager', COLLABORATOR: 'Colaborador' },
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
} as const;
