import { describe, expect, it } from 'vitest';
import { buildTimelineLayout } from '../src/components/tasks/timelineLayout';

const DAY = 10;
const task = (id: string, startDate: string | null, dueDate: string | null, predecessorIds: string[] = []) => ({ id, startDate, dueDate, predecessorIds });

describe('buildTimelineLayout', () => {
  it('coloca las barras según sus fechas de calendario, incluido un cambio de mes', () => {
    const layout = buildTimelineLayout([task('a', '2026-11-30', '2026-12-02'), task('b', '2026-12-05', '2026-12-05')], [], DAY);
    expect(layout.rangeStart).toBe('2026-11-30');
    expect(layout.rangeEnd).toBe('2026-12-05');
    expect(layout.bars[0]).toMatchObject({ taskId: 'a', x: 0, width: 30 });
    expect(layout.bars[1]).toMatchObject({ taskId: 'b', x: 50, width: 10 });
    expect(layout.bars[1]!.y).toBeGreaterThan(layout.bars[0]!.y);
  });

  it('una tarea sin startDate o sin dueDate va a undated y no genera barra', () => {
    const layout = buildTimelineLayout([task('a', null, '2026-12-02'), task('b', '2026-12-01', null), task('c', '2026-12-01', '2026-12-01')], [], DAY);
    expect(layout.undated).toEqual(['a', 'b']);
    expect(layout.bars.map((b) => b.taskId)).toEqual(['c']);
  });

  it('crea una flecha por dependencia, omitiendo tareas sin barra', () => {
    const layout = buildTimelineLayout(
      [task('a', '2026-12-01', '2026-12-02'), task('b', '2026-12-03', '2026-12-04', ['a', 'sinbarra']), task('sinbarra', null, null)],
      [],
      DAY,
    );
    expect(layout.arrows).toHaveLength(1);
    expect(layout.arrows[0]).toMatchObject({ from: 'a', to: 'b' });
    expect(layout.arrows[0]!.path).toMatch(/^M/);
  });

  it('una tarea de un solo día tiene el ancho de un día', () => {
    expect(buildTimelineLayout([task('a', '2026-12-01', '2026-12-01')], [], DAY).bars[0]!.width).toBe(DAY);
  });

  it('los hitos amplían el rango y se ubican por fecha', () => {
    const layout = buildTimelineLayout([task('a', '2026-12-05', '2026-12-05')], [{ id: 'm', dueDate: '2026-12-01' }], DAY);
    expect(layout.rangeStart).toBe('2026-12-01');
    expect(layout.milestones[0]).toEqual({ id: 'm', x: 0 });
    expect(layout.bars[0]!.x).toBe(40);
  });

  it('sin tareas devuelve un layout vacío sin error', () => {
    const layout = buildTimelineLayout([], [], DAY);
    expect(layout).toMatchObject({ bars: [], arrows: [], milestones: [], undated: [], rangeStart: '', rangeEnd: '' });
  });

  it('marca las barras de las tareas padre como resumen', () => {
    const layout = buildTimelineLayout(
      [{ ...task('p', '2026-12-01', '2026-12-05'), isSummary: true }, task('h', '2026-12-01', '2026-12-05')],
      [],
      DAY,
    );
    expect(layout.bars.map((b) => [b.taskId, b.summary])).toEqual([['p', true], ['h', false]]);
    expect(layout.bars[0]!.height).toBeLessThan(layout.bars[1]!.height);
  });
});
