import { ACTIVE_PROJECT_STATUS, calendarRangeSchema } from '@pm/shared';
import { readBody, readQuery, type App, type Ctx } from '../http';
import { requireUser } from '../auth/guards';

export function calendarRoutes(app: App) {

  app.get('/api/calendar', async (c) => {
    const { prisma } = c.var.deps;
    const user = requireUser(c);
    const { from, to } = calendarRangeSchema.parse(readQuery(c));
    const isPm = user.role === 'PM';

    const activeProject = { status: { in: [...ACTIVE_PROJECT_STATUS] } };
    const taskScope = { project: activeProject, ...(isPm ? {} : { assignees: { some: { userId: user.id } } }) };
    const projectName = { project: { select: { name: true } } };

    const [tasks, milestones, undated] = await Promise.all([
      prisma.task.findMany({
        where: { ...taskScope, dueDate: { gte: from, lte: to } },
        include: { ...projectName, assignees: { include: { user: { select: { id: true, name: true } } } } },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.milestone.findMany({
        where: {
          dueDate: { gte: from, lte: to },
          project: isPm ? activeProject : { ...activeProject, members: { some: { userId: user.id } } },
        },
        include: projectName,
        orderBy: { dueDate: 'asc' },
      }),
      prisma.task.findMany({
        where: { ...taskScope, dueDate: null, status: { not: 'DONE' } },
        include: projectName,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return c.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        status: t.status,
        projectId: t.projectId,
        projectName: t.project.name,
        assignees: t.assignees.map((a) => a.user),
      })),
      milestones: milestones.map((m) => ({
        id: m.id,
        name: m.name,
        dueDate: m.dueDate,
        status: m.status,
        projectId: m.projectId,
        projectName: m.project.name,
      })),
      undated: undated.map((t) => ({ id: t.id, title: t.title, status: t.status, projectId: t.projectId, projectName: t.project.name })),
    });
  });
}
