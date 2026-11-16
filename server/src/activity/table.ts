import type { PrismaClient } from '@prisma/client';
import type { Snapshot } from '../domain/activityDiff';
import type { Ctx } from '../http';
import { routeParam } from '../routeContext';
import {
  bodyOf,
  joinKey,
  loadAttachment,
  loadChange,
  loadComment,
  loadCriterion,
  loadDecision,
  loadDeliverable,
  loadDependency,
  loadExpense,
  loadIncident,
  loadIncidentFromRisk,
  loadLesson,
  loadMember,
  loadMilestone,
  loadObjective,
  loadProject,
  loadRaciActivity,
  loadRaciCell,
  loadRisk,
  loadStakeholder,
  loadStep,
  loadTask,
  param,
  responseId,
} from './loaders';
import type { ActivityEntry } from './types';

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
const MEMBER_FIELDS = ['projectRole'] as const;
const DELIVERABLE_FIELDS = ['status', 'dueDate'] as const;
const INCIDENT_FIELDS = ['status', 'ownerId', 'priority', 'dueDate'] as const;
const CHANGE_FIELDS = ['status', 'scheduleImpactDays', 'costImpactCents'] as const;

const project = (extra: Partial<ActivityEntry> = {}): ActivityEntry => ({ entity: 'project', target: param('id'), load: loadProject, fields: PROJECT_FIELDS, ...extra });
const task = (extra: Partial<ActivityEntry> = {}): ActivityEntry => ({ entity: 'task', target: param('id'), load: loadTask, fields: TASK_FIELDS, ...extra });
const step = (extra: Partial<ActivityEntry> = {}): ActivityEntry => ({ entity: 'step', target: param('stepId'), load: loadStep, fields: STEP_FIELDS, ...extra });
const member = (): ActivityEntry => ({ entity: 'member', target: memberKey, load: loadMember, fields: MEMBER_FIELDS });
const raciActivity = (target: ActivityEntry['target']): ActivityEntry => ({ entity: 'raci', target, load: loadRaciActivity, fields: [] });
const criterion = (target: ActivityEntry['target']): ActivityEntry => ({ entity: 'deliverable', target, load: loadCriterion, fields: ['met'] });
const dependency = (target: ActivityEntry['target']): ActivityEntry => ({ entity: 'task', target, load: loadDependency, fields: [] });

/** Miembro: «proyecto|persona»; al darlo de alta, la persona va en el cuerpo. */
async function memberKey(c: Ctx): Promise<string | null> {
  const projectId = routeParam(c, 'id');
  const userId = routeParam(c, 'userId') ?? (await bodyOf(c)).userId;
  return projectId && typeof userId === 'string' ? joinKey(projectId, userId) : null;
}

/** Celda RACI: «actividad|tipo|participante», todo en el cuerpo. */
async function raciCellKey(c: Ctx): Promise<string | null> {
  const { activityId, kind, partyId } = await bodyOf(c);
  return typeof activityId === 'string' && typeof partyId === 'string' ? joinKey(activityId, String(kind), partyId) : null;
}

/** Dependencia: «sucesora|predecesora». */
async function dependencyKey(c: Ctx): Promise<string | null> {
  const successorId = routeParam(c, 'id');
  const predecessorId = routeParam(c, 'predecessorId') ?? (await bodyOf(c)).predecessorId;
  return successorId && typeof predecessorId === 'string' ? joinKey(successorId, predecessorId) : null;
}

