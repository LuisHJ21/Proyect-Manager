import { describe, expect, it } from 'vitest';
import { buildTraceability } from '../../src/domain/traceability';

describe('matriz de trazabilidad', () => {
  const deliverables = [
    { id: 'd1', number: 1, name: 'Portal', status: 'IN_REVIEW', tasks: [{ status: 'DONE' }, { status: 'TODO' }, { status: 'DONE' }], criteria: [{ met: true }, { met: false }] },
    { id: 'd2', number: 2, name: 'Manual', status: 'PENDING', tasks: [], criteria: [] },
    { id: 'd3', number: 3, name: 'Capacitación', status: 'PENDING', tasks: [{ status: 'TODO' }], criteria: [{ met: true }] },
  ];

  it('cuenta tareas terminadas y criterios cumplidos por entregable, en orden de número', () => {
    const matrix = buildTraceability({
      requirements: [
        { id: 'r2', number: 2, description: 'Reportes', status: 'PROPOSED', priority: 'LOW', deliverableIds: [] },
        { id: 'r1', number: 1, description: 'Acceso', status: 'APPROVED', priority: 'HIGH', deliverableIds: ['d3', 'd1'] },
      ],
      deliverables,
    });
    expect(matrix.requirements.map((r) => r.number)).toEqual([1, 2]);
    expect(matrix.requirements[0]!.deliverables).toEqual([
      { id: 'd1', number: 1, name: 'Portal', status: 'IN_REVIEW', tasks: { done: 2, total: 3 }, criteria: { met: 1, total: 2 } },
      { id: 'd3', number: 3, name: 'Capacitación', status: 'PENDING', tasks: { done: 0, total: 1 }, criteria: { met: 1, total: 1 } },
    ]);
    expect(matrix.requirements[1]!.deliverables).toEqual([]);
    expect(matrix.orphanDeliverables).toEqual([{ id: 'd2', number: 2, name: 'Manual' }]);
  });
});
