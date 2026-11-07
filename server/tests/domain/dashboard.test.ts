import { describe, expect, it } from 'vitest';
import { buildDashboard, type DashboardInput } from '../../src/domain/dashboard';

const TODAY = '2026-11-07';
const project = (id: string, over: Partial<DashboardInput['projects'][number]> = {}): DashboardInput['projects'][number] => ({
  id,
  name: `Proyecto ${id}`,
  status: 'EXECUTING',
  endDate: null,
  plannedBudgetCents: 0,
  team: [],
  ...over,
});
const task = (id: string, projectId: string, over: Partial<DashboardInput['tasks'][number]> = {}): DashboardInput['tasks'][number] => ({
  id,
  title: `Tarea ${id}`,
  projectId,
  status: 'TODO',
  progress: 0,
  dueDate: null,
  assignees: [],
  ...over,
});
const risk = (id: string, projectId: string, probability: number, impact: number, status = 'OPEN') => ({
  id,
  description: `Riesgo ${id}`,
  projectId,
  probability,
  impact,
  status,
});
const empty: DashboardInput = { projects: [], tasks: [], risks: [], expenses: [], milestones: [] };

describe('buildDashboard', () => {
  it('solo cuenta proyectos activos', () => {
    const result = buildDashboard(
      {
        ...empty,
        projects: [project('a'), project('b', { status: 'CLOSED' }), project('c', { status: 'PAUSED' })],
        tasks: [task('1', 'b', { dueDate: '2026-11-01' }), task('2', 'a', { dueDate: '2026-11-01' })],
        risks: [risk('r', 'b', 5, 5)],
        milestones: [{ id: 'm', name: 'H', dueDate: TODAY, status: 'PENDING', projectId: 'b' }],
      },
      TODAY,
    );
    expect(result.totals.activeProjects).toBe(2);
    expect(result.totals.overdueTasks).toBe(1);
    expect(result.totals.highRisks).toBe(0);
    expect(result.projects.map((p) => p.id).sort()).toEqual(['a', 'c']);
    expect(result.upcomingMilestones).toEqual([]);
  });

  it('ordena por salud y luego por fin, con fechas vacías al final', () => {
    const result = buildDashboard(
      {
        ...empty,
        projects: [
          project('alDiaSinFecha'),
          project('alDia', { endDate: '2027-01-01' }),
          project('atencion', { endDate: '2027-02-01' }),
          project('riesgo', { endDate: '2026-11-01' }),
        ],
        risks: [risk('r', 'atencion', 5, 5)],
      },
      TODAY,
    );
    expect(result.projects.map((p) => p.id)).toEqual(['riesgo', 'atencion', 'alDia', 'alDiaSinFecha']);
  });

  it('attention: máximo 8, primero vencidas de la más antigua, luego riesgos de mayor puntaje', () => {
    const tasks = [task('nueva', 'a', { dueDate: '2026-11-06' }), task('vieja', 'a', { dueDate: '2026-10-01' })];
    const risks = [risk('r15', 'a', 3, 5), risk('r25', 'a', 5, 5), risk('r10', 'a', 2, 5)];
    const result = buildDashboard({ ...empty, projects: [project('a')], tasks, risks }, TODAY);
    expect(result.attention.map((a) => a.id)).toEqual(['vieja', 'nueva', 'r25', 'r15']);
    expect(result.attention[2]).toMatchObject({ kind: 'risk', title: 'Riesgo r25', score: 25, projectName: 'Proyecto a' });
    expect(result.attention[0]).toMatchObject({ kind: 'task', title: 'Tarea vieja', dueDate: '2026-10-01' });

    const many = Array.from({ length: 12 }, (_, i) => task(String(i), 'a', { dueDate: '2026-11-01' }));
    expect(buildDashboard({ ...empty, projects: [project('a')], tasks: many }, TODAY).attention).toHaveLength(8);
  });

  it('workload: solo colaboradores activos con abiertas, de mayor a menor', () => {
    const ana = { id: 'ana', name: 'Ana', role: 'COLLABORATOR', active: true };
    const beto = { id: 'beto', name: 'Beto', role: 'COLLABORATOR', active: true };
    const off = { id: 'off', name: 'Off', role: 'COLLABORATOR', active: false };
    const jefa = { id: 'pm', name: 'Jefa', role: 'PM', active: true };
    const tasks = [
      task('1', 'a', { assignees: [ana, off, jefa] }),
      task('2', 'a', { assignees: [beto], dueDate: '2026-11-01' }),
      task('3', 'a', { assignees: [beto] }),
      task('4', 'a', { assignees: [ana], status: 'DONE' }),
    ];
    const result = buildDashboard({ ...empty, projects: [project('a')], tasks }, TODAY);
    expect(result.workload).toEqual([
      { userId: 'beto', name: 'Beto', openTasks: 2, overdueTasks: 1 },
      { userId: 'ana', name: 'Ana', openTasks: 1, overdueTasks: 0 },
    ]);
  });

  it('hitos: hoy y hoy+14 sí; hoy+15, vencidos y alcanzados no', () => {
    const milestone = (id: string, dueDate: string, status = 'PENDING') => ({ id, name: id, dueDate, status, projectId: 'a' });
    const result = buildDashboard(
      {
        ...empty,
        projects: [project('a')],
        milestones: [
          milestone('limite', '2026-11-21'),
          milestone('hoy', TODAY),
          milestone('tarde', '2026-11-22'),
          milestone('pasado', '2026-11-06'),
          milestone('listo', '2026-11-10', 'REACHED'),
        ],
      },
      TODAY,
    );
    expect(result.upcomingMilestones.map((m) => m.id)).toEqual(['hoy', 'limite']);
    expect(result.upcomingMilestones[0]!.projectName).toBe('Proyecto a');
  });

  it('totales: overdueProjects cuenta proyectos distintos; sobre presupuesto y en riesgo', () => {
    const result = buildDashboard(
      {
        ...empty,
        projects: [project('a', { plannedBudgetCents: 100 }), project('b'), project('c', { plannedBudgetCents: 100 })],
        tasks: [task('1', 'a', { dueDate: '2026-11-01' }), task('2', 'a', { dueDate: '2026-11-01' }), task('3', 'b', { dueDate: '2026-11-01' })],
        expenses: [
          { projectId: 'c', amountCents: 150 },
          { projectId: 'a', amountCents: 10 },
        ],
      },
      TODAY,
    );
    expect(result.totals).toEqual({ activeProjects: 3, atRiskProjects: 1, overdueTasks: 3, overdueProjects: 2, highRisks: 0, overBudgetProjects: 1 });
  });
});