/** Clave: "MÉTODO patrón", como la devuelve `listRoutes`. */
export const ACTIVITY_TABLE: Record<string, ActivityEntry> = {
  'POST /api/projects': project({ target: responseId }),
  'PATCH /api/projects/:id': project(),
  'PUT /api/projects/:id/charter': project(),
  'POST /api/projects/:id/charter/approve': project({ action: 'approved' }),
  'POST /api/projects/:id/baselines': project({ action: 'baselined' }),
  'POST /api/projects/:id/closure': project({ action: 'closed' }),
  'POST /api/projects/:id/reopen': project({ action: 'reopened' }),

  'POST /api/projects/:id/members': member(),
  'PATCH /api/projects/:id/members/:userId': member(),
  'DELETE /api/projects/:id/members/:userId': member(),

  'POST /api/projects/:id/tasks': task({ target: responseId }),
  'PATCH /api/tasks/:id': task(),
  'DELETE /api/tasks/:id': task(),
  'POST /api/tasks/:id/move': task(),
  'PUT /api/tasks/:id/assignees': task(),
  'PATCH /api/tasks/:id/progress': task(),
  'POST /api/tasks/:id/dependencies': dependency(dependencyKey),
  'DELETE /api/tasks/:id/dependencies/:predecessorId': dependency(dependencyKey),

  'POST /api/tasks/:id/steps': step({ target: responseId }),
  'PATCH /api/tasks/:id/steps/:stepId': step(),
  'DELETE /api/tasks/:id/steps/:stepId': step(),

  'POST /api/tasks/:id/comments': { entity: 'comment', action: 'commented', target: responseId, load: loadComment, fields: [] },

  'POST /api/attachments/:id/complete': {
    entity: 'attachment',
    action: 'uploaded',
    target: param('id'),
    load: loadAttachment,
    fields: [],
    // Completar es idempotente: solo cuenta la primera vez.
    skip: (before) => before?.values.uploadedAt != null,
  },
  'DELETE /api/attachments/:id': { entity: 'attachment', target: param('id'), load: loadAttachment, fields: [] },

  ...crudEntries('objectives', 'itemId', { entity: 'objective', load: loadObjective, fields: ['status'] }),
  ...crudEntries('milestones', 'itemId', { entity: 'milestone', load: loadMilestone, fields: ['status', 'dueDate'] }),
  ...crudEntries('stakeholders', 'itemId', { entity: 'stakeholder', load: loadStakeholder, fields: [] }),
  ...crudEntries('risks', 'itemId', { entity: 'risk', load: loadRisk, fields: ['status', 'ownerId', 'probability', 'impact'] }),
  ...crudEntries('expenses', 'itemId', { entity: 'expense', load: loadExpense, fields: ['amountCents', 'date', 'category'] }),

  'POST /api/projects/:id/raci/activities': raciActivity(responseId),
  'PATCH /api/projects/:id/raci/activities/:activityId': raciActivity(param('activityId')),
  'DELETE /api/projects/:id/raci/activities/:activityId': raciActivity(param('activityId')),
  'PUT /api/projects/:id/raci/cells': {
    entity: 'raci',
    target: raciCellKey,
    load: loadRaciCell,
    fields: ['role'],
    action: (before, after) => (before?.values.role == null ? 'created' : after?.values.role == null ? 'deleted' : 'updated'),
    // Quitar un rol que no había no cambia nada.
    skip: (before, after) => before?.values.role == null && after?.values.role == null,
  },

  ...crudEntries('change-requests', 'crId', { entity: 'change', load: loadChange, fields: CHANGE_FIELDS }),
  'POST /api/projects/:id/change-requests/:crId/decision': { entity: 'change', action: 'decided', target: param('crId'), load: loadChange, fields: CHANGE_FIELDS },
  // Aplicar queda como edición de la solicitud: el cambio de estado a «Aplicada» aparece en el detalle.
  'POST /api/projects/:id/change-requests/:crId/apply': { entity: 'change', action: 'updated', target: param('crId'), load: loadChange, fields: CHANGE_FIELDS },

  ...crudEntries('incidents', 'incidentId', { entity: 'incident', load: loadIncident, fields: INCIDENT_FIELDS }),
  'POST /api/projects/:id/risks/:riskId/incident': { entity: 'incident', target: responseId, load: loadIncidentFromRisk, fields: INCIDENT_FIELDS },

  ...crudEntries('decisions', 'decisionId', { entity: 'decision', load: loadDecision, fields: ['decidedOn'] }),

  ...crudEntries('deliverables', 'did', { entity: 'deliverable', load: loadDeliverable, fields: DELIVERABLE_FIELDS }),
  'POST /api/projects/:id/deliverables/:did/reviews': { entity: 'deliverable', action: 'reviewed', target: param('did'), load: loadDeliverable, fields: DELIVERABLE_FIELDS },
  'PUT /api/projects/:id/deliverables/:did/criteria/order': { entity: 'deliverable', target: param('did'), load: loadDeliverable, fields: DELIVERABLE_FIELDS },
  // La respuesta es el entregable completo: el criterio nuevo es el último.
  'POST /api/projects/:id/deliverables/:did/criteria': criterion((_c, response) => response?.criteria?.at(-1)?.id ?? null),
  'PATCH /api/projects/:id/deliverables/:did/criteria/:cid': criterion(param('cid')),
  'DELETE /api/projects/:id/deliverables/:did/criteria/:cid': criterion(param('cid')),

  ...crudEntries('lessons', 'lessonId', { entity: 'lesson', load: loadLesson, fields: ['type', 'category'] }),
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
  'POST /api/notifications/:id/read': 'No es de un proyecto',
  'POST /api/notifications/read-all': 'No es de un proyecto',
};
