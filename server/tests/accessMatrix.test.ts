import { accessLevel, type Role, type Section } from '@pm/shared';
import type { Project, Risk, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listRoutes } from '../src/http';
import { createTestApp, type TestCtx } from './helpers/testApp';

/** Sección de la tabla de capacidades que gobierna cada ruta de un proyecto o de una tarea. */
const ROUTE_SECTION: Record<string, Section> = {
  'GET /api/projects/:id': 'project',
  'PATCH /api/projects/:id': 'project',
  'DELETE /api/projects/:id': 'project',
  'GET /api/projects/:id/indicators': 'project',
  'GET /api/projects/:id/activity': 'activity',
  'GET /api/projects/:id/activity/filters': 'activity',

  'GET /api/projects/:id/charter': 'planning',
  'PUT /api/projects/:id/charter': 'planning',
  'POST /api/projects/:id/charter/approve': 'planning',
  'GET /api/projects/:id/objectives': 'planning',
  'POST /api/projects/:id/objectives': 'planning',
  'PATCH /api/projects/:id/objectives/:itemId': 'planning',
  'DELETE /api/projects/:id/objectives/:itemId': 'planning',
  'GET /api/projects/:id/milestones': 'planning',
  'POST /api/projects/:id/milestones': 'planning',
  'PATCH /api/projects/:id/milestones/:itemId': 'planning',
  'DELETE /api/projects/:id/milestones/:itemId': 'planning',

  'GET /api/projects/:id/tasks': 'tasks',
  'POST /api/projects/:id/tasks': 'tasks',
  'GET /api/tasks/:id': 'tasks',
  'PATCH /api/tasks/:id': 'tasks',
  'DELETE /api/tasks/:id': 'tasks',
  'POST /api/tasks/:id/move': 'tasks',
  'PATCH /api/tasks/:id/progress': 'tasks',
  'PUT /api/tasks/:id/assignees': 'tasks',
  'POST /api/tasks/:id/steps': 'tasks',
  'PATCH /api/tasks/:id/steps/:stepId': 'tasks',
  'DELETE /api/tasks/:id/steps/:stepId': 'tasks',
  'POST /api/tasks/:id/dependencies': 'tasks',
  'PATCH /api/tasks/:id/dependencies/:predecessorId': 'tasks',
  'GET /api/projects/:id/schedule': 'tasks',
  'DELETE /api/tasks/:id/dependencies/:predecessorId': 'tasks',

  'POST /api/tasks/:id/comments': 'comments',
  'GET /api/tasks/:id/time-entries': 'comments',
  'POST /api/tasks/:id/time-entries': 'comments',
  'PATCH /api/tasks/:id/time-entries/:entryId': 'comments',
  'DELETE /api/tasks/:id/time-entries/:entryId': 'comments',

  'GET /api/projects/:id/attachments': 'attachments',
  'POST /api/projects/:id/attachments': 'attachments',
  'GET /api/tasks/:id/attachments': 'attachments',
  'POST /api/tasks/:id/attachments': 'attachments',

  'GET /api/projects/:id/members': 'members',
  'POST /api/projects/:id/members': 'members',
  'PATCH /api/projects/:id/members/:userId': 'members',
  'DELETE /api/projects/:id/members/:userId': 'members',
  'GET /api/projects/:id/members/:userId/impact': 'members',

  'GET /api/projects/:id/raci': 'raci',
  'POST /api/projects/:id/raci/activities': 'raci',
  'PATCH /api/projects/:id/raci/activities/:activityId': 'raci',
  'DELETE /api/projects/:id/raci/activities/:activityId': 'raci',
  'PUT /api/projects/:id/raci/cells': 'raci',

  'GET /api/projects/:id/deliverables': 'deliverables',
  'POST /api/projects/:id/deliverables': 'deliverables',
  'GET /api/projects/:id/deliverables/:did': 'deliverables',
  'PATCH /api/projects/:id/deliverables/:did': 'deliverables',
  'DELETE /api/projects/:id/deliverables/:did': 'deliverables',
  'POST /api/projects/:id/deliverables/:did/criteria': 'deliverables',
  'PUT /api/projects/:id/deliverables/:did/criteria/order': 'deliverables',
  'PATCH /api/projects/:id/deliverables/:did/criteria/:cid': 'deliverables',
  'DELETE /api/projects/:id/deliverables/:did/criteria/:cid': 'deliverables',
  'POST /api/projects/:id/deliverables/:did/reviews': 'deliverables',

  'GET /api/projects/:id/lessons': 'lessons',
  'POST /api/projects/:id/lessons': 'lessons',
  'PATCH /api/projects/:id/lessons/:lessonId': 'lessons',
  'DELETE /api/projects/:id/lessons/:lessonId': 'lessons',

  'GET /api/projects/:id/incidents': 'incidents',
  'POST /api/projects/:id/incidents': 'incidents',
  'GET /api/projects/:id/incidents/:incidentId': 'incidents',
  'PATCH /api/projects/:id/incidents/:incidentId': 'incidents',
  'DELETE /api/projects/:id/incidents/:incidentId': 'incidents',

  'GET /api/projects/:id/decisions': 'decisions',
  'POST /api/projects/:id/decisions': 'decisions',
  'PATCH /api/projects/:id/decisions/:decisionId': 'decisions',
  'DELETE /api/projects/:id/decisions/:decisionId': 'decisions',

  'GET /api/projects/:id/risks': 'risks',
  'POST /api/projects/:id/risks': 'risks',
  'PATCH /api/projects/:id/risks/:itemId': 'risks',
  'DELETE /api/projects/:id/risks/:itemId': 'risks',
  'POST /api/projects/:id/risks/:riskId/incident': 'risks',

  'GET /api/projects/:id/stakeholders': 'stakeholders',
  'POST /api/projects/:id/stakeholders': 'stakeholders',
  'PATCH /api/projects/:id/stakeholders/:itemId': 'stakeholders',
  'DELETE /api/projects/:id/stakeholders/:itemId': 'stakeholders',

  'GET /api/projects/:id/expenses': 'budget',
  'GET /api/projects/:id/budget-categories': 'budget',
  'PUT /api/projects/:id/budget-categories': 'budget',
  'POST /api/projects/:id/expenses': 'budget',
  'PATCH /api/projects/:id/expenses/:itemId': 'budget',
  'DELETE /api/projects/:id/expenses/:itemId': 'budget',

  'GET /api/projects/:id/performance': 'performance',
  'POST /api/projects/:id/baselines': 'performance',

  'GET /api/projects/:id/change-requests': 'changes',
  'POST /api/projects/:id/change-requests': 'changes',
  'PATCH /api/projects/:id/change-requests/:crId': 'changes',
  'DELETE /api/projects/:id/change-requests/:crId': 'changes',
  'POST /api/projects/:id/change-requests/:crId/decision': 'changes',
  'POST /api/projects/:id/change-requests/:crId/apply': 'changes',

  'GET /api/projects/:id/closure': 'closure',
  'POST /api/projects/:id/closure': 'closure',
  'POST /api/projects/:id/reopen': 'closure',
};

