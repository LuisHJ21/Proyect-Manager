import { addMemberSchema, updateMemberSchema } from '@pm/shared';
import type { FastifyInstance } from 'fastify';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { AppError, fieldError, notFound } from '../errors';

type MemberParams = { id: string; userId: string };

export async function memberRoutes(app: FastifyInstance) {
  const { prisma } = app;

  const toDto = (m: { userId: string; projectRole: string; user: { name: string; email: string; role: string } }) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.user.role,
    projectRole: m.projectRole,
  });

  const findMember = async (projectId: string, userId: string) => {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (!member) throw notFound('Miembro no encontrado');
    return member;
  };

  app.get<{ Params: { id: string } }>('/api/projects/:id/members', async (req) => {
    const { project } = await getProjectAccess(req, req.params.id);
    const members = await prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    });
    return members.map(toDto);
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/members', async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    const input = addMemberSchema.parse(req.body);
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
    return reply.status(201).send(toDto(member));
  });

  app.patch<{ Params: MemberParams }>('/api/projects/:id/members/:userId', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const member = await findMember(project.id, req.params.userId);
    const input = updateMemberSchema.parse(req.body);
    const updated = await prisma.projectMember.update({ where: { id: member.id }, data: input, include: { user: true } });
    return toDto(updated);
  });

  app.get<{ Params: MemberParams }>('/api/projects/:id/members/:userId/impact', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const member = await findMember(project.id, req.params.userId);
    const [tasks, risks] = await Promise.all([
      prisma.taskAssignee.count({ where: { userId: member.userId, task: { projectId: project.id } } }),
      prisma.risk.count({ where: { ownerId: member.userId, projectId: project.id } }),
    ]);
    return { tasks, risks };
  });

  app.delete<{ Params: MemberParams }>('/api/projects/:id/members/:userId', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const member = await findMember(project.id, req.params.userId);
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { userId: member.userId, task: { projectId: project.id } } }),
      prisma.risk.updateMany({ where: { ownerId: member.userId, projectId: project.id }, data: { ownerId: null } }),
      prisma.projectMember.delete({ where: { id: member.id } }),
    ]);
    return { ok: true };
  });
}
