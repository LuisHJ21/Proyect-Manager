import { toPlainText } from '@pm/shared';
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
  const plain = toPlainText(text);
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

const nameOf = (user: { name: string } | null | undefined) => user?.name ?? null;

export async function loadProject(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const project = await prisma.project.findUnique({ where: { id }, include: { charter: true } });
  if (!project) return null;
  const { charter, ...rest } = project;
  const values = scalars(rest, ['lastChangeNumber', 'lastIncidentNumber', 'lastDecisionNumber', 'lastDeliverableNumber', 'lastStatusReportNumber']);
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

export async function loadStatusReport(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.statusReport.findUnique({ where: { id }, select: { number: true, periodStart: true, periodEnd: true } });
  return item ? { label: `Informe ${item.number}`, values: { periodStart: item.periodStart, periodEnd: item.periodEnd } } : null;
}

export async function loadCommunication(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.communicationItem.findUnique({ where: { id } });
  return item ? { label: item.topic, values: scalars(item) } : null;
}

export async function loadMeeting(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.meeting.findUnique({ where: { id }, select: { title: true, date: true } });
  return item ? { label: item.title, values: { date: item.date } } : null;
}

export async function loadLesson(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.lesson.findUnique({ where: { id } });
  return item ? { label: plainLabel(item.situation), values: scalars(item, ['authorId']) } : null;
}

/** Claves compuestas: los ids (cuid) nunca llevan «|». */
export const joinKey = (...parts: string[]) => parts.join('|');
const splitKey = (key: string) => key.split('|');

export async function loadDeliverable(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.deliverable.findUnique({
    where: { id },
    include: { milestone: { select: { name: true } }, criteria: { select: { id: true }, orderBy: { position: 'asc' } } },
  });
  if (!item) return null;
  return {
    label: item.name,
    values: { ...scalars(item), milestoneId: item.milestone?.name ?? null, criteriaOrder: item.criteria.map((c) => c.id).join(',') },
  };
}

export async function loadCriterion(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.deliverableCriterion.findUnique({ where: { id }, include: { deliverable: { select: { name: true } } } });
  return item ? { label: `${item.deliverable.name} · ${item.text}`, values: scalars(item, ['deliverableId', 'position']) } : null;
}

export async function loadMember(prisma: PrismaClient, key: string): Promise<Snapshot | null> {
  const [projectId, userId] = splitKey(key);
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: projectId!, userId: userId! } },
    include: { user: { select: { name: true } } },
  });
  return member ? { label: member.user.name, values: scalars(member, ['userId']) } : null;
}

export async function loadRaciActivity(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.raciActivity.findUnique({ where: { id } });
  return item ? { label: item.title, values: scalars(item) } : null;
}

/** Una celda de la RACI: existe mientras existan la actividad y la persona; `role` es null si no hay celda. */
export async function loadRaciCell(prisma: PrismaClient, key: string): Promise<Snapshot | null> {
  const [activityId, kind, partyId] = splitKey(key);
  const activity = await prisma.raciActivity.findUnique({ where: { id: activityId! }, select: { title: true } });
  if (!activity || !partyId) return null;
  const party =
    kind === 'member'
      ? await prisma.user.findUnique({ where: { id: partyId }, select: { name: true } })
      : await prisma.stakeholder.findUnique({ where: { id: partyId }, select: { name: true } });
  const cell = await prisma.raciCell.findFirst({
    where: { activityId: activityId!, ...(kind === 'member' ? { userId: partyId } : { stakeholderId: partyId }) },
    select: { role: true },
  });
  return { label: `${activity.title} · ${party?.name ?? ''}`, values: { role: cell?.role ?? null } };
}

export async function loadDependency(prisma: PrismaClient, key: string): Promise<Snapshot | null> {
  const [successorId, predecessorId] = splitKey(key);
  const dependency = await prisma.taskDependency.findUnique({
    where: { predecessorId_successorId: { predecessorId: predecessorId!, successorId: successorId! } },
    include: { successor: { select: { title: true } }, predecessor: { select: { title: true } } },
  });
  return dependency ? { label: `${dependency.successor.title} ← ${dependency.predecessor.title}`, values: {} } : null;
}

export async function loadAttachment(prisma: PrismaClient, id: string): Promise<Snapshot | null> {
  const item = await prisma.attachment.findUnique({ where: { id } });
  return item ? { label: item.originalName, values: { uploadedAt: toActivityValue(item.uploadedAt) } } : null;
}
