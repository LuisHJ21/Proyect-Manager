import { z } from 'zod';
import { required } from './schemas';

export const RACI_ROLE = ['R', 'A', 'C', 'I'] as const;
export type RaciRole = (typeof RACI_ROLE)[number];
export type RaciWarning = 'missing_a' | 'multiple_a' | 'missing_r';
export const RACI_PARTY_KIND = ['member', 'stakeholder'] as const;
export type RaciPartyKind = (typeof RACI_PARTY_KIND)[number];

export const raciActivitySchema = z.object({
  title: required('Escribe la actividad'),
  description: z.string().default(''),
});
export const updateRaciActivitySchema = z.object({
  title: required('Escribe la actividad').optional(),
  description: z.string().optional(),
});
export const raciCellSchema = z.object({
  activityId: required('Selecciona una actividad'),
  kind: z.enum(RACI_PARTY_KIND),
  partyId: required('Selecciona un participante'),
  role: z.enum(RACI_ROLE, { message: 'Usa R, A, C o I' }).nullable(),
});
