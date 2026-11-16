import { createQualityMetricSchema, measurementSchema, updateQualityMetricSchema } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { getProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { metricStatus } from '../domain/quality';
import { fieldError, forbidden, notFound } from '../errors';

const metricInclude = {
  deliverable: { select: { id: true, number: true, name: true } },
  measurements: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
} satisfies Prisma.QualityMetricInclude;
type MetricRow = Prisma.QualityMetricGetPayload<{ include: typeof metricInclude }>;

function toMetricDto(m: MetricRow) {
  const target = Number(m.target);
  const measurements = m.measurements.map((x) => ({ id: x.id, date: x.date, value: Number(x.value), note: x.note, createdAt: x.createdAt }));
  return {
    id: m.id,
    name: m.name,
    unit: m.unit,
    target,
    direction: m.direction,
    deliverable: m.deliverable,
    ...metricStatus({ target, direction: m.direction }, measurements),
    measurements: measurements.map(({ createdAt: _c, ...rest }) => rest),
  };
}

async function assertDeliverable(prisma: PrismaClient, projectId: string, deliverableId: string | null | undefined) {
  if (deliverableId && !(await prisma.deliverable.findFirst({ where: { id: deliverableId, projectId }, select: { id: true } }))) {
    throw fieldError('deliverableId', 'El entregable no pertenece a este proyecto');
  }
}

/** Métricas de calidad con meta y mediciones (F13). Todos los miembros leen; mide y edita el PM. */
export function qualityMetricRoutes(app: App) {
  const base = '/api/projects/:id/quality-metrics';

  const access = async (c: Ctx, need: 'read' | 'write') => {
    const result = await getProjectAccess(c, c.req.param('id')!);
    if (need === 'write' ? !result.can.write('quality') : !result.can.read('quality')) throw forbidden();
    return result;
  };
  const findMetric = async (c: Ctx, projectId: string) => {
    const metric = await c.var.deps.prisma.qualityMetric.findFirst({ where: { id: c.req.param('metricId'), projectId } });
    if (!metric) throw notFound('Métrica no encontrada');
    return metric;
  };
  const load = async (prisma: PrismaClient, id: string) => toMetricDto(await prisma.qualityMetric.findUniqueOrThrow({ where: { id }, include: metricInclude }));

  app.get(base, async (c) => {
    const { project } = await access(c, 'read');
    const metrics = await c.var.deps.prisma.qualityMetric.findMany({ where: { projectId: project.id }, include: metricInclude, orderBy: { createdAt: 'asc' } });
    return c.json(metrics.map(toMetricDto));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const input = createQualityMetricSchema.parse(await readBody(c));
    await assertDeliverable(prisma, project.id, input.deliverableId);
    const created = await prisma.qualityMetric.create({ data: { ...input, projectId: project.id }, include: metricInclude });
    return c.json(toMetricDto(created), 201);
  });

  app.patch(`${base}/:metricId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const metric = await findMetric(c, project.id);
    const input = updateQualityMetricSchema.parse(await readBody(c));
    await assertDeliverable(prisma, project.id, input.deliverableId);
    await prisma.qualityMetric.update({ where: { id: metric.id }, data: input });
    return c.json(await load(prisma, metric.id));
  });

  app.delete(`${base}/:metricId`, async (c) => {
    const { project } = await access(c, 'write');
    const metric = await findMetric(c, project.id);
    await c.var.deps.prisma.qualityMetric.delete({ where: { id: metric.id } });
    return c.json({ ok: true });
  });

  app.post(`${base}/:metricId/measurements`, async (c) => {
    const { prisma, today } = c.var.deps;
    const { project } = await access(c, 'write');
    const metric = await findMetric(c, project.id);
    const input = measurementSchema.parse(await readBody(c));
    if (input.date > today()) throw fieldError('date', 'No se registran mediciones futuras');
    await prisma.qualityMeasurement.create({ data: { ...input, metricId: metric.id, createdById: requireUser(c).id, createdAt: c.var.deps.now() } });
    return c.json(await load(prisma, metric.id), 201);
  });

  app.delete(`${base}/:metricId/measurements/:measurementId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const metric = await findMetric(c, project.id);
    const { count } = await prisma.qualityMeasurement.deleteMany({ where: { id: c.req.param('measurementId'), metricId: metric.id } });
    if (count === 0) throw notFound('Medición no encontrada');
    return c.json(await load(prisma, metric.id));
  });
}
