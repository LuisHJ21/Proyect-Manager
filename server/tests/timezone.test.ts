import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

/** 20:00 en Lima es la 01:00 UTC del día siguiente: "hoy" depende de la zona configurada. */
describe('fecha del servidor según la zona horaria', () => {
  let ctx: TestCtx;
  afterEach(() => ctx.close());

  const overdueAt = async (timeZone: string) => {
    ctx = await createTestApp({ timeZone });
    ctx.clock.set('2026-11-07T01:00:00Z');
    const pm = await ctx.makeUser({ role: 'PM' });
    const project = await ctx.makeProject();
    await ctx.makeTask(project.id, { dueDate: '2026-11-06', status: 'TODO' });
    return (await ctx.as(pm).get(`/api/projects/${project.id}/indicators`)).json().overdueTasks;
  };

  it('a las 20:00 de Lima una tarea que vence hoy no aparece vencida', async () => {
    expect(await overdueAt('America/Lima')).toBe(0);
  });

  it('en UTC ese mismo instante ya es el día siguiente y la tarea está vencida', async () => {
    expect(await overdueAt('UTC')).toBe(1);
  });
});
