import { convertAgreementSchema, meetingSchema, updateMeetingSchema, type AgreementTarget } from '@pm/shared';
import type { Prisma, PrismaClient, Project } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { getProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { assertOwnerCanOwn } from '../domain/owners';
import { AppError, fieldError, forbidden, notFound } from '../errors';
import { notify } from '../notifications';
import { sanitizeRichText } from '../richText';
import { createDecision } from './decisions';
import { createIncidentIn } from './incidents';
import { assertAssignable, assertDatesWithinProject, notifyNewAssignees } from './tasks';
import { nextPosition } from './taskTree';

const person = { select: { id: true, name: true } } as const;
const meetingInclude = {
  attendees: { include: { user: person, stakeholder: person } },
  agreements: { include: { owner: person }, orderBy: { position: 'asc' } },
} satisfies Prisma.MeetingInclude;
type MeetingRow = Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>;
type AgreementRow = MeetingRow['agreements'][number];

const CONVERTED = 'Este acuerdo ya se convirtió';
const converted = () => new AppError(409, 'agreement_converted', CONVERTED);
const convertedTo = (a: { taskId: string | null; decisionId: string | null; incidentId: string | null }): AgreementTarget | null =>
  a.taskId ? 'task' : a.decisionId ? 'decision' : a.incidentId ? 'incident' : null;
const isConverted = (a: { taskId: string | null; decisionId: string | null; incidentId: string | null }) => convertedTo(a) !== null;

/** Para el colaborador: sin interesados ni vínculos a decisiones o incidentes, que no puede ver. */
function toAgreementDto(a: AgreementRow, isPm: boolean) {
  const { meetingId: _m, ownerId: _o, decisionId, incidentId, ...fields } = a;
  return { ...fields, ...(isPm ? { decisionId, incidentId } : {}), convertedTo: convertedTo(a) };
}

function toMeetingDto(m: MeetingRow, isPm: boolean) {
  const { projectId: _p, createdById: _c, attendees, agreements, ...fields } = m;
  return {
    ...fields,
    attendees: {
      users: attendees.flatMap((a) => (a.user ? [a.user] : [])),
      stakeholders: isPm ? attendees.flatMap((a) => (a.stakeholder ? [a.stakeholder] : [])) : [],
    },
    agreements: agreements.map((a) => toAgreementDto(a, isPm)),
  };
}

/** Los asistentes del equipo deben ser miembros (o el PM); los interesados, del proyecto. */
async function assertAttendees(prisma: PrismaClient, projectId: string, userIds: string[], stakeholderIds: string[]) {
  const users = [...new Set(userIds)];
  if (users.length > 0) {
    const valid = await prisma.user.count({ where: { id: { in: users }, OR: [{ role: 'PM' }, { memberships: { some: { projectId } } }] } });
    if (valid !== users.length) throw fieldError('userIds', 'El asistente debe ser miembro del proyecto');
  }
  const stakeholders = [...new Set(stakeholderIds)];
  if (stakeholders.length > 0) {
    const valid = await prisma.stakeholder.count({ where: { id: { in: stakeholders }, projectId } });
    if (valid !== stakeholders.length) throw fieldError('stakeholderIds', 'El interesado no pertenece a este proyecto');
  }
}

type AgreementInput = { id?: string; text: string; ownerId?: string | null; dueDate?: string | null };

export function meetingRoutes(app: App) {
  const base = '/api/projects/:id/meetings';

  const access = async (c: Ctx, need: 'read' | 'write') => {
    const result = await getProjectAccess(c, c.req.param('id')!);
    if (need === 'write' ? !result.can.write('meetings') : !result.can.read('meetings')) throw forbidden();
    return result;
  };
  /** El colaborador solo encuentra las reuniones a las que asistió. */
  const visibleWhere = (c: Ctx, project: Project, isPm: boolean): Prisma.MeetingWhereInput => ({
    projectId: project.id,
    ...(isPm ? {} : { attendees: { some: { userId: requireUser(c).id } } }),
  });
  const findMeeting = async (c: Ctx, project: Project, isPm: boolean) => {
    const meeting = await c.var.deps.prisma.meeting.findFirst({ where: { id: c.req.param('meetingId'), ...visibleWhere(c, project, isPm) }, include: meetingInclude });
    if (!meeting) throw notFound('Reunión no encontrada');
    return meeting;
  };
  const assertOwners = async (prisma: PrismaClient, projectId: string, agreements: AgreementInput[]) => {
    for (const a of agreements) await assertOwnerCanOwn(prisma, projectId, a.ownerId);
  };
  const attendeeRows = (userIds: string[], stakeholderIds: string[]) => [
    ...[...new Set(userIds)].map((userId) => ({ userId })),
    ...[...new Set(stakeholderIds)].map((stakeholderId) => ({ stakeholderId })),
  ];

  app.get(base, async (c) => {
    const { project, isPm } = await access(c, 'read');
    const meetings = await c.var.deps.prisma.meeting.findMany({
      where: visibleWhere(c, project, isPm),
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { agreements: true } }, attendees: { select: { userId: true } } },
    });
    // El colaborador no cuenta a los interesados.
    return c.json(meetings.map((m) => ({ id: m.id, title: m.title, date: m.date, attendeeCount: m.attendees.filter((a) => isPm || a.userId).length, agreementCount: m._count.agreements })));
  });

  app.get(`${base}/:meetingId`, async (c) => {
    const { project, isPm } = await access(c, 'read');
    return c.json(toMeetingDto(await findMeeting(c, project, isPm), isPm));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const input = meetingSchema.parse(await readBody(c));
    await assertAttendees(prisma, project.id, input.userIds, input.stakeholderIds);
    await assertOwners(prisma, project.id, input.agreements);
    const meeting = await prisma.meeting.create({
      data: {
        projectId: project.id,
        title: input.title,
        date: input.date,
        notes: sanitizeRichText(input.notes),
        createdById: requireUser(c).id,
        attendees: { create: attendeeRows(input.userIds, input.stakeholderIds) },
        agreements: { create: input.agreements.map((a, position) => ({ text: a.text, ownerId: a.ownerId ?? null, dueDate: a.dueDate ?? null, position })) },
      },
      include: meetingInclude,
    });
    return c.json(toMeetingDto(meeting, true), 201);
  });

  app.patch(`${base}/:meetingId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const current = await findMeeting(c, project, true);
    const input = updateMeetingSchema.parse(await readBody(c));
    if (input.userIds || input.stakeholderIds) {
      const users = input.userIds ?? current.attendees.flatMap((a) => (a.userId ? [a.userId] : []));
      const stakeholders = input.stakeholderIds ?? current.attendees.flatMap((a) => (a.stakeholderId ? [a.stakeholderId] : []));
      await assertAttendees(prisma, project.id, users, stakeholders);
      input.userIds = users;
      input.stakeholderIds = stakeholders;
    }
    if (input.agreements) {
      await assertOwners(prisma, project.id, input.agreements);
      const byId = new Map(current.agreements.map((a) => [a.id, a]));
      for (const a of input.agreements) {
        if (!a.id) continue;
        const saved = byId.get(a.id);
        if (!saved) throw notFound('Acuerdo no encontrado');
        if (isConverted(saved) && saved.text !== a.text) throw converted();
      }
      const kept = new Set(input.agreements.flatMap((a) => (a.id ? [a.id] : [])));
      if (current.agreements.some((a) => !kept.has(a.id) && isConverted(a))) throw converted();
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (input.userIds && input.stakeholderIds) {
        await tx.meetingAttendee.deleteMany({ where: { meetingId: current.id } });
        await tx.meetingAttendee.createMany({ data: attendeeRows(input.userIds, input.stakeholderIds).map((row) => ({ ...row, meetingId: current.id })) });
      }
      if (input.agreements) {
        const kept = input.agreements.flatMap((a) => (a.id ? [a.id] : []));
        await tx.meetingAgreement.deleteMany({ where: { meetingId: current.id, id: { notIn: kept } } });
        for (const [position, a] of input.agreements.entries()) {
          const data = { text: a.text, ownerId: a.ownerId ?? null, dueDate: a.dueDate ?? null, position };
          if (a.id) await tx.meetingAgreement.update({ where: { id: a.id }, data });
          else await tx.meetingAgreement.create({ data: { ...data, meetingId: current.id } });
        }
      }
      return tx.meeting.update({
        where: { id: current.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.date !== undefined ? { date: input.date } : {}),
          ...(input.notes !== undefined ? { notes: sanitizeRichText(input.notes) } : {}),
        },
        include: meetingInclude,
      });
    });
    return c.json(toMeetingDto(updated, true));
  });

  app.delete(`${base}/:meetingId`, async (c) => {
    const { project } = await access(c, 'write');
    const meeting = await findMeeting(c, project, true);
    // Lo creado desde sus acuerdos queda: los vínculos están en el acuerdo, no en la tarea.
    await c.var.deps.prisma.meeting.delete({ where: { id: meeting.id } });
    return c.json({ ok: true });
  });

  app.post(`${base}/:meetingId/agreements/:agreementId/convert`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const user = requireUser(c);
    const meeting = await findMeeting(c, project, true);
    const agreement = meeting.agreements.find((a) => a.id === c.req.param('agreementId'));
    if (!agreement) throw notFound('Acuerdo no encontrado');
    if (isConverted(agreement)) throw converted();
    const { kind } = convertAgreementSchema.parse(await readBody(c));

    // Mismas reglas que crear la tarea o el incidente a mano.
    const assigneeIds = agreement.ownerId ? [agreement.ownerId] : [];
    if (kind === 'task') {
      assertDatesWithinProject(project, { dueDate: agreement.dueDate });
      await assertAssignable(prisma, project.id, assigneeIds, 'ownerId');
    }
    if (kind === 'incident') await assertOwnerCanOwn(prisma, project.id, agreement.ownerId);

    const result = await prisma.$transaction(async (tx) => {
      let link: { taskId: string } | { decisionId: string } | { incidentId: string };
      let created: { id: string; title: string; number?: number; ownerId?: string | null };
      if (kind === 'task') {
        const position = await nextPosition(tx, project.id, null);
        created = await tx.task.create({
          data: { projectId: project.id, title: agreement.text, dueDate: agreement.dueDate, position, assignees: { create: assigneeIds.map((userId) => ({ userId })) } },
        });
        link = { taskId: created.id };
      } else if (kind === 'decision') {
        created = await createDecision(tx, project.id, { title: agreement.text, decidedOn: meeting.date });
        link = { decisionId: created.id };
      } else {
        created = await createIncidentIn(tx, project.id, { title: agreement.text, ownerId: agreement.ownerId, dueDate: agreement.dueDate, reportedById: user.id });
        link = { incidentId: created.id };
      }
      // Reclama el acuerdo: si otra conversión ganó, revierte lo creado.
      const { count } = await tx.meetingAgreement.updateMany({ where: { id: agreement.id, taskId: null, decisionId: null, incidentId: null }, data: link });
      if (count === 0) throw converted();
      return created;
    });

    if (kind === 'task') await notifyNewAssignees(c, { id: result.id, projectId: project.id, title: result.title }, [], assigneeIds);
    if (kind === 'incident' && result.ownerId) {
      await notify(prisma, { kind: 'INCIDENT_ASSIGNED', projectId: project.id, entityId: result.id, title: `INC-${result.number} ${result.title}`, userIds: [result.ownerId], actorId: user.id });
    }
    const saved = await prisma.meetingAgreement.findUniqueOrThrow({ where: { id: agreement.id }, include: { owner: person } });
    return c.json(toAgreementDto(saved, true));
  });
}
