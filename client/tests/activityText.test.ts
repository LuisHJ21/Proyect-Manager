import { formatMoney } from '@pm/shared';
import { describe, expect, it } from 'vitest';
import type { ActivityLog } from '../src/api/types';
import { describeActivity, describeChanges } from '../src/lib/activity';

const log = (over: Partial<ActivityLog> = {}): ActivityLog => ({
  id: 'a1',
  action: 'updated',
  entity: 'task',
  entityId: 't1',
  entityLabel: 'Diseño del portal',
  changes: [],
  createdAt: '2026-11-14T10:42:00.000Z',
  user: { id: 'u1', name: 'Ana López' },
  ...over,
});

describe('frases de la bitácora', () => {
  it('verbo y elemento con artículo', () => {
    expect(describeActivity(log({ action: 'created', entity: 'risk', entityLabel: 'Proveedor tarde' }))).toBe('creó el riesgo «Proveedor tarde»');
    expect(describeActivity(log({ action: 'deleted', entity: 'expense', entityLabel: 'Licencias' }))).toBe('borró el gasto «Licencias»');
    expect(describeActivity(log({ action: 'approved', entity: 'project', entityLabel: 'Portal' }))).toBe('aprobó el acta del proyecto «Portal»');
    expect(describeActivity(log({ action: 'commented', entity: 'comment' }))).toBe('comentó en la tarea «Diseño del portal»');
    expect(describeActivity(log({ action: 'uploaded', entity: 'attachment', entityLabel: 'plano.pdf' }))).toBe('subió el anexo «plano.pdf»');
  });

  it('«cambió» con valores y «actualizó» sin ellos', () => {
    expect(describeActivity(log({ changes: [{ field: 'status', from: 'IN_PROGRESS', to: 'DONE' }] }))).toBe('cambió la tarea «Diseño del portal»');
    expect(describeActivity(log({ entity: 'deliverable', entityLabel: 'Portal', changes: [{ field: 'description' }] }))).toBe('actualizó el entregable «Portal»');
  });

  it('valores traducidos', () => {
    const { valued, others } = describeChanges(
      log({
        changes: [
          { field: 'status', from: 'IN_PROGRESS', to: 'DONE' },
          { field: 'progress', from: 80, to: 100 },
          { field: 'dueDate', from: null, to: '2026-12-31' },
          { field: 'assignees', from: ['Ana'], to: ['Ana', 'Luis'] },
          { field: 'description' },
          { field: 'charter.scopeIncluded' },
        ],
      }),
      'USD',
    );
    expect(valued).toEqual([
      'Estado: En curso → Hecha',
      'Avance: 80 % → 100 %',
      'Fecha límite: — → 31 dic 2026',
      'Asignados: Ana → Ana, Luis',
    ]);
    expect(others).toEqual(['descripción', 'acta']);
  });

  it('dinero, booleanos y enumeraciones de otros tipos', () => {
    const money = describeChanges(log({ entity: 'expense', changes: [{ field: 'amountCents', from: 1000, to: 2500 }] }), 'USD').valued[0]!;
    expect(money).toBe(`Monto: ${formatMoney(1000, 'USD')} → ${formatMoney(2500, 'USD')}`);
    expect(describeChanges(log({ entity: 'deliverable', changes: [{ field: 'met', from: false, to: true }] }), 'USD').valued).toEqual(['Cumplido: No → Sí']);
    expect(describeChanges(log({ entity: 'risk', changes: [{ field: 'status', from: 'OPEN', to: 'TREATING' }] }), 'USD').valued).toEqual(['Estado: Abierto → En tratamiento']);
    expect(describeChanges(log({ entity: 'raci', changes: [{ field: 'role', from: null, to: 'R' }] }), 'USD').valued).toEqual(['Rol RACI: — → R']);
  });
});
