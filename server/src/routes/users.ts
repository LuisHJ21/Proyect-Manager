import { ACTIVE_PROJECT_STATUS, createUserSchema, resetPasswordSchema, updateUserSchema } from '@pm/shared';
import type { User } from '@prisma/client';
import { requirePm } from '../auth/guards';
import { hashPassword } from '../auth/passwords';
import { deleteUserSessions } from '../auth/sessions';
import { toUserDto } from '../auth/userDto';
import { isOverdue } from '../domain/health';
import { AppError, notFound } from '../errors';
import { readBody, type App, type Ctx } from '../http';

export function userRoutes(app: App) {
  const findUser = async (c: Ctx, id: string): Promise<User> => {
    const user = await c.var.deps.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('Usuario no encontrado');
    return user;
  };

  app.get('/api/users', async (c) => {
    const { prisma } = c.var.deps;
    requirePm(c);
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      include: {
        memberships: { include: { project: { select: { id: true, name: true } } }, orderBy: { project: { name: 'asc' } } },
        assignments: {
          where: { task: { status: { not: 'DONE' }, project: { status: { in: [...ACTIVE_PROJECT_STATUS] } } } },
          include: { task: { select: { status: true, dueDate: true } } },
        },
      },
    });
    const today = c.var.deps.today();
    return c.json(users.map((user) => ({
      ...toUserDto(user),
      projects: user.memberships.map((m) => ({ id: m.project.id, name: m.project.name, projectRole: m.projectRole })),
      openTasks: user.assignments.length,
      overdueTasks: user.assignments.filter((a) => isOverdue(a.task, today)).length,
    })));
  });

  app.get('/api/users/:id/tasks', async (c) => {
    const { prisma } = c.var.deps;
    requirePm(c);
    const user = await findUser(c, c.req.param('id'));
    const tasks = await prisma.task.findMany({
      where: { status: { not: 'DONE' }, assignees: { some: { userId: user.id } }, project: { status: { in: [...ACTIVE_PROJECT_STATUS] } } },
      include: { project: { select: { name: true } } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    return c.json(tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      projectId: t.projectId,
      projectName: t.project.name,
    })));
  });

  app.post('/api/users', async (c) => {
    const { prisma } = c.var.deps;
    requirePm(c);
    const input = createUserSchema.parse(await readBody(c));
    if (await prisma.user.findUnique({ where: { email: input.email } })) {
      const message = 'Ya existe una cuenta con este correo';
      throw new AppError(409, 'email_taken', message, { fields: { email: message } });
    }
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash: await hashPassword(input.temporaryPassword),
        mustChangePassword: true,
      },
    });
    return c.json(toUserDto(user), 201);
  });

  app.patch('/api/users/:id', async (c) => {
    const { prisma } = c.var.deps;
    requirePm(c);
    const target = await findUser(c, c.req.param('id'));
    const input = updateUserSchema.parse(await readBody(c));

    const losesPmAccess = target.role === 'PM' && target.active && (input.active === false || input.role === 'COLLABORATOR');
    if (losesPmAccess && (await prisma.user.count({ where: { role: 'PM', active: true } })) <= 1) {
      throw new AppError(409, 'last_pm', 'Debe quedar al menos un Project Manager activo');
    }

    const becomesPm = input.role === 'PM' && target.role !== 'PM';
    const updated = await prisma.$transaction(async (tx) => {
      if (becomesPm) {
        // Los proyectos cerrados conservan su historia: solo se tocan las asignaciones de proyectos activos.
        const active = { project: { status: { in: [...ACTIVE_PROJECT_STATUS] } } };
        await tx.taskAssignee.deleteMany({ where: { userId: target.id, task: active } });
        await tx.taskStep.updateMany({ where: { assigneeId: target.id, task: active }, data: { assigneeId: null } });
      }
      return tx.user.update({ where: { id: target.id }, data: input });
    });
    if (input.active === false) await deleteUserSessions(prisma, target.id);
    return c.json(toUserDto(updated));
  });

  app.post('/api/users/:id/reset-password', async (c) => {
    const { prisma } = c.var.deps;
    requirePm(c);
    const target = await findUser(c, c.req.param('id'));
    const input = resetPasswordSchema.parse(await readBody(c));
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(input.temporaryPassword), mustChangePassword: true },
    });
    await deleteUserSessions(prisma, target.id);
    return c.json(toUserDto(updated));
  });
}
