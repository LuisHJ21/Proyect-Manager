import { z } from 'zod';
import { isValidCalendarDate } from './dates';

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
