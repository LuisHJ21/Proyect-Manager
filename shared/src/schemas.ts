import { z } from 'zod';
import { diffDays, isValidCalendarDate } from './dates';
import { MAX_FILE_BYTES } from './fileTypes';
import {
  APPROACH,
  CLOSED_PROJECT_STATUS,
  LESSON_CATEGORY,
  LESSON_TYPE,
  DELIVERABLE_STATUS,
  DEPENDENCY_TYPE,
  EXPENSE_CATEGORY,
  INCIDENT_STATUS,
  LEVEL,
  MILESTONE_STATUS,
  OBJECTIVE_STATUS,
  PRIORITY,
  PROJECT_STATUS,
  REVIEW_OUTCOME,
  RISK_RESPONSE,
  RISK_STATUS,
  RISK_TYPE,
  ROLE,
  TASK_STATUS,
  type RiskType,
} from './enums';

/** Mensajes en español para los casos sin un mensaje propio. */
z.setErrorMap((issue, ctx) => {
  if (issue.code === 'invalid_type' && (issue.received === 'undefined' || issue.received === 'null')) {
    return { message: 'Este campo es obligatorio' };
  }
  if (issue.code === 'invalid_enum_value') return { message: 'Selecciona una opción válida' };
  if (issue.code === 'invalid_type') return { message: 'Valor inválido' };
  return { message: ctx.defaultError };
});

export const calendarDateSchema = z.string().refine(isValidCalendarDate, 'Fecha inválida');
export const optionalDateSchema = calendarDateSchema.nullable().optional();

export const required = (message = 'Este campo es obligatorio') => z.string().trim().min(1, message);

/** Límites de longitud: con mensaje, el texto además es obligatorio. */
const limited = (max: number, maxMessage: string) => (message?: string) => (message ? required(message) : z.string()).max(max, maxMessage);
/** Títulos, nombres y campos de una línea. */
export const shortText = limited(200, 'Máximo 200 caracteres');
/** Descripciones, textos con formato y campos del acta. */
export const longText = limited(20_000, 'Máximo 20 000 caracteres');
/** Comentarios, notas y motivos. */
export const noteText = limited(5_000, 'Máximo 5 000 caracteres');

/** Versión de edición que el navegador abrió; si no coincide con la guardada, la API responde 409. */
export const VERSION_REQUIRED = 'Recarga la página para editar este registro';
export const versionField = z.number({ message: VERSION_REQUIRED }).int(VERSION_REQUIRED).positive(VERSION_REQUIRED);

export const emailSchema = z.string().trim().toLowerCase().email('Correo inválido');
export const passwordSchema = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres');

export const setupSchema = z.object({
  name: shortText('Escribe tu nombre'),
  email: emailSchema,
  password: passwordSchema,
  /** Código de configuración inicial (SETUP_TOKEN), cuando el servidor lo exige. */
  token: z.string().optional(),
});
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Escribe tu contraseña'),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual'),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  name: shortText('Escribe el nombre'),
  email: emailSchema,
  role: z.enum(ROLE),
  temporaryPassword: passwordSchema,
});
export const updateUserSchema = z.object({
  name: shortText('Escribe el nombre').optional(),
  role: z.enum(ROLE).optional(),
  active: z.boolean().optional(),
});
export const resetPasswordSchema = z.object({ temporaryPassword: passwordSchema });

/** Mayor monto admitido, en centavos. Deja margen para sumar gastos sin perder precisión. */
export const MAX_AMOUNT_CENTS = 99_999_999_999_999;
const AMOUNT_TOO_LARGE = 'El monto es demasiado grande';
const budgetAmount = z.number({ message: 'Monto inválido' }).int('Monto inválido').min(0, 'Monto inválido').max(MAX_AMOUNT_CENTS, AMOUNT_TOO_LARGE);

const CLOSE_VIA_TAB = 'Para cerrar el proyecto usa la pestaña Cierre';
const openProjectStatus = z.enum(PROJECT_STATUS).refine((s) => !(CLOSED_PROJECT_STATUS as readonly string[]).includes(s), CLOSE_VIA_TAB);

