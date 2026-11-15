import { z } from 'zod';
import { diffDays, isValidCalendarDate } from './dates';
import { MAX_FILE_BYTES } from './fileTypes';
import {
  APPROACH,
  CLOSED_PROJECT_STATUS,
  LESSON_CATEGORY,
  LESSON_TYPE,
  DELIVERABLE_STATUS,
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

/** Versión de edición que el navegador abrió; si no coincide con la guardada, la API responde 409. */
export const VERSION_REQUIRED = 'Recarga la página para editar este registro';
export const versionField = z.number({ message: VERSION_REQUIRED }).int(VERSION_REQUIRED).positive(VERSION_REQUIRED);

export const emailSchema = z.string().trim().toLowerCase().email('Correo inválido');
export const passwordSchema = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres');

export const setupSchema = z.object({
  name: required('Escribe tu nombre'),
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
  name: required('Escribe el nombre'),
  email: emailSchema,
  role: z.enum(ROLE),
  temporaryPassword: passwordSchema,
});
export const updateUserSchema = z.object({
  name: required('Escribe el nombre').optional(),
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
  name: required('Escribe el nombre del proyecto'),
  description: z.string().default(''),
  status: openProjectStatus.default('PLANNING'),
  approach: z.enum(APPROACH).default('PREDICTIVE'),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  plannedBudgetCents: budgetAmount.default(0),
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
  description: z.string().optional(),
  status: openProjectStatus.optional(),
  approach: z.enum(APPROACH).optional(),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  plannedBudgetCents: budgetAmount.optional(),
  currency: z.string().trim().toUpperCase().length(3, 'Usa un código de 3 letras, por ejemplo USD').optional(),
});
export const deleteProjectSchema = z.object({ confirmName: z.string() });

export const addMemberSchema = z.object({
  userId: required('Selecciona un usuario'),
  projectRole: z.string().default(''),
});
export const updateMemberSchema = z.object({ projectRole: z.string() });

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
  justification: z.string().default(''),
  scopeIncluded: z.string().default(''),
  scopeExcluded: z.string().default(''),
  boundaries: z.string().default(''),
  assumptions: z.string().default(''),
  constraints: z.string().default(''),
  successCriteria: z.string().default(''),
  sponsor: z.string().default(''),
  version: versionField,
});
export const approveCharterSchema = z.object({ version: versionField });

const objectiveFields = {
  description: required('Describe el objetivo'),
  metric: z.string().default(''),
  target: z.string().default(''),
  status: z.enum(OBJECTIVE_STATUS).default('PENDING'),
};
export const createObjectiveSchema = z.object(objectiveFields);
export const updateObjectiveSchema = z.object({
  description: objectiveFields.description.optional(),
  metric: z.string().optional(),
  target: z.string().optional(),
  status: z.enum(OBJECTIVE_STATUS).optional(),
});

export const createMilestoneSchema = z.object({
  name: required('Escribe el nombre del hito'),
  dueDate: calendarDateSchema,
  status: z.enum(MILESTONE_STATUS).default('PENDING'),
});
export const updateMilestoneSchema = z.object({
  name: required('Escribe el nombre del hito').optional(),
  dueDate: calendarDateSchema.optional(),
  status: z.enum(MILESTONE_STATUS).optional(),
});

export const createStakeholderSchema = z.object({
  name: required('Escribe el nombre'),
  organization: z.string().default(''),
  position: z.string().default(''),
  contact: z.string().default(''),
  influence: z.enum(LEVEL).default('MEDIUM'),
  interest: z.enum(LEVEL).default('MEDIUM'),
  strategy: z.string().default(''),
});
export const updateStakeholderSchema = z.object({
  name: required('Escribe el nombre').optional(),
  organization: z.string().optional(),
  position: z.string().optional(),
  contact: z.string().optional(),
  influence: z.enum(LEVEL).optional(),
  interest: z.enum(LEVEL).optional(),
  strategy: z.string().optional(),
});

const scale = z.number({ message: 'Usa un valor de 1 a 5' }).int('Usa un valor de 1 a 5').min(1, 'Usa un valor de 1 a 5').max(5, 'Usa un valor de 1 a 5');
const ALL_RESPONSES = [...new Set(Object.values(RISK_RESPONSE).flat())] as [string, ...string[]];
const riskResponse = z.enum(ALL_RESPONSES, { message: 'Selecciona una respuesta' });
export const INVALID_RESPONSE_MESSAGE = 'Esta respuesta no corresponde al tipo de riesgo';
export const isResponseValidForType = (type: RiskType, response: string) =>
  (RISK_RESPONSE[type] as readonly string[]).includes(response);
export const createRiskSchema = z
  .object({
    description: required('Describe el riesgo'),
    type: z.enum(RISK_TYPE),
    probability: scale,
    impact: scale,
    response: riskResponse,
    responsePlan: z.string().default(''),
    ownerId: z.string().nullable().optional(),
    status: z.enum(RISK_STATUS).default('OPEN'),
  })
  .superRefine((value, ctx) => {
    if (!isResponseValidForType(value.type, value.response)) {
      ctx.addIssue({ code: 'custom', path: ['response'], message: INVALID_RESPONSE_MESSAGE });
    }
  });