/** Escrituras que el colaborador puede hacer por una regla fina en código (asignado, responsable, autor), con pruebas propias. */
const FINE_GRAINED = new Set([
  'PATCH /api/tasks/:id/progress',
  'POST /api/tasks/:id/comments',
  'POST /api/tasks/:id/time-entries',
  'PATCH /api/tasks/:id/time-entries/:entryId',
  'DELETE /api/tasks/:id/time-entries/:entryId',
  'PATCH /api/tasks/:id/steps/:stepId',
  'POST /api/tasks/:id/attachments',
  'POST /api/projects/:id/incidents',
  'POST /api/projects/:id/change-requests',
  'PATCH /api/projects/:id/incidents/:incidentId',
  'PATCH /api/projects/:id/risks/:itemId',
]);

/** Lecturas reservadas al PM aunque la sección se lea: herramientas de gestión. */
const PM_ONLY_READS = new Set(['GET /api/projects/:id/members/:userId/impact']);

const isProjectRoute = (url: string) => /^\/api\/(projects\/:id|tasks\/:id)(\/|$)/.test(url);

describe('matriz perfil × ruta', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let olga: User;
  let project: Project;
  let task: Task;
  let risk: Risk;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    olga = await ctx.makeUser({ role: 'OBSERVER', name: 'Olga' });
    project = await ctx.makeProject({ members: [ana, olga] });
    task = await ctx.makeTask(project.id, { assignees: [ana] });
    risk = await ctx.prisma.risk.create({
      data: { projectId: project.id, description: 'R', type: 'THREAT', probability: 1, impact: 1, response: 'ACCEPT', ownerId: ana.id },
    });
  });
  afterEach(() => ctx.close());

  const routes = () =>
    listRoutes(ctx.app)
      .filter((r) => isProjectRoute(r.url))
      .map((r) => `${r.method} ${r.url}`)
      .filter((key, i, all) => all.indexOf(key) === i)
      // Los borrados al final: el PM los ejecuta de verdad.
      .sort((x, y) => Number(x.startsWith('DELETE')) - Number(y.startsWith('DELETE')));

  const pathOf = (key: string) =>
    key
      .split(' ')[1]!
      .replace(/^\/api\/projects\/:id/, `/api/projects/${project.id}`)
      .replace(/^\/api\/tasks\/:id/, `/api/tasks/${task.id}`)
      .replace(':itemId', risk.id)
      .replace(/:\w+/g, 'x');

  const send = (user: User, key: string) => {
    const method = key.split(' ')[0]!.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    return ctx.as(user)[method](pathOf(key), method === 'get' ? undefined : {});
  };

  const allowed = (role: Role, key: string) => {
    const section = ROUTE_SECTION[key]!;
    const level = accessLevel(role, section);
    if (key.startsWith('GET ')) return PM_ONLY_READS.has(key) ? role === 'PM' : level !== 'none';
    return level === 'write';
  };

  it('toda ruta de proyecto o tarea está clasificada', () => {
    const missing = routes().filter((key) => !(key in ROUTE_SECTION));
    expect(missing.map((key) => `Ruta sin clasificar: ${key}`)).toEqual([]);
    expect(routes().length).toBeGreaterThanOrEqual(85);
  });

  it('cada perfil recibe 403 exactamente donde la tabla lo niega', async () => {
    const failures: string[] = [];
    const keys = routes().filter((key) => key in ROUTE_SECTION);
    for (const [user, role] of [[olga, 'OBSERVER'], [ana, 'COLLABORATOR'], [pm, 'PM']] as const) {
      for (const key of keys) {
        if (role === 'COLLABORATOR' && FINE_GRAINED.has(key)) continue;
        const res = await send(user, key);
        const forbidden = res.statusCode === 403;
        if (allowed(role, key)) {
          if (forbidden) failures.push(`${role} ${key}: 403 y la tabla lo permite`);
        } else if (!forbidden) {
          failures.push(`${role} ${key}: ${res.statusCode} y la tabla lo niega`);
        } else if (role === 'OBSERVER' && !key.startsWith('GET ') && res.json().error.code !== 'observer_read_only') {
          failures.push(`${role} ${key}: código ${res.json().error.code}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
