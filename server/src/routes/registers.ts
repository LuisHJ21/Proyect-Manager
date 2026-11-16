import {
  createCommunicationItemSchema,
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
  updateCommunicationItemSchema,
  updateStakeholderSchema,
} from '@pm/shared';
import type { App } from '../http';
import { fieldError } from '../errors';
import { assertOwnerCanOwn } from '../domain/owners';
import { isReadyToReach } from '../domain/milestones';
import { isWithinProject, outsideProjectMessage } from '../domain/projectDates';
import { registerProjectCrud } from './projectCrud';
import { assertNotSummary } from './taskTree';

type LinkedTask = { status: string; children?: LinkedTask[] };
/** Tarea ligada a un hito con sus descendientes; la EDT tiene como mucho 4 niveles. */
const milestoneTaskSelect = {
  status: true,
  children: { select: { status: true, children: { select: { status: true, children: { select: { status: true } } } } } },
} as const;
const leavesOf = (task: LinkedTask): { status: string }[] =>
  task.children && task.children.length > 0 ? task.children.flatMap(leavesOf) : [{ status: task.status }];

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
    include: { tasks: { select: milestoneTaskSelect }, deliverables: { select: { status: true } } },
    // Una tarea ligada con subtareas cuenta por sus hojas: su estado guardado no se actualiza.
    toDto: ({ tasks, deliverables, ...milestone }) => ({
      ...milestone,
      readyToReach: isReadyToReach({ status: milestone.status, tasks: tasks.flatMap(leavesOf), deliverables }),
    }),
    // Como en las tareas: solo se comprueba la fecha nueva, así un hito que ya estaba fuera se puede renombrar.
    validate: async (milestone, project, _prisma, current) => {
      if (current && milestone.dueDate === current.dueDate) return;
      if (!isWithinProject(milestone.dueDate, project)) throw fieldError('dueDate', outsideProjectMessage(project));
    },
  });
  registerProjectCrud(app, {
    path: 'stakeholders',
    delegate: (prisma) => prisma.stakeholder,
    createSchema: createStakeholderSchema,
    updateSchema: updateStakeholderSchema,
    section: 'stakeholders',
  });
  // Plan de comunicaciones: qué, a quién, cada cuánto, por qué canal y quién. Solo del PM, como los interesados.
  registerProjectCrud(app, {
    path: 'communications',
    delegate: (prisma) => prisma.communicationItem,
    createSchema: createCommunicationItemSchema,
    updateSchema: updateCommunicationItemSchema,
    section: 'stakeholders',
    include: { owner: { select: { id: true, name: true } } },
    validate: async (item, project, prisma) => assertOwnerCanOwn(prisma, project.id, item.ownerId),
  });
  registerProjectCrud(app, {
    path: 'risks',
    delegate: (prisma) => prisma.risk,
    createSchema: createRiskSchema,
    updateSchema: updateRiskSchema,
    section: 'risks',
    richTextFields: ['description', 'responsePlan'],
    include: {
      incidents: { select: { id: true, number: true, title: true, status: true }, orderBy: { number: 'asc' } },
      assessments: { include: { assessedBy: { select: { id: true, name: true } } }, orderBy: { assessedAt: 'desc' } },
    },
    // El colaborador ve solo los riesgos de los que es responsable y solo cambia su estado.
    versioned: true,
    own: { field: 'ownerId', editable: ['status', 'version'], message: 'Solo puedes cambiar el estado de los riesgos de los que eres responsable' },
    // El vínculo con incidentes es del PM, como en el registro de incidentes.
    // El costo de contingencia es dinero: solo para el PM.
    toDto: ({ incidents, assessments, contingencyCostCents, ...risk }, isPm, today) => ({
      ...risk,
      score: risk.probability * risk.impact,
      residualScore: risk.residualProbability && risk.residualImpact ? risk.residualProbability * risk.residualImpact : null,
      reviewOverdue: risk.status !== 'CLOSED' && risk.nextReviewDate !== null && risk.nextReviewDate < today,
      assessments: assessments.map(({ id: _id, riskId: _r, assessedById: _a, ...a }: Record<string, unknown>) => a),
      ...(isPm ? { incidents, contingencyCostCents: contingencyCostCents === null ? null : Number(contingencyCostCents) } : {}),
    }),
    // Historial: al crear y cuando cambia la evaluación (no al cambiar solo el estado).
    afterSave: async (prisma, risk, current, userId) => {
      const keys = ['probability', 'impact', 'residualProbability', 'residualImpact'] as const;
      if (current && keys.every((k) => risk[k] === current[k])) return;
      await prisma.riskAssessment.create({
        data: { riskId: risk.id, probability: risk.probability, impact: risk.impact, residualProbability: risk.residualProbability, residualImpact: risk.residualImpact, assessedById: userId },
      });
    },
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
      await assertNotSummary(prisma, task.id);
    },
  });
}
