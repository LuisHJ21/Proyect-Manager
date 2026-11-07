import { z } from 'zod';
import { isValidCalendarDate } from './dates';
import {
  APPROACH,
  EXPENSE_CATEGORY,
  LEVEL,
  MILESTONE_STATUS,
  OBJECTIVE_STATUS,
  PRIORITY,
  PROJECT_STATUS,
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

const required = (message = 'Este campo es obligatorio') => z.string().trim().min(1, message);

export const emailSchema = z.string().trim().toLowerCase().email('Correo inválido');
export const passwordSchema = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres');

export const setupSchema = z.object({
  name: required('Escribe tu nombre'),
  email: emailSchema,
  password: passwordSchema,
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

const projectFields = {
  name: required('Escribe el nombre del proyecto'),
  description: z.string().default(''),
  status: z.enum(PROJECT_STATUS).default('PLANNING'),
  approach: z.enum(APPROACH).default('PREDICTIVE'),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  plannedBudgetCents: z.number({ message: 'Monto inválido' }).int('Monto inválido').min(0, 'Monto inválido').default(0),
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
  status: z.enum(PROJECT_STATUS).optional(),
  approach: z.enum(APPROACH).optional(),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  plannedBudgetCents: z.number({ message: 'Monto inválido' }).int('Monto inválido').min(0, 'Monto inválido').optional(),
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
});

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
});

const amount = z.number({ message: 'Monto inválido' }).int('Monto inválido').positive('El monto debe ser mayor que cero');
export const createExpenseSchema = z.object({
  description: required('Describe el gasto'),
  amountCents: amount,
  date: calendarDateSchema,
  category: z.enum(EXPENSE_CATEGORY),
});
export const updateExpenseSchema = z.object({
  description: required('Describe el gasto').optional(),
  amountCents: amount.optional(),
  date: calendarDateSchema.optional(),
  category: z.enum(EXPENSE_CATEGORY).optional(),
});

const taskCommonFields = {
  description: z.string().optional(),
  priority: z.enum(PRIORITY).optional(),
  startDate: optionalDateSchema,
  dueDate: optionalDateSchema,
  milestoneId: z.string().nullable().optional(),
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
export const commentSchema = z.object({ body: required('Escribe un comentario') });
export const dependencySchema = z.object({ predecessorId: required('Selecciona una tarea') });