export const updateRiskSchema = z.object({
  description: required('Describe el riesgo').optional(),
  type: z.enum(RISK_TYPE).optional(),
  probability: scale.optional(),
  impact: scale.optional(),
  response: riskResponse.optional(),
  responsePlan: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  status: z.enum(RISK_STATUS).optional(),
  version: versionField,
});

const amount = z.number({ message: 'Monto inválido' }).int('Monto inválido').positive('El monto debe ser mayor que cero').max(MAX_AMOUNT_CENTS, AMOUNT_TOO_LARGE);
export const createExpenseSchema = z.object({
  description: required('Describe el gasto'),
  amountCents: amount,
  date: calendarDateSchema,
  category: z.enum(EXPENSE_CATEGORY),
  taskId: z.string().nullable().optional(),
});
export const updateExpenseSchema = z.object({
  description: required('Describe el gasto').optional(),
  amountCents: amount.optional(),
  date: calendarDateSchema.optional(),
  category: z.enum(EXPENSE_CATEGORY).optional(),
  taskId: z.string().nullable().optional(),
});

const taskCommonFields = {
  description: z.string().optional(),
  priority: z.enum(PRIORITY).optional(),
  startDate: optionalDateSchema,
  dueDate: optionalDateSchema,
  milestoneId: z.string().nullable().optional(),
  plannedCostCents: budgetAmount.optional(),
};
export const TASK_DATE_ORDER_MESSAGE = 'La fecha de inicio no puede ser posterior a la fecha límite';
export const createTaskSchema = z
  .object({
    title: required('Escribe el título'),
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
  title: required('Escribe el título').optional(),
  ...taskCommonFields,
  assigneeIds: z.array(z.string()).optional(),
  version: versionField,
  status: z.undefined({ message: useProgressRoute }),
  progress: z.undefined({ message: useProgressRoute }),
});
export const assigneesSchema = z.object({ userIds: z.array(z.string()) });
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
  title: required('Escribe el paso'),
  assigneeId: z.string().nullable().optional(),
});
export const updateStepSchema = z.object({
  title: required('Escribe el paso').optional(),
  assigneeId: z.string().nullable().optional(),
  done: z.boolean().optional(),
});
export const commentSchema = z.object({ body: required('Escribe un comentario') });
export const dependencySchema = z.object({ predecessorId: required('Selecciona una tarea') });

export const baselineSchema = z.object({
  reason: z.string().trim().default(''),
  changeRequestId: z.string().nullable().optional(),
});

const changeRequestFields = {
  title: required('Escribe el título'),
  description: z.string().default(''),
  requestedBy: z.string().default(''),
  scopeImpact: z.string().default(''),
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
  description: z.string().optional(),
  requestedBy: z.string().optional(),
  scopeImpact: z.string().optional(),
  scheduleImpactDays: changeRequestFields.scheduleImpactDays,
  costImpactCents: changeRequestFields.costImpactCents,
});
/** Lo que puede enviar un colaborador al proponer un cambio. */
export const proposeChangeSchema = z.object({
  title: required('Escribe el título'),
  description: z.string().default(''),
});
export const decisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: required('Escribe la nota de la decisión'),
});

const optionalId = z.string().min(1, 'Selecciona una opción válida').nullable().optional();

/** Lo que puede enviar cualquier miembro al reportar un incidente. */
export const reportIncidentSchema = z.object({
  title: required('Escribe el título'),
  description: z.string().default(''),
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
  title: required('Escribe el título').optional(),
  description: z.string().optional(),
  taskId: optionalId,
  ...pmIncidentFields,
  status: z.enum(INCIDENT_STATUS).optional(),
  resolution: z.string().optional(),
  recordDecision: z.boolean().optional(),
});

export const decisionRecordSchema = z.object({
  title: required('Escribe el título'),
  rationale: z.string().default(''),
  decidedBy: z.string().default(''),
  decidedOn: calendarDateSchema,
  changeRequestId: optionalId,
  incidentId: optionalId,
});
export const updateDecisionRecordSchema = z.object({
  title: required('Escribe el título').optional(),
  rationale: z.string().optional(),
  decidedBy: z.string().optional(),
  decidedOn: calendarDateSchema.optional(),
  changeRequestId: optionalId,
  incidentId: optionalId,
});

const deliverableName = required('Escribe el nombre').max(200, 'Máximo 200 caracteres');
export const deliverableSchema = z.object({
  name: deliverableName,
  description: z.string().default(''),
  milestoneId: optionalId,
  dueDate: optionalDateSchema,
  criteria: z.array(z.string().max(300, 'Máximo 300 caracteres')).max(50, 'Máximo 50 criterios').optional(),
});
export const updateDeliverableSchema = z.object({
  name: deliverableName.optional(),
  description: z.string().optional(),
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
  note: z.string().default(''),
});

export const closeProjectSchema = z.object({
  finalStatus: z.enum(CLOSED_PROJECT_STATUS),
  summary: z.string().default(''),
  pendingReason: z.string().default(''),
});
export const reopenProjectSchema = z.object({ reason: required('Escribe el motivo') });
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
