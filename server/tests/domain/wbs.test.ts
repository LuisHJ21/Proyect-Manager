import { describe, expect, it } from 'vitest';
import { buildWbs, isLeaf, subtreeHeight, summarize, type WbsTask } from '../../src/domain/wbs';

const t = (id: string, parentId: string | null, position: number, over: Partial<WbsTask> = {}): WbsTask => ({
  id,
  parentId,
  position,
  createdAt: '2026-01-01T00:00:00.000Z',
  status: 'TODO',
  progress: 0,
  plannedCostCents: 0,
  startDate: null,
  dueDate: null,
  ...over,
});

describe('buildWbs', () => {
  const tasks = [t('b', null, 2), t('a', null, 1), t('a2', 'a', 2), t('a1', 'a', 1), t('a21', 'a2', 1)];
  const nodes = buildWbs(tasks);

  it('numera por posición entre hermanas', () => {
    expect(['a', 'b', 'a1', 'a2', 'a21'].map((id) => nodes.get(id)!.code)).toEqual(['1', '2', '1.1', '1.2', '1.2.1']);
  });

  it('a igual posición desempata por fecha de creación', () => {
    const tied = buildWbs([t('x', null, 0, { createdAt: '2026-01-02T00:00:00.000Z' }), t('y', null, 0, { createdAt: '2026-01-01T00:00:00.000Z' })]);
    expect(tied.get('y')!.code).toBe('1');
    expect(tied.get('x')!.code).toBe('2');
  });

  it('antecesoras, hojas descendientes, profundidad y altura', () => {
    expect(nodes.get('a21')!.ancestorIds).toEqual(['a', 'a2']);
    expect(nodes.get('a21')!.depth).toBe(3);
    expect(nodes.get('a')!.leafIds.sort()).toEqual(['a1', 'a21']);
    expect(nodes.get('b')!.leafIds).toEqual(['b']);
    expect(nodes.get('a')!.childIds).toEqual(['a1', 'a2']);
    expect(subtreeHeight(nodes, 'a')).toBe(3);
    expect(subtreeHeight(nodes, 'b')).toBe(1);
    expect(isLeaf(nodes, 'a1')).toBe(true);
    expect(isLeaf(nodes, 'a')).toBe(false);
  });
});

describe('summarize', () => {
  it('fechas extremas, costo sumado y avance ponderado', () => {
    const result = summarize([
      t('1', null, 1, { plannedCostCents: 100, progress: 100, startDate: '2026-03-01', dueDate: '2026-03-05' }),
      t('2', null, 2, { plannedCostCents: 300, progress: 0, startDate: null, dueDate: '2026-03-20' }),
    ]);
    expect(result).toMatchObject({ startDate: '2026-03-01', dueDate: '2026-03-20', plannedCostCents: 400, progress: 25 });
  });

  it('sin fechas en ninguna hoja', () => {
    expect(summarize([t('1', null, 1)])).toMatchObject({ startDate: null, dueDate: null });
  });

  it.each([
    [['DONE', 'DONE'], 'DONE'],
    [['BLOCKED', 'TODO'], 'BLOCKED'],
    [['BLOCKED', 'IN_PROGRESS'], 'IN_PROGRESS'],
    [['BLOCKED', 'DONE'], 'BLOCKED'],
    [['DONE', 'TODO'], 'IN_PROGRESS'],
    [['TODO', 'TODO'], 'TODO'],
  ])('estado de %j es %s', (statuses, expected) => {
    expect(summarize(statuses.map((status, i) => t(String(i), null, i, { status }))).status).toBe(expected);
  });
});
