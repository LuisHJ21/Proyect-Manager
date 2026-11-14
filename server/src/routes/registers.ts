import {
  createExpenseSchema,
  createMilestoneSchema,
  createObjectiveSchema,
  createRiskSchema,
  createStakeholderSchema,
  INVALID_RESPONSE_MESSAGE,
  isResponseValidForType,
  updateExpenseSchema,
  updateMilestoneSchema,
  updateObjectiveSchema,
  updateRiskSchema,
  updateStakeholderSchema,
} from '@pm/shared';
import type { App } from '../http';
import { fieldError } from '../errors';
import { registerProjectCrud } from './projectCrud';

export function registerRoutes(app: App) {
  registerProjectCrud(app, {
    path: 'objectives',
    delegate: (prisma) => prisma.objective,
    createSchema: createObjectiveSchema,
    updateSchema: updateObjectiveSchema,
    readAccess: 'member',
    richTextFields: ['description'],
  });
  registerProjectCrud(app, {
    path: 'milestones',
    delegate: (prisma) => prisma.milestone,
    createSchema: createMilestoneSchema,
    updateSchema: updateMilestoneSchema,
    readAccess: 'member',
  });
  registerProjectCrud(app, {
    path: 'stakeholders',
    delegate: (prisma) => prisma.stakeholder,
    createSchema: createStakeholderSchema,
    updateSchema: updateStakeholderSchema,
    readAccess: 'pm',
  });
  registerProjectCrud(app, {
    path: 'risks',
    delegate: (prisma) => prisma.risk,
    createSchema: createRiskSchema,
    updateSchema: updateRiskSchema,
    readAccess: 'pm',
    richTextFields: ['description', 'responsePlan'],
    include: { incidents: { select: { id: true, number: true, title: true, status: true }, orderBy: { number: 'asc' } } },
    toDto: (risk) => ({ ...risk, score: risk.probability * risk.impact }),
    validate: async (risk, project, prisma) => {
      if (!isResponseValidForType(risk.type, risk.response)) throw fieldError('response', INVALID_RESPONSE_MESSAGE);
      if (risk.ownerId) {
        const member = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: project.id, userId: risk.ownerId } },
        });
        if (!member) throw fieldError('ownerId', 'El responsable debe ser miembro del proyecto');
      }
    },
  });
  registerProjectCrud(app, {
    path: 'expenses',
    delegate: (prisma) => prisma.expense,
    createSchema: createExpenseSchema,
    updateSchema: updateExpenseSchema,
    readAccess: 'pm',
    toDto: (expense) => ({ ...expense, amountCents: Number(expense.amountCents) }),
    validate: async (expense, project, prisma) => {
      if (!expense.taskId) return;
      const task = await prisma.task.findFirst({ where: { id: expense.taskId, projectId: project.id }, select: { id: true } });
      if (!task) throw fieldError('taskId', 'La tarea no pertenece al proyecto');
    },
  });
}
