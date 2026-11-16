import type { User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('umbrales de salud por proyecto', () => {
  let ctx: TestCtx;
  let pm: User;
  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-17T10:00:00');
    pm = await ctx.makeUser({ role: 'PM' });
  });
  afterEach(() => ctx.close());

  const withOverdueTask = async (name: string, data: object = {}) => {
    const project = await ctx.makeProject({ name });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'EXECUTING', ...data } });
    await ctx.makeTask(project.id, { title: 'Vencida', dueDate: '2026-11-10' });
    return project;
  };

  it('una sola tarea vencida pone en riesgo al proyecto que lo pide, sin cambiar a los demás', async () => {
    const strict = await withOverdueTask('Estricto', { healthOverdueTasks: 1 });
    const normal = await withOverdueTask('Normal');
    const listed = (await ctx.as(pm).get('/api/projects')).json();
    expect(listed.find((p: { id: string }) => p.id === strict.id).health).toBe('AT_RISK');
    expect(listed.find((p: { id: string }) => p.id === normal.id).health).toBe('ATTENTION');
    const dashboard = (await ctx.as(pm).get('/api/dashboard')).json();
    const healthOf = (id: string) => dashboard.projects.find((p: { id: string }) => p.id === id).health;
    expect(healthOf(strict.id)).toBe('AT_RISK');
    expect(healthOf(normal.id)).toBe('ATTENTION');
  });

  it('el puntaje de riesgo alto del proyecto cambia indicadores, panel y prioridad al pasar a incidente', async () => {
    const project = await ctx.makeProject({ name: 'Sensible' });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'EXECUTING', highRiskScore: 9 } });
    const risk = await ctx.prisma.risk.create({ data: { projectId: project.id, description: 'Lluvias', type: 'THREAT', probability: 3, impact: 3, response: 'MITIGATE' } });
    expect((await ctx.as(pm).get(`/api/projects/${project.id}/indicators`)).json().highRisks).toBe(1);
    const dashboard = (await ctx.as(pm).get('/api/dashboard')).json();
    expect(dashboard.attention.some((a: { kind: string; id: string }) => a.kind === 'risk' && a.id === risk.id)).toBe(true);
    const incident = await ctx.as(pm).post(`/api/projects/${project.id}/risks/${risk.id}/incident`, {});
    expect(incident.json().priority).toBe('HIGH');
  });

  it('el informe de estado marca alto según el umbral del proyecto', async () => {
    const project = await ctx.makeProject({ name: 'Informe' });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'EXECUTING', highRiskScore: 9 } });
    await ctx.prisma.risk.create({ data: { projectId: project.id, description: 'Lluvias', type: 'THREAT', probability: 3, impact: 3, response: 'MITIGATE' } });
    const draft = (await ctx.as(pm).get(`/api/projects/${project.id}/status-reports/draft`)).json();
    expect(draft.report.risks.top[0].high).toBe(true);
  });
});
