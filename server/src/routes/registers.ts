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
import { assertOwnerCanOwn } from '../domain/owners';
import { registerProjectCrud } from './projectCrud';

export function registerRoutes(app: App) {
  registerProjectCrud(app, {
    path: 'objectives',
    delegate: (prisma) => prisma.objective,
    createSchema: createObjectiveSchema,
    updateSchema: updateObjectiveSchema,
    section: 'planning',
    richTextFields: ['description'],
  });
  registerProjectCrud(app, {
    path: 'milestones',
    delegate: (prisma) => prisma.milestone,
    createSchema: createMilestoneSchema,
    updateSchema: updateMilestoneSchema,
    section: 'planning',
  });
  registerProjectCrud(app, {
    path: 'stakeholders',
    delegate: (prisma) => prisma.stakeholder,
    createSchema: createStakeholderSchema,
    updateSchema: updateStakeholderSchema,
    section: 'stakeholders',
  });
  registerProjectCrud(app, {
    path: 'risks',
    delegate: (prisma) => prisma.risk,
    createSchema: createRiskSchema,
    updateSchema: updateRiskSchema,
    section: 'risks',
    richTextFields: ['description', 'responsePlan'],
    include: { incidents: { select: { id: true, number: true, title: true, status: true }, orderBy: { number: 'asc' } } },
    toDto: (risk) => ({ ...risk, score: risk.probability * risk.impact }),
    validate: async (risk, project, prisma) => {
      if (!isResponseValidForType(risk.type, risk.response)) throw fieldError('response', INVALID_RESPONSE_MESSAGE);
      await assertOwnerCanOwn(prisma, project.id, risk.ownerId);
    },
  });
  registerProjectCrud(app, {
    path: 'expenses',
    delegate: (prisma) => prisma.expense,
    createSchema: createExpenseSchema,
    updateSchema: updateExpenseSchema,
    section: 'budget',
    toDto: (expense) => ({ ...expense, amountCents: Number(expense.amountCents) }),
    validate: async (expense, project, prisma) => {
      if (!expense.taskId) return;
      const task = await prisma.task.findFirst({ where: { id: expense.taskId, projectId: project.id }, select: { id: true } });
      if (!task) throw fieldError('taskId', 'La tarea no pertenece al proyecto');
    },
  });
}
