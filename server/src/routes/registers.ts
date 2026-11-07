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
import type { FastifyInstance } from 'fastify';
import { fieldError } from '../errors';
import { registerProjectCrud } from './projectCrud';

export async function registerRoutes(app: FastifyInstance) {
  const { prisma } = app;

  registerProjectCrud(app, {
    path: 'objectives',
    delegate: prisma.objective,
    createSchema: createObjectiveSchema,
    updateSchema: updateObjectiveSchema,
    readAccess: 'member',
    richTextFields: ['description'],
  });
  registerProjectCrud(app, {
    path: 'milestones',
    delegate: prisma.milestone,
    createSchema: createMilestoneSchema,
    updateSchema: updateMilestoneSchema,
    readAccess: 'member',
  });
  registerProjectCrud(app, {
    path: 'stakeholders',
    delegate: prisma.stakeholder,
    createSchema: createStakeholderSchema,
    updateSchema: updateStakeholderSchema,
    readAccess: 'pm',
  });
  registerProjectCrud(app, {
    path: 'risks',
    delegate: prisma.risk,
    createSchema: createRiskSchema,
    updateSchema: updateRiskSchema,
    readAccess: 'pm',
    richTextFields: ['description', 'responsePlan'],
    toDto: (risk) => ({ ...risk, score: risk.probability * risk.impact }),
    validate: async (risk, project) => {
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
    delegate: prisma.expense,
    createSchema: createExpenseSchema,
    updateSchema: updateExpenseSchema,
    readAccess: 'pm',
    toDto: (expense) => ({ ...expense, amountCents: Number(expense.amountCents) }),
  });
}
