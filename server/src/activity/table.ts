import type { ActivityEntry } from './types';
import type { Snapshot } from '../domain/activityDiff';
import type { PrismaClient } from '@prisma/client';
import {
  loadChange,
  loadComment,
  loadDecision,
  loadExpense,
  loadIncident,
  loadIncidentFromRisk,
  loadLesson,
  loadMilestone,
  loadObjective,
  loadProject,
  loadRisk,
  loadStakeholder,
  loadStep,
  loadTask,
  param,
  responseId,
} from './loaders';

type Loader = (prisma: PrismaClient, key: string) => Promise<Snapshot | null>;

/** Las tres rutas de un registro con crear, editar y borrar bajo `/api/projects/:id/<path>`. */
function crudEntries(path: string, idParam: string, entry: Omit<ActivityEntry, 'target' | 'load'> & { load: Loader }): Record<string, ActivityEntry> {
  const base = `/api/projects/:id/${path}`;
  return {
    [`POST ${base}`]: { ...entry, target: responseId },
    [`PATCH ${base}/:${idParam}`]: { ...entry, target: param(idParam) },
    [`DELETE ${base}/:${idParam}`]: { ...entry, target: param(idParam) },
  };
}

const PROJECT_FIELDS = ['status', 'startDate', 'endDate', 'plannedBudgetCents'] as const;
const TASK_FIELDS = ['status', 'startDate', 'dueDate', 'progress', 'plannedCostCents', 'milestoneId', 'assignees'] as const;
const STEP_FIELDS = ['done', 'assigneeId'] as const;

const project = (extra: Partial<ActivityEntry> = {}): ActivityEntry => ({ entity: 'project', target: param('id'), load: loadProject, fields: PROJECT_FIELDS, ...extra });
const task = (extra: Partial<ActivityEntry> = {}): ActivityEntry => ({ entity: 'task', target: param('id'), load: loadTask, fields: TASK_FIELDS, ...extra });
const step = (extra: Partial<ActivityEntry> = {}): ActivityEntry => ({ entity: 'step', target: param('stepId'), load: loadStep, fields: STEP_FIELDS, ...extra });

/** Clave: "MÉTODO patrón", como la devuelve `listRoutes`. */
export const ACTIVITY_TABLE: Record<string, ActivityEntry> = {
  'POST /api/projects': project({ target: responseId }),
  'PATCH /api/projects/:id': project(),

  'POST /api/projects/:id/tasks': task({ target: responseId }),
  'PATCH /api/tasks/:id': task(),
  'DELETE /api/tasks/:id': task(),
  'PUT /api/tasks/:id/assignees': task(),
  'PATCH /api/tasks/:id/progress': task(),

  'POST /api/tasks/:id/steps': step({ target: responseId }),
  'PATCH /api/tasks/:id/steps/:stepId': step(),
  'DELETE /api/tasks/:id/steps/:stepId': step(),

  ...crudEntries('objectives', 'itemId', { entity: 'objective', load: loadObjective, fields: ['status'] }),
  ...crudEntries('milestones', 'itemId', { entity: 'milestone', load: loadMilestone, fields: ['status', 'dueDate'] }),
  ...crudEntries('stakeholders', 'itemId', { entity: 'stakeholder', load: loadStakeholder, fields: [] }),
  ...crudEntries('risks', 'itemId', { entity: 'risk', load: loadRisk, fields: ['status', 'ownerId', 'probability', 'impact'] }),
  ...crudEntries('expenses', 'itemId', { entity: 'expense', load: loadExpense, fields: ['amountCents', 'date', 'category'] }),
  ...crudEntries('change-requests', 'crId', { entity: 'change', load: loadChange, fields: ['status', 'scheduleImpactDays', 'costImpactCents'] }),
  'POST /api/projects/:id/change-requests/:crId/decision': {
    entity: 'change',
    action: 'decided',
    target: param('crId'),
    load: loadChange,
    fields: ['status', 'scheduleImpactDays', 'costImpactCents'],
  },
  ...crudEntries('incidents', 'incidentId', { entity: 'incident', load: loadIncident, fields: ['status', 'ownerId', 'priority', 'dueDate'] }),
  'POST /api/projects/:id/risks/:riskId/incident': {
    entity: 'incident',
    target: responseId,
    load: loadIncidentFromRisk,
    fields: ['status', 'ownerId', 'priority', 'dueDate'],
  },
  ...crudEntries('decisions', 'decisionId', { entity: 'decision', load: loadDecision, fields: ['decidedOn'] }),
  ...crudEntries('lessons', 'lessonId', { entity: 'lesson', load: loadLesson, fields: ['type', 'category'] }),

  'POST /api/tasks/:id/comments': { entity: 'comment', action: 'commented', target: responseId, load: loadComment, fields: [] },
};

/** Escrituras que la bitácora no registra, con su motivo. */
export const NOT_LOGGED: Record<string, string> = {
  'POST /api/setup': 'No es de un proyecto',
  'POST /api/auth/login': 'No es de un proyecto',
  'POST /api/auth/logout': 'No es de un proyecto',
  'POST /api/auth/change-password': 'No es de un proyecto',
  'POST /api/users': 'No es de un proyecto',
  'PATCH /api/users/:id': 'No es de un proyecto',
  'POST /api/users/:id/reset-password': 'No es de un proyecto',
  'POST /api/projects/:id/attachments': 'Solo reserva la subida; el anexo se registra al completarse',
  'POST /api/tasks/:id/attachments': 'Solo reserva la subida; el anexo se registra al completarse',
  'PUT /api/local-uploads/:storedName': 'Subida de bytes; el anexo se registra al completarse',
  'DELETE /api/projects/:id': 'La bitácora se borra con el proyecto',
};