const projectFields = {
  name: shortText('Escribe el nombre del proyecto'),
  description: longText().default(''),
  status: openProjectStatus.default('PLANNING'),
  approach: z.enum(APPROACH).default('PREDICTIVE'),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  plannedBudgetCents: budgetAmount.default(0),
  contingencyReserveCents: budgetAmount.default(0),
  managementReserveCents: budgetAmount.default(0),
  currency: z.string().trim().toUpperCase().length(3, 'Usa un código de 3 letras, por ejemplo USD').default('USD'),
};
export const DATE_ORDER_MESSAGE = 'La fecha de inicio no puede ser posterior a la de fin';
export const isDateOrderValid = (start?: string | null, end?: string | null) => !start || !end || start <= end;
export const createProjectSchema = z.object(projectFields).superRefine((value, ctx) => {
  if (!isDateOrderValid(value.startDate, value.endDate)) {
    ctx.addIssue({ code: 'custom', path: ['startDate'], message: DATE_ORDER_MESSAGE });
  }
});
export const updateProjectSchema = z.object({
  name: projectFields.name.optional(),
  description: longText().optional(),
  status: openProjectStatus.optional(),
  approach: z.enum(APPROACH).optional(),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  plannedBudgetCents: budgetAmount.optional(),
  contingencyReserveCents: budgetAmount.optional(),
  managementReserveCents: budgetAmount.optional(),
  currency: z.string().trim().toUpperCase().length(3, 'Usa un código de 3 letras, por ejemplo USD').optional(),
});

/** Presupuesto planeado por categoría de gasto; cada categoría va una sola vez. */
export const budgetCategoriesSchema = z.object({
  items: z
    .array(z.object({ category: z.enum(EXPENSE_CATEGORY), plannedCents: budgetAmount }))
    .max(EXPENSE_CATEGORY.length)
    .refine((items) => new Set(items.map((i) => i.category)).size === items.length, 'Cada categoría va una sola vez'),
});
export const deleteProjectSchema = z.object({ confirmName: z.string() });

export const addMemberSchema = z.object({
  userId: required('Selecciona un usuario'),
  projectRole: shortText().default(''),
});
export const updateMemberSchema = z.object({
  projectRole: shortText().optional(),
  hourlyRateCents: budgetAmount.optional(),
  weeklyCapacityHours: z.number({ message: 'Usa un número de horas' }).int('Usa un número entero de horas').min(0, 'Usa de 0 a 168 horas').max(168, 'Usa de 0 a 168 horas').optional(),
});

export const CHARTER_TEXT_FIELDS = [
  'justification',
  'scopeIncluded',
  'scopeExcluded',
  'boundaries',
  'assumptions',
  'constraints',
  'successCriteria',
  'sponsor',
] as const;
export const CHARTER_REQUIRED_TO_APPROVE = ['justification', 'scopeIncluded', 'successCriteria'] as const;
export const charterSchema = z.object({
  justification: longText().default(''),
  scopeIncluded: longText().default(''),
  scopeExcluded: longText().default(''),
  boundaries: longText().default(''),
  assumptions: longText().default(''),
  constraints: longText().default(''),
  successCriteria: longText().default(''),
  sponsor: shortText().default(''),
  version: versionField,
});
export const approveCharterSchema = z.object({ version: versionField });

const objectiveFields = {
  description: longText('Describe el objetivo'),
  metric: shortText().default(''),
  target: shortText().default(''),
  status: z.enum(OBJECTIVE_STATUS).default('PENDING'),
};
export const createObjectiveSchema = z.object(objectiveFields);
export const updateObjectiveSchema = z.object({
  description: objectiveFields.description.optional(),
  metric: shortText().optional(),
  target: shortText().optional(),
  status: z.enum(OBJECTIVE_STATUS).optional(),
});

export const createMilestoneSchema = z.object({
  name: shortText('Escribe el nombre del hito'),
  dueDate: calendarDateSchema,
  status: z.enum(MILESTONE_STATUS).default('PENDING'),
});
export const updateMilestoneSchema = z.object({
  name: shortText('Escribe el nombre del hito').optional(),
  dueDate: calendarDateSchema.optional(),
  status: z.enum(MILESTONE_STATUS).optional(),
});

