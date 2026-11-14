import type { ActivityEntry } from './types';
import { loadComment, loadProject, loadStep, loadTask, param, responseId } from './loaders';

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
