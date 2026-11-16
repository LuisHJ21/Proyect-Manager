import { diffDays } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import type { App } from '../http';
import { requireProjectAccess } from '../auth/access';
import { forecastDate } from '../domain/milestoneForecast';
import { leafWhere } from '../domain/wbs';

/** Pronóstico de hoy de cada hito del proyecto (null si está alcanzado). */
export async function loadForecasts(prisma: PrismaClient, projectId: string, today: string) {
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    select: { id: true, name: true, dueDate: true, status: true, tasks: { where: leafWhere, select: { status: true, dueDate: true } } },
    orderBy: { dueDate: 'asc' },
  });
  return milestones.map(({ tasks, ...m }) => ({ ...m, forecastDate: forecastDate(m, tasks, today) }));
}

/** Guarda (o actualiza) el pronóstico del día de los hitos pendientes. Devuelve cuántos guardó. */
export async function saveForecasts(prisma: PrismaClient, projectId: string, today: string): Promise<number> {
  const forecasts = (await loadForecasts(prisma, projectId, today)).filter((m) => m.forecastDate !== null);
  for (const m of forecasts) {
    await prisma.milestoneForecast.upsert({
      where: { milestoneId_date: { milestoneId: m.id, date: today } },
      create: { milestoneId: m.id, date: today, forecastDate: m.forecastDate! },
      update: { forecastDate: m.forecastDate! },
    });
  }
  return forecasts.length;
}

/** Tendencia de hitos (F16): prevista, pronóstico de hoy, desvío e historial diario. Se lee como los hitos. */
export function milestoneTrendRoutes(app: App) {
  app.get('/api/projects/:id/milestone-trend', async (c) => {
    const { prisma, today } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'planning', 'read');
    const [milestones, history] = await Promise.all([
      loadForecasts(prisma, project.id, today()),
      prisma.milestoneForecast.findMany({ where: { milestone: { projectId: project.id } }, orderBy: { date: 'asc' }, select: { milestoneId: true, date: true, forecastDate: true } }),
    ]);
    return c.json(
      milestones.map((m) => ({
        ...m,
        slipDays: m.forecastDate === null ? null : diffDays(m.dueDate, m.forecastDate),
        history: history.filter((h) => h.milestoneId === m.id).map(({ date, forecastDate: f }) => ({ date, forecastDate: f })),
      })),
    );
  });
}