export const createStakeholderSchema = z.object({
  name: shortText('Escribe el nombre'),
  organization: shortText().default(''),
  position: shortText().default(''),
  contact: shortText().default(''),
  influence: z.enum(LEVEL).default('MEDIUM'),
  interest: z.enum(LEVEL).default('MEDIUM'),
  strategy: longText().default(''),
});
export const updateStakeholderSchema = z.object({
  name: shortText('Escribe el nombre').optional(),
  organization: shortText().optional(),
  position: shortText().optional(),
  contact: shortText().optional(),
  influence: z.enum(LEVEL).optional(),
  interest: z.enum(LEVEL).optional(),
  strategy: longText().optional(),
});

const scale = z.number({ message: 'Usa un valor de 1 a 5' }).int('Usa un valor de 1 a 5').min(1, 'Usa un valor de 1 a 5').max(5, 'Usa un valor de 1 a 5');
const ALL_RESPONSES = [...new Set(Object.values(RISK_RESPONSE).flat())] as [string, ...string[]];
const riskResponse = z.enum(ALL_RESPONSES, { message: 'Selecciona una respuesta' });
export const INVALID_RESPONSE_MESSAGE = 'Esta respuesta no corresponde al tipo de riesgo';
export const isResponseValidForType = (type: RiskType, response: string) =>
  (RISK_RESPONSE[type] as readonly string[]).includes(response);
export const createRiskSchema = z
  .object({
    description: longText('Describe el riesgo'),
    type: z.enum(RISK_TYPE),
    probability: scale,
    impact: scale,
    response: riskResponse,
    responsePlan: longText().default(''),
    ownerId: z.string().nullable().optional(),
    status: z.enum(RISK_STATUS).default('OPEN'),
  })
  .superRefine((value, ctx) => {
    if (!isResponseValidForType(value.type, value.response)) {
      ctx.addIssue({ code: 'custom', path: ['response'], message: INVALID_RESPONSE_MESSAGE });
    }
  });
export const updateRiskSchema = z.object({
  description: longText('Describe el riesgo').optional(),
  type: z.enum(RISK_TYPE).optional(),
  probability: scale.optional(),
  impact: scale.optional(),
  response: riskResponse.optional(),
  responsePlan: longText().optional(),
  ownerId: z.string().nullable().optional(),
  status: z.enum(RISK_STATUS).optional(),
  version: versionField,
});

const amount = z.number({ message: 'Monto inválido' }).int('Monto inválido').positive('El monto debe ser mayor que cero').max(MAX_AMOUNT_CENTS, AMOUNT_TOO_LARGE);
export const createExpenseSchema = z.object({
  description: shortText('Describe el gasto'),
  amountCents: amount,
  date: calendarDateSchema,
  category: z.enum(EXPENSE_CATEGORY),
  taskId: z.string().nullable().optional(),
});
export const updateExpenseSchema = z.object({
  description: shortText('Describe el gasto').optional(),
  amountCents: amount.optional(),
  date: calendarDateSchema.optional(),
  category: z.enum(EXPENSE_CATEGORY).optional(),
  taskId: z.string().nullable().optional(),
});

const taskCommonFields = {
  description: longText().optional(),
  priority: z.enum(PRIORITY).optional(),
  startDate: optionalDateSchema,
  dueDate: optionalDateSchema,
  milestoneId: z.string().nullable().optional(),
  parentId: z.string().min(1, 'Elige una tarea de este proyecto').nullable().optional(),
  deliverableId: z.string().min(1, 'Elige un entregable de este proyecto').nullable().optional(),
  plannedCostCents: budgetAmount.optional(),
  estimatedHours: z.number({ message: 'Usa un número de horas' }).min(0, 'Usa de 0 a 9999 horas').max(9999, 'Usa de 0 a 9999 horas').multipleOf(0.01, 'Usa como mucho dos decimales').nullable().optional(),
};
export const TASK_DATE_ORDER_MESSAGE = 'La fecha de inicio no puede ser posterior a la fecha límite';
export const createTaskSchema = z
  .object({
    title: shortText('Escribe el título'),
    assigneeIds: z.array(z.string()).default([]),
    ...taskCommonFields,
  })
  .superRefine((value, ctx) => {
    if (!isDateOrderValid(value.startDate, value.dueDate)) {
      ctx.addIssue({ code: 'custom', path: ['startDate'], message: TASK_DATE_ORDER_MESSAGE });
    }
  });
