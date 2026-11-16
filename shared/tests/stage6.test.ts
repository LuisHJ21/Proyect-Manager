import { describe, expect, it } from 'vitest';
import { accessLevel } from '../src/access';
import { LABELS, NOTIFICATION_KIND } from '../src/enums';
import { convertAgreementSchema, createCommunicationItemSchema, meetingSchema, statusReportSchema, updateProjectSchema, updateStakeholderSchema } from '../src/schemas';

describe('etapa 6: permisos y esquemas', () => {
  it('el observador lee informes y no actas; el colaborador ve sus actas y no informes', () => {
    expect(accessLevel('OBSERVER', 'reports')).toBe('read');
    expect(accessLevel('OBSERVER', 'meetings')).toBe('none');
    expect(accessLevel('COLLABORATOR', 'reports')).toBe('none');
    expect(accessLevel('COLLABORATOR', 'meetings')).toBe('own');
    expect(accessLevel('PM', 'meetings')).toBe('write');
    expect(accessLevel('PM', 'reports')).toBe('write');
  });

  it('acta: acuerdo sin texto se rechaza y la conversión solo acepta tres destinos', () => {
    expect(meetingSchema.safeParse({ title: 'Kickoff', date: '2026-11-16', userIds: [], stakeholderIds: [], agreements: [{ text: '' }] }).success).toBe(false);
    expect(meetingSchema.safeParse({ title: 'Kickoff', date: '2026-11-16', agreements: [{ text: 'Enviar minuta', dueDate: '2026-11-20' }] }).success).toBe(true);
    expect(convertAgreementSchema.safeParse({ kind: 'risk' }).success).toBe(false);
    expect(convertAgreementSchema.safeParse({ kind: 'task' }).success).toBe(true);
  });

  it('involucramiento acepta null y rechaza niveles inventados', () => {
    expect(updateStakeholderSchema.safeParse({ currentEngagement: null }).success).toBe(true);
    expect(updateStakeholderSchema.safeParse({ desiredEngagement: 'FAN' }).success).toBe(false);
  });

  it('frecuencia del informe, plan de comunicaciones, informe y etiquetas', () => {
    expect(updateProjectSchema.parse({ statusReportFrequency: 'WEEKLY' })).toMatchObject({ statusReportFrequency: 'WEEKLY' });
    expect(createCommunicationItemSchema.parse({ topic: 'Avance' })).toMatchObject({ frequency: 'AS_NEEDED', audience: '' });
    expect(createCommunicationItemSchema.safeParse({ topic: '' }).success).toBe(false);
    expect(statusReportSchema.parse({})).toEqual({ comment: '', nextSteps: '' });
    expect(NOTIFICATION_KIND).toContain('STATUS_REPORT_ISSUED');
    expect(LABELS.engagement.SUPPORTIVE).toBe('De apoyo');
    expect(LABELS.reportFrequency.BIWEEKLY).toBe('Quincenal');
    expect(LABELS.communicationFrequency.PER_MILESTONE).toBe('Por hito');
  });
});
