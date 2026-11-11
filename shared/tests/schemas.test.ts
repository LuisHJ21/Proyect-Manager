import { describe, expect, it } from 'vitest';
import { CHANGE_STATUS, INCIDENT_STATUS, LABELS } from '../src/enums';
import { createIncidentSchema, decisionRecordSchema, reportIncidentSchema, updateIncidentSchema, baselineSchema, changeRequestSchema, createExpenseSchema, createMilestoneSchema, createTaskSchema, decisionSchema, updateTaskSchema } from '../src/schemas';

describe('mensajes de validación', () => {
  it('una fecha ausente da un mensaje en español', () => {
    const result = createMilestoneSchema.safeParse({ name: 'H', dueDate: null });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe('Este campo es obligatorio');
  });

  it('un campo ausente da un mensaje en español', () => {
    const result = createExpenseSchema.safeParse({ description: 'G', amountCents: 100, date: '2026-11-01' });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe('Este campo es obligatorio');
  });

  it('una opción fuera de la lista da un mensaje en español', () => {
    const result = createExpenseSchema.safeParse({ description: 'G', amountCents: 100, date: '2026-11-01', category: 'X' });
    expect(result.error!.issues[0]!.message).toBe('Selecciona una opción válida');
  });
});

describe('línea base y cambios', () => {
  it('el costo planeado de una tarea no admite negativos ni decimales', () => {
    expect(createTaskSchema.safeParse({ title: 'T', plannedCostCents: -1 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'T', plannedCostCents: 10.5 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'T', plannedCostCents: 123450 }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ plannedCostCents: 5 }).success).toBe(true);
  });
  it('un cambio admite impacto negativo en plazo y costo', () => {
    expect(changeRequestSchema.parse({ title: 'X', scheduleImpactDays: -3, costImpactCents: -5000 })).toMatchObject({ scheduleImpactDays: -3, costImpactCents: -5000 });
  });
  it('la decisión exige nota', () => {
    expect(decisionSchema.safeParse({ status: 'APPROVED', note: '  ' }).success).toBe(false);
    expect(decisionSchema.safeParse({ status: 'REJECTED', note: 'No' }).success).toBe(true);
  });
  it('la línea base admite motivo vacío', () => {
    expect(baselineSchema.parse({}).reason).toBe('');
  });
  it('un gasto admite tarea opcional', () => {
    expect(createExpenseSchema.parse({ description: 'G', amountCents: 1, date: '2026-11-01', category: 'OTHER', taskId: 't1' }).taskId).toBe('t1');
  });
  it('las etiquetas de estado de cambio están en español', () => {
    expect(LABELS.changeStatus).toEqual({ PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada' });
    expect(CHANGE_STATUS).toEqual(['PENDING', 'APPROVED', 'REJECTED']);
  });
});

describe('incidentes y decisiones', () => {
  it('reportar exige título y no admite una tarea vacía', () => {
    expect(reportIncidentSchema.safeParse({ title: ' ' }).success).toBe(false);
    expect(reportIncidentSchema.safeParse({ title: 'X', taskId: '' }).success).toBe(false);
    expect(reportIncidentSchema.safeParse({ title: 'X', taskId: null }).success).toBe(true);
  });
  it('el PM puede fijar responsable, prioridad, fecha y riesgo', () => {
    expect(createIncidentSchema.parse({ title: 'X', priority: 'HIGH', dueDate: '2026-11-20', ownerId: 'u1', riskId: 'r1' })).toMatchObject({ priority: 'HIGH', ownerId: 'u1' });
    expect(updateIncidentSchema.safeParse({ status: 'DONE' }).success).toBe(false);
  });
  it('la decisión exige fecha válida', () => {
    expect(decisionRecordSchema.safeParse({ title: 'D', decidedOn: '2026-02-30' }).success).toBe(false);
    expect(decisionRecordSchema.parse({ title: 'D', decidedOn: '2026-11-10' })).toMatchObject({ rationale: '', decidedBy: '' });
  });
  it('los estados de incidente están en español', () => {
    expect(LABELS.incidentStatus).toEqual({ OPEN: 'Abierto', IN_PROGRESS: 'En curso', RESOLVED: 'Resuelto', CLOSED: 'Cerrado' });
    expect(INCIDENT_STATUS).toEqual(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
  });
});