const useProgressRoute = 'El estado y el avance se actualizan por separado';
export const updateTaskSchema = z.object({
  title: shortText('Escribe el título').optional(),
  ...taskCommonFields,
  assigneeIds: z.array(z.string()).optional(),
  version: versionField,
  status: z.undefined({ message: useProgressRoute }),
  progress: z.undefined({ message: useProgressRoute }),
});
export const assigneesSchema = z.object({ userIds: z.array(z.string()) });
export const moveTaskSchema = z.object({ direction: z.enum(['up', 'down'], { message: 'Usa up o down' }) });
export const taskProgressSchema = z.object({
  status: z.enum(TASK_STATUS).optional(),
  progress: z
    .number({ message: 'Usa un valor de 0 a 100' })
    .int('Usa un valor de 0 a 100')
    .min(0, 'Usa un valor de 0 a 100')
    .max(100, 'Usa un valor de 0 a 100')
    .optional(),
});
const MAX_CALENDAR_DAYS = 62;
export const calendarRangeSchema = z
  .object({ from: calendarDateSchema, to: calendarDateSchema })
  .superRefine(({ from, to }, ctx) => {
    if (from > to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'La fecha final no puede ser anterior a la inicial' });
    } else if (diffDays(from, to) + 1 > MAX_CALENDAR_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: `El rango máximo es de ${MAX_CALENDAR_DAYS} días` });
    }
  });

export const stepSchema = z.object({
  title: shortText('Escribe el paso'),
  assigneeId: z.string().nullable().optional(),
});
export const updateStepSchema = z.object({
  title: shortText('Escribe el paso').optional(),
  assigneeId: z.string().nullable().optional(),
  done: z.boolean().optional(),
});
export const commentSchema = z.object({ body: noteText('Escribe un comentario') });
const hoursField = z
  .number({ message: 'Usa un número de horas' })
  .min(0.25, 'Registra de 0,25 a 24 horas')
  .max(24, 'Registra de 0,25 a 24 horas')
  .multipleOf(0.25, 'Usa cuartos de hora: 0,25, 0,5, 0,75…');
export const timeEntrySchema = z.object({ date: calendarDateSchema, hours: hoursField, note: noteText().default('') });
export const updateTimeEntrySchema = z.object({ date: calendarDateSchema.optional(), hours: hoursField.optional(), note: noteText().optional() });
const lagDays = z.number({ message: 'Usa un número entero de días' }).int('Usa un número entero de días').min(-365, 'Usa de −365 a 365 días').max(365, 'Usa de −365 a 365 días');
export const dependencySchema = z.object({
  predecessorId: required('Selecciona una tarea'),
  type: z.enum(DEPENDENCY_TYPE).default('FS'),
  lagDays: lagDays.default(0),
});
export const rescheduleSchema = z.object({ apply: z.boolean({ message: 'Indica si se aplica' }) });
export const updateDependencySchema = z.object({ type: z.enum(DEPENDENCY_TYPE).optional(), lagDays: lagDays.optional() });

export const baselineSchema = z.object({
  reason: noteText().trim().default(''),
  changeRequestId: z.string().nullable().optional(),
});

const changeRequestFields = {
  title: shortText('Escribe el título'),
  description: longText().default(''),
  requestedBy: shortText().default(''),
  scopeImpact: longText().default(''),
  scheduleImpactDays: z.number({ message: 'Usa un número entero de días' }).int('Usa un número entero de días').nullable().optional(),
  costImpactCents: z
    .number({ message: 'Monto inválido' })
    .int('Monto inválido')
    .min(-MAX_AMOUNT_CENTS, AMOUNT_TOO_LARGE)
    .max(MAX_AMOUNT_CENTS, AMOUNT_TOO_LARGE)
    .nullable()
    .optional(),
};
export const changeRequestSchema = z.object(changeRequestFields);
export const updateChangeRequestSchema = z.object({
  title: changeRequestFields.title.optional(),
  description: longText().optional(),
  requestedBy: shortText().optional(),
  scopeImpact: longText().optional(),
  scheduleImpactDays: changeRequestFields.scheduleImpactDays,
  costImpactCents: changeRequestFields.costImpactCents,
});
/** Lo que puede enviar un colaborador al proponer un cambio. */
export const proposeChangeSchema = z.object({
  title: shortText('Escribe el título'),
  description: longText().default(''),
});
/** Aplicar un cambio aprobado: los campos que vienen actualizan el proyecto. */
export const applyChangeSchema = z.object({
  endDate: optionalDateSchema,
  plannedBudgetCents: budgetAmount.optional(),
  baseline: z.boolean({ message: 'Indica si se fija una nueva línea base' }),
  reason: noteText().trim().optional(),
});
export const decisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: noteText('Escribe la nota de la decisión'),
});

