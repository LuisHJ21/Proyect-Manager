import type { PrismaClient } from '@prisma/client';
import { toActivityValue, type ActivityValue, type Snapshot } from '../domain/activityDiff';
import { readBody, type Ctx } from '../http';
import { routeParam } from '../routeContext';

/** Clave desde un parámetro de la ruta. */
export const param = (name: string) => (c: Ctx) => routeParam(c, name);

/** Clave desde el `id` de la respuesta: elementos recién creados. */
export const responseId = (_c: Ctx, response?: any) => (typeof response?.id === 'string' ? response.id : null);

/** Cuerpo JSON de la petición; Hono lo guarda, así que la ruta lo puede volver a leer. */
export async function bodyOf(c: Ctx): Promise<Record<string, any>> {
  try {
    const body = await readBody(c);
    return body && typeof body === 'object' ? (body as Record<string, any>) : {};
  } catch {
    return {};
  }
}

/** Valores escalares de un registro de Prisma, sin relaciones y sin los campos de `omit`. */
export function scalars(record: Record<string, unknown>, omit: readonly string[] = []): Record<string, ActivityValue> {
  const values: Record<string, ActivityValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (omit.includes(key)) continue;
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) continue;
    values[key] = toActivityValue(value);
  }
  return values;
}

/** Texto plano corto para etiquetas que salen de campos con formato. */
export function plainLabel(text: string, max = 120): string {
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

const nameOf = (user: { name: string } | null | undefined) => user?.name ?? null;

export async function loadProject(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const project = await prisma.project.findUnique({ where: { id }, include: { charter: true } });
  if (!project) return null;
  const { charter, ...rest } = project;
  const values = scalars(rest, ['lastChangeNumber', 'lastIncidentNumber', 'lastDecisionNumber', 'lastDeliverableNumber']);
  if (charter) {
    for (const [key, value] of Object.entries(scalars(charter, ['id', 'projectId', 'createdAt', 'updatedAt']))) values[`charter.${key}`] = value;
  }
  return { label: project.name, values };
}

export async function loadTask(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const task = await prisma.task.findUnique({
    where: { id },
    include: { assignees: { include: { user: { select: { name: true } } } }, milestone: { select: { name: true } } },
  });
  if (!task) return null;
  return {
    label: task.title,
    values: { ...scalars(task), milestoneId: task.milestone?.name ?? null, assignees: toActivityValue(task.assignees.map((a) => a.user.name)) },
  };
}

export async function loadStep(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const step = await prisma.taskStep.findUnique({
    where: { id },
    include: { task: { select: { title: true } }, assignee: { select: { name: true } } },
  });
  if (!step) return null;
  return { label: `${step.task.title} · ${step.title}`, values: { ...scalars(step, ['taskId']), assigneeId: nameOf(step.assignee) } };
}

export async function loadComment(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const comment = await prisma.taskComment.findUnique({ where: { id }, include: { task: { select: { title: true } } } });
  return comment ? { label: comment.task.title, values: {} } : null;
}

const userName = (prisma: PrismaClient, id: string | null) =>
  id ? prisma.user.findUnique({ where: { id }, select: { name: true } }).then(nameOf) : Promise.resolve(null);

export async function loadObjective(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.objective.findUnique({ where: { id } });
  return item ? { label: plainLabel(item.description), values: scalars(item) } : null;
}

export async function loadMilestone(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.milestone.findUnique({ where: { id } });
  return item ? { label: item.name, values: scalars(item) } : null;
}

export async function loadStakeholder(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.stakeholder.findUnique({ where: { id } });
  return item ? { label: item.name, values: scalars(item) } : null;
}

export async function loadRisk(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.risk.findUnique({ where: { id } });
  return item ? { label: plainLabel(item.description), values: { ...scalars(item), ownerId: await userName(prisma, item.ownerId) } } : null;
}

export async function loadExpense(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.expense.findUnique({ where: { id }, include: { task: { select: { title: true } } } });
  return item ? { label: item.description, values: { ...scalars(item), taskId: item.task?.title ?? null } } : null;
}

export async function loadChange(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.changeRequest.findUnique({ where: { id } });
  return item ? { label: `CR-${item.number} ${item.title}`, values: scalars(item, ['decidedById', 'decidedAt']) } : null;
}

export async function loadIncident(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.incident.findUnique({ where: { id } });
  return item
    ? { label: `INC-${item.number} ${item.title}`, values: { ...scalars(item, ['reportedById', 'resolvedAt', 'closedAt']), ownerId: await userName(prisma, item.ownerId) } }
    : null;
}

/** El incidente creado desde un riesgo cita su origen en la etiqueta. */
export async function loadIncidentFromRisk(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const snapshot = await loadIncident(prisma, id);
  const incident = snapshot && (await prisma.incident.findUnique({ where: { id }, include: { risk: { select: { description: true } } } }));
  if (!snapshot || !incident?.risk) return snapshot;
  return { ...snapshot, label: `${snapshot.label} (desde el riesgo «${plainLabel(incident.risk.description)}»)` };
}

export async function loadDecision(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.decision.findUnique({ where: { id } });
  return item ? { label: `DEC-${item.number} ${item.title}`, values: scalars(item) } : null;
}

export async function loadLesson(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.lesson.findUnique({ where: { id } });
  return item ? { label: plainLabel(item.situation), values: scalars(item, ['authorId']) } : null;
}
