import { z } from 'zod';
import { isValidCalendarDate } from './dates';
import { APPROACH, PROJECT_STATUS, ROLE } from './enums';

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
