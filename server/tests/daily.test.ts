import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../src/auth/sessions';
import { LoginLimiter } from '../src/auth/loginLimiter';
import { runDailyJobs } from '../src/jobs/daily';
import { createTestApp, type TestCtx } from './helpers/testApp';

const HOUR = 3_600_000;

describe('tarea diaria', () => {
  let ctx: TestCtx;
  let pm: User;
  const now = new Date('2026-11-06T10:00:00Z');
  const stored = (name: string) => existsSync(join(ctx.dataDir, 'uploads', name));

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(now.toISOString());
    pm = await ctx.makeUser({ role: 'PM' });
  });
  afterEach(() => ctx.close());

  /** Proyecto con una tarea con costo y fechas, y su línea base fijada. */
  const projectWithBaseline = async (name: string) => {
    const project = await ctx.makeProject({ name });
    await ctx.makeTask(project.id, { startDate: '2026-11-01', dueDate: '2026-11-30' });
    await ctx.prisma.task.updateMany({ where: { projectId: project.id }, data: { plannedCostCents: 100_000n } });
    expect((await ctx.as(pm).post(`/api/projects/${project.id}/baselines`, {})).statusCode).toBe(201);
    return project;
  };

  it('borra las sesiones vencidas y conserva las vigentes', async () => {
    await createSession(ctx.prisma, pm.id, new Date(now.getTime() - 13 * HOUR));
    await createSession(ctx.prisma, pm.id, new Date(now.getTime() - HOUR));
    const result = await runDailyJobs(ctx.deps);
    expect(result.sessions).toBe(1);
    expect(await ctx.prisma.session.count()).toBe(1);
  });

  it('borra los intentos de inicio de sesión vencidos', async () => {
    const limiter = new LoginLimiter(ctx.prisma);
    await limiter.recordFailure('viejo', new Date(now.getTime() - HOUR));
    await limiter.recordFailure('reciente', new Date(now.getTime() - 60_000));
    expect((await runDailyJobs(ctx.deps)).loginAttempts).toBe(1);
    expect((await ctx.prisma.loginAttempt.findMany()).map((a) => a.key)).toEqual(['reciente']);
  });

  it('borra los anexos pendientes de más de 24 horas con su archivo y conserva los recientes', async () => {
    const project = await ctx.makeProject();
    const pending = (storedName: string, hoursAgo: number, uploadedAt: Date | null = null) =>
      ctx.prisma.attachment.create({
        data: {
          projectId: project.id,
          uploadedById: pm.id,
          originalName: 'a.pdf',
          storedName,
          mimeType: 'application/pdf',
          size: 1,
          uploadedAt,
          createdAt: new Date(now.getTime() - hoursAgo * HOUR),
        },
      });
    await pending('viejo', 25);
    await pending('nuevo', 1);
    await pending('confirmado', 48, new Date(now.getTime() - 48 * HOUR));
    for (const name of ['viejo', 'nuevo', 'confirmado']) await ctx.files.put(name, Buffer.from('x'));

    expect((await runDailyJobs(ctx.deps)).pendingUploads).toBe(1);
    expect((await ctx.prisma.attachment.findMany({ orderBy: { storedName: 'asc' } })).map((a) => a.storedName)).toEqual(['confirmado', 'nuevo']);
    expect(stored('viejo')).toBe(false);
    expect(stored('nuevo')).toBe(true);
    expect(stored('confirmado')).toBe(true);
  });

  it('guarda la foto de valor ganado de los proyectos activos con línea base', async () => {
    const active = await projectWithBaseline('Activo');
    const closed = await projectWithBaseline('Cerrado');
    await ctx.prisma.project.update({ where: { id: closed.id }, data: { status: 'CLOSED' } });
    await ctx.makeProject({ name: 'Sin línea base' });

    const result = await runDailyJobs(ctx.deps);
    expect(result.snapshots).toBe(1);
    const snapshots = await ctx.prisma.evmSnapshot.findMany();
    expect(snapshots.map((s) => [s.projectId, s.date])).toEqual([[active.id, ctx.deps.today()]]);
    expect(snapshots[0]!.bacCents).toBe(100_000n);
  });

  it('no mide proyectos en pausa: ni foto de valor ganado ni pronóstico de hitos', async () => {
    const active = await projectWithBaseline('Activo');
    const paused = await projectWithBaseline('En pausa');
    for (const p of [active, paused]) await ctx.prisma.milestone.create({ data: { projectId: p.id, name: 'Hito', dueDate: '2026-12-01' } });
    await ctx.prisma.project.update({ where: { id: paused.id }, data: { status: 'PAUSED' } });
    const result = await runDailyJobs(ctx.deps);
    expect(result.snapshots).toBe(1);
    expect((await ctx.prisma.evmSnapshot.findMany()).map((s) => s.projectId)).toEqual([active.id]);
    const forecasts = await ctx.prisma.milestoneForecast.findMany({ include: { milestone: true } });
    expect(forecasts.map((f) => f.milestone.projectId)).toEqual([active.id]);
  });

  it('si Storage falla, guarda igual las fotos y termina con error', async () => {
    const active = await projectWithBaseline('Activo');
    await ctx.prisma.attachment.create({
      data: { projectId: active.id, uploadedById: pm.id, originalName: 'a.pdf', storedName: 'viejo', mimeType: 'application/pdf', size: 1, createdAt: new Date(now.getTime() - 25 * HOUR) },
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(ctx.files, 'remove').mockRejectedValueOnce(new Error('Storage caído'));
    await expect(runDailyJobs(ctx.deps)).rejects.toThrow(/archivos pendientes/);
    expect(await ctx.prisma.evmSnapshot.count()).toBe(1);
    expect((await ctx.prisma.fileDeletion.findMany()).map((f) => f.storedName)).toEqual(['viejo']);
    await runDailyJobs(ctx.deps);
    expect(await ctx.prisma.fileDeletion.count()).toBe(0);
    error.mockRestore();
  });

  it('devuelve los contadores', async () => {
    expect(await runDailyJobs(ctx.deps)).toEqual({ sessions: 0, loginAttempts: 0, pendingUploads: 0, snapshots: 0, forecasts: 0, dueSoon: 0, overdue: 0, oldNotifications: 0 });
  });
});
