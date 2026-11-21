import { addMemberSchema, updateMemberSchema } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { readBody, type App } from '../http';
import { getProjectAccess, requireProjectAccess } from '../auth/access';
import { AppError, fieldError, notFound } from '../errors';
import { z } from 'zod';

type MemberParams = { id: string; userId: string };

export function memberRoutes(app: App) {
  const roleSchema = z.object({ name: z.string().trim().min(1, 'Escribe el rol').max(200, 'El rol es demasiado largo') });
  const assertProjectRole = async (prisma: PrismaClient, projectId: string, name: string | undefined) => {
    if (name && !await prisma.projectRole.findFirst({ where: { projectId, name } })) throw fieldError('projectRole', 'Selecciona un rol del proyecto');
  };

  app.get('/api/projects/:id/roles', async (c) => {
    const { project } = await getProjectAccess(c, c.req.param('id'));
    const roles = await c.var.deps.prisma.projectRole.findMany({ where: { projectId: project.id }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
    return c.json(roles);
  });

  app.post('/api/projects/:id/roles', async (c) => {
    const project = await requireProjectAccess(c, c.req.param('id'), 'members', 'write');
    const { name } = roleSchema.parse(await readBody(c));
    if (await c.var.deps.prisma.projectRole.findFirst({ where: { projectId: project.id, name } })) throw fieldError('name', 'Este rol ya existe');
    const role = await c.var.deps.prisma.projectRole.create({ data: { projectId: project.id, name } });
    return c.json(role, 201);
  });

  app.patch('/api/projects/:id/roles/:roleId', async (c) => {
    const project = await requireProjectAccess(c, c.req.param('id'), 'members', 'write');
    const { name } = roleSchema.parse(await readBody(c));
    const prisma = c.var.deps.prisma;
    const role = await prisma.projectRole.findFirst({ where: { id: c.req.param('roleId'), projectId: project.id } });
    if (!role) throw notFound('Rol no encontrado');
    if (name !== role.name && await prisma.projectRole.findFirst({ where: { projectId: project.id, name } })) throw fieldError('name', 'Este rol ya existe');
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.projectRole.update({ where: { id: role.id }, data: { name } });
      await tx.projectMember.updateMany({ where: { projectId: project.id, projectRole: role.name }, data: { projectRole: name } });
      return next;
    });
    return c.json(updated);
  });

  app.delete('/api/projects/:id/roles/:roleId', async (c) => {
    const project = await requireProjectAccess(c, c.req.param('id'), 'members', 'write');
    const prisma = c.var.deps.prisma;
    const role = await prisma.projectRole.findFirst({ where: { id: c.req.param('roleId'), projectId: project.id } });
    if (!role) throw notFound('Rol no encontrado');
    if (await prisma.projectMember.count({ where: { projectId: project.id, projectRole: role.name } })) throw new AppError(409, 'role_in_use', 'Cambia primero el rol de las personas que lo usan');
    await prisma.projectRole.delete({ where: { id: role.id } });
    return c.json({ ok: true });
  });
  /** La capacidad la ve todo el equipo; la tarifa, solo el PM. */
  const toDto = (
    m: { userId: string; projectRole: string; hourlyRateCents: bigint; weeklyCapacityHours: number; user: { name: string; email: string; role: string; active: boolean } },
    isPm = true,
  ) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.user.role,
    active: m.user.active,
    projectRole: m.projectRole,
    weeklyCapacityHours: m.weeklyCapacityHours,
    ...(isPm ? { hourlyRateCents: Number(m.hourlyRateCents) } : {}),
  });

  const findMember = async (prisma: PrismaClient, projectId: string, userId: string) => {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (!member) throw notFound('Miembro no encontrado');
    return member;
  };

  app.get('/api/projects/:id/members', async (c) => {
    const { prisma } = c.var.deps;
    const { project, isPm } = await getProjectAccess(c, c.req.param('id'));
    const members = await prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    });
    return c.json(members.map((m) => toDto(m, isPm)));
  });

  app.post('/api/projects/:id/members', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'members', 'write');
    const input = addMemberSchema.parse(await readBody(c));
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user || !user.active) throw fieldError('userId', 'Selecciona un usuario activo');
    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
    });
    if (existing) throw new AppError(409, 'already_member', 'Este usuario ya es miembro del proyecto');
    await assertProjectRole(prisma, project.id, input.projectRole);
    const member = await prisma.projectMember.create({
      data: { projectId: project.id, userId: user.id, projectRole: input.projectRole },
      include: { user: true },
    });
    return c.json(toDto(member), 201);
  });

  app.patch('/api/projects/:id/members/:userId', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'members', 'write');
    const member = await findMember(prisma, project.id, c.req.param('userId'));
    const input = updateMemberSchema.parse(await readBody(c));
    await assertProjectRole(prisma, project.id, input.projectRole);
    const updated = await prisma.projectMember.update({ where: { id: member.id }, data: input, include: { user: true } });
    return c.json(toDto(updated));
  });

  app.get('/api/projects/:id/members/:userId/impact', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'members', 'write');
    const member = await findMember(prisma, project.id, c.req.param('userId'));
    const [tasks, risks, raciCells, incidents] = await Promise.all([
      prisma.taskAssignee.count({ where: { userId: member.userId, task: { projectId: project.id } } }),
      prisma.risk.count({ where: { ownerId: member.userId, projectId: project.id } }),
      prisma.raciCell.count({ where: { userId: member.userId, activity: { projectId: project.id } } }),
      prisma.incident.count({ where: { ownerId: member.userId, projectId: project.id, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);
    return c.json({ tasks, risks, raciCells, incidents });
  });

  app.delete('/api/projects/:id/members/:userId', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'members', 'write');
    const member = await findMember(prisma, project.id, c.req.param('userId'));
    await prisma.$transaction([
      // Los responsables y el responsable del riesgo están en los formularios de edición: sube su versión (C11).
      prisma.task.updateMany({ where: { projectId: project.id, assignees: { some: { userId: member.userId } } }, data: { version: { increment: 1 } } }),
      prisma.taskAssignee.deleteMany({ where: { userId: member.userId, task: { projectId: project.id } } }),
      prisma.risk.updateMany({ where: { ownerId: member.userId, projectId: project.id }, data: { ownerId: null, version: { increment: 1 } } }),
      prisma.raciCell.deleteMany({ where: { userId: member.userId, activity: { projectId: project.id } } }),
      prisma.incident.updateMany({ where: { ownerId: member.userId, projectId: project.id }, data: { ownerId: null } }),
      // Acuerdos sin convertir y filas del plan de comunicaciones: el responsable deja de serlo.
      prisma.meetingAgreement.updateMany({ where: { ownerId: member.userId, meeting: { projectId: project.id }, taskId: null, decisionId: null, incidentId: null }, data: { ownerId: null } }),
      prisma.communicationItem.updateMany({ where: { ownerId: member.userId, projectId: project.id }, data: { ownerId: null } }),
      prisma.projectMember.delete({ where: { id: member.id } }),
    ]);
    return c.json({ ok: true });
  });
}
