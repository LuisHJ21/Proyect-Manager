import { z } from 'zod';
import { isValidCalendarDate } from './dates';

export const calendarDateSchema = z
  .string()
  .refine(isValidCalendarDate, 'Fecha inválida');
export const optionalDateSchema = calendarDateSchema.nullable().optional();
