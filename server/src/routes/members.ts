import { addMemberSchema, updateMemberSchema } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { readBody, type App } from '../http';
import { getProjectAccess, requireProjectAccess } from '../auth/access';
import { AppError, fieldError, notFound } from '../errors';

type MemberParams = { id: string; userId: string };

export function memberRoutes(app: App) {
  const toDto = (m: { userId: string; projectRole: string; user: { name: string; email: string; role: string; active: boolean } }) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.user.role,
    active: m.user.active,
    projectRole: m.projectRole,
  });

  const findMember = async (prisma: PrismaClient, projectId: string, userId: string) => {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (!member) throw notFound('Miembro no encontrado');
    return member;
  };

  app.get('/api/projects/:id/members', async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await getProjectAccess(c, c.req.param('id'));
    const members = await prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    });
    return c.json(members.map(toDto));
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
      prisma.taskStep.updateMany({ where: { assigneeId: member.userId, task: { projectId: project.id } }, data: { assigneeId: null } }),
      prisma.risk.updateMany({ where: { ownerId: member.userId, projectId: project.id }, data: { ownerId: null, version: { increment: 1 } } }),
      prisma.raciCell.deleteMany({ where: { userId: member.userId, activity: { projectId: project.id } } }),
      prisma.incident.updateMany({ where: { ownerId: member.userId, projectId: project.id }, data: { ownerId: null } }),
      prisma.projectMember.delete({ where: { id: member.id } }),
    ]);
    return c.json({ ok: true });
  });
}