const optionalId = z.string().min(1, 'Selecciona una opción válida').nullable().optional();

/** Lo que puede enviar cualquier miembro al reportar un incidente. */
export const reportIncidentSchema = z.object({
  title: shortText('Escribe el título'),
  description: longText().default(''),
  taskId: optionalId,
});
/** Campos que solo fija el Project Manager. */
export const pmIncidentFields = {
  ownerId: optionalId,
  priority: z.enum(PRIORITY).optional(),
  dueDate: optionalDateSchema,
  riskId: optionalId,
};
export const createIncidentSchema = reportIncidentSchema.extend(pmIncidentFields);
export const updateIncidentSchema = z.object({
  title: shortText('Escribe el título').optional(),
  description: longText().optional(),
  taskId: optionalId,
  ...pmIncidentFields,
  status: z.enum(INCIDENT_STATUS).optional(),
  resolution: longText().optional(),
  recordDecision: z.boolean().optional(),
});

export const decisionRecordSchema = z.object({
  title: shortText('Escribe el título'),
  rationale: longText().default(''),
  decidedBy: shortText().default(''),
  decidedOn: calendarDateSchema,
  changeRequestId: optionalId,
  incidentId: optionalId,
});
export const updateDecisionRecordSchema = z.object({
  title: shortText('Escribe el título').optional(),
  rationale: longText().optional(),
  decidedBy: shortText().optional(),
  decidedOn: calendarDateSchema.optional(),
  changeRequestId: optionalId,
  incidentId: optionalId,
});

const deliverableName = required('Escribe el nombre').max(200, 'Máximo 200 caracteres');
export const deliverableSchema = z.object({
  name: deliverableName,
  description: longText().default(''),
  milestoneId: optionalId,
  dueDate: optionalDateSchema,
  criteria: z.array(z.string().max(300, 'Máximo 300 caracteres')).max(50, 'Máximo 50 criterios').optional(),
});
export const updateDeliverableSchema = z.object({
  name: deliverableName.optional(),
  description: longText().optional(),
  milestoneId: optionalId,
  dueDate: optionalDateSchema,
  status: z.enum(DELIVERABLE_STATUS).optional(),
  version: versionField,
});
const criterionText = required('Escribe el criterio').max(300, 'Máximo 300 caracteres');
export const criterionSchema = z.object({ text: criterionText });
export const updateCriterionSchema = z.object({ text: criterionText.optional(), met: z.boolean().optional() });
export const criteriaOrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });
export const deliverableReviewSchema = z.object({
  outcome: z.enum(REVIEW_OUTCOME),
  stakeholderId: optionalId,
  attachmentId: optionalId,
  reviewedOn: calendarDateSchema,
  note: noteText().default(''),
});

export const closeProjectSchema = z.object({
  finalStatus: z.enum(CLOSED_PROJECT_STATUS),
  summary: longText().default(''),
  pendingReason: longText().default(''),
});
export const reopenProjectSchema = z.object({ reason: noteText('Escribe el motivo') });
const lessonText = z.string().max(2000, 'Máximo 2000 caracteres');
export const lessonSchema = z.object({
  type: z.enum(LESSON_TYPE),
  category: z.enum(LESSON_CATEGORY),
  situation: required('Describe la situación').max(2000, 'Máximo 2000 caracteres'),
  recommendation: lessonText.default(''),
});
export const updateLessonSchema = z.object({
  type: z.enum(LESSON_TYPE).optional(),
  category: z.enum(LESSON_CATEGORY).optional(),
  situation: required('Describe la situación').max(2000, 'Máximo 2000 caracteres').optional(),
  recommendation: lessonText.optional(),
});

/** Datos del archivo que se va a subir como anexo. */
export const uploadRequestSchema = z.object({
  filename: required('Selecciona un archivo'),
  mimeType: z.string(),
  size: z.number().int().positive('Selecciona un archivo').max(MAX_FILE_BYTES, 'El archivo supera el límite de 25 MB'),
});
