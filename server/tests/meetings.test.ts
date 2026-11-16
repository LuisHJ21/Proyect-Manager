import type { Project, Stakeholder, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('actas de reunión', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let beto: User;
  let obs: User;
  let project: Project;
  let sponsor: Stakeholder;
  const TODAY = '2026-11-16';
  const url = () => `/api/projects/${project.id}/meetings`;
  const create = async (body: object) => {
    const res = await ctx.as(pm).post(url(), { title: 'Seguimiento', date: TODAY, ...body });
    expect(res.statusCode).toBe(201);
    return res.json();
  };
  const convert = (meetingId: string, agreementId: string, kind: string) => ctx.as(pm).post(`${url()}/${meetingId}/agreements/${agreementId}/convert`, { kind });

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(`${TODAY}T10:00:00`);
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    beto = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Beto' });
    obs = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [ana, beto, obs] });
    sponsor = await ctx.prisma.stakeholder.create({ data: { projectId: project.id, name: 'Patrocinador' } });
  });
  afterEach(() => ctx.close());

  it('el colaborador ve solo las actas a las que asistió, sin interesados ni ids de decisión o incidente', async () => {
    const mine = await create({ userIds: [ana.id], stakeholderIds: [sponsor.id], notes: '<p>Notas</p>', agreements: [{ text: 'Aprobar presupuesto' }, { text: 'Revisar plano', ownerId: ana.id }] });
    await create({ title: 'Otra', userIds: [beto.id] });
    expect((await convert(mine.id, mine.agreements[0].id, 'decision')).statusCode).toBe(200);
    expect((await convert(mine.id, mine.agreements[1].id, 'task')).statusCode).toBe(200);

    const list = (await ctx.as(ana).get(url())).json();
    expect(list).toEqual([expect.objectContaining({ id: mine.id, title: 'Seguimiento', attendeeCount: 1, agreementCount: 2 })]);
    const detail = (await ctx.as(ana).get(`${url()}/${mine.id}`)).json();
    expect(detail.attendees).toEqual({ users: [{ id: ana.id, name: 'Ana' }], stakeholders: [] });
    expect(detail.agreements[0]).not.toHaveProperty('decisionId');
    expect(detail.agreements[0]).not.toHaveProperty('incidentId');
    expect(detail.agreements[0].convertedTo).toBe('decision');
    expect(detail.agreements[1]).toMatchObject({ convertedTo: 'task', taskId: expect.any(String) });
    expect(JSON.stringify(detail)).not.toContain('Patrocinador');

    const other = (await ctx.as(pm).get(url())).json().find((m: { title: string }) => m.title === 'Otra');
    expect((await ctx.as(ana).get(`${url()}/${other.id}`)).statusCode).toBe(404);
    expect((await ctx.as(obs).get(url())).statusCode).toBe(403);
    expect((await ctx.as(ana).post(url(), { title: 'X', date: TODAY })).statusCode).toBe(403);

    const pmView = (await ctx.as(pm).get(`${url()}/${mine.id}`)).json();
    expect(pmView.attendees.stakeholders).toEqual([{ id: sponsor.id, name: 'Patrocinador' }]);
    expect(pmView.agreements[0].decisionId).toEqual(expect.any(String));
  });

  it('convertir en tarea crea la tarea asignada y convertir de nuevo da 409', async () => {
    const meeting = await create({ userIds: [ana.id], agreements: [{ text: 'Enviar minuta', ownerId: ana.id, dueDate: '2026-11-20' }] });
    const res = await convert(meeting.id, meeting.agreements[0].id, 'task');
    expect(res.statusCode).toBe(200);
    const task = await ctx.prisma.task.findUniqueOrThrow({ where: { id: res.json().taskId }, include: { assignees: true } });
    expect(task).toMatchObject({ title: 'Enviar minuta', dueDate: '2026-11-20', projectId: project.id, parentId: null });
    expect(task.assignees.map((a) => a.userId)).toEqual([ana.id]);
    expect(await ctx.prisma.notification.count({ where: { userId: ana.id, kind: 'TASK_ASSIGNED' } })).toBe(1);
    const again = await convert(meeting.id, meeting.agreements[0].id, 'incident');
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toBe('Este acuerdo ya se convirtió');
    expect(await ctx.prisma.task.count()).toBe(1);
    expect(await ctx.prisma.incident.count()).toBe(0);
  });

  it('convertir en incidente y en decisión', async () => {
    const meeting = await create({ agreements: [{ text: 'Falla en la bomba', ownerId: beto.id, dueDate: '2026-11-18' }, { text: 'Usar proveedor B' }] });
    const inc = await convert(meeting.id, meeting.agreements[0].id, 'incident');
    expect(inc.statusCode).toBe(200);
    expect(await ctx.prisma.incident.findUniqueOrThrow({ where: { id: inc.json().incidentId } })).toMatchObject({ title: 'Falla en la bomba', ownerId: beto.id, dueDate: '2026-11-18', reportedById: pm.id, number: 1 });
    const dec = await convert(meeting.id, meeting.agreements[1].id, 'decision');
    expect(await ctx.prisma.decision.findUniqueOrThrow({ where: { id: dec.json().decisionId } })).toMatchObject({ title: 'Usar proveedor B', decidedOn: TODAY, number: 1 });
  });

  it('dos conversiones simultáneas crean un solo elemento', async () => {
    const meeting = await create({ agreements: [{ text: 'Contratar grúa' }] });
    const results = await Promise.all([convert(meeting.id, meeting.agreements[0].id, 'decision'), convert(meeting.id, meeting.agreements[0].id, 'decision')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await ctx.prisma.decision.count()).toBe(1);
  });

  it('el responsable que salió del proyecto impide convertir y no crea nada', async () => {
    const meeting = await create({ agreements: [{ text: 'Medir el terreno', ownerId: ana.id }] });
    await ctx.prisma.projectMember.deleteMany({ where: { projectId: project.id, userId: ana.id } });
    expect((await convert(meeting.id, meeting.agreements[0].id, 'task')).statusCode).toBe(400);
    expect((await convert(meeting.id, meeting.agreements[0].id, 'incident')).statusCode).toBe(400);
    expect(await ctx.prisma.task.count()).toBe(0);
    expect(await ctx.prisma.incident.count()).toBe(0);
  });

  it('el acta se sigue editando aunque un asistente o responsable ya no sea miembro', async () => {
    const meeting = await create({ userIds: [ana.id], agreements: [{ text: 'Revisar plano', ownerId: ana.id }] });
    await convert(meeting.id, meeting.agreements[0].id, 'task');
    expect((await ctx.as(pm).delete(`/api/projects/${project.id}/members/${ana.id}`)).statusCode).toBe(200);
    // El formulario envía todo lo guardado; solo se valida lo nuevo.
    const res = await ctx.as(pm).patch(`${url()}/${meeting.id}`, {
      title: 'Seguimiento 2',
      userIds: [ana.id],
      agreements: [{ id: meeting.agreements[0].id, text: 'Revisar plano', ownerId: ana.id }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().attendees.users).toEqual([{ id: ana.id, name: 'Ana' }]);
    // Agregarla de nuevo como asistente o responsable nueva sí se rechaza.
    const other = await create({});
    expect((await ctx.as(pm).patch(`${url()}/${other.id}`, { userIds: [ana.id] })).statusCode).toBe(400);
    expect((await ctx.as(pm).patch(`${url()}/${other.id}`, { agreements: [{ text: 'Nuevo', ownerId: ana.id }] })).statusCode).toBe(400);
  });

  it('quitar a un miembro lo saca como responsable de los acuerdos sin convertir', async () => {
    const meeting = await create({ agreements: [{ text: 'Medir el terreno', ownerId: ana.id }] });
    expect((await ctx.as(pm).delete(`/api/projects/${project.id}/members/${ana.id}`)).statusCode).toBe(200);
    const detail = (await ctx.as(pm).get(`${url()}/${meeting.id}`)).json();
    expect(detail.agreements[0].owner).toBeNull();
  });

  it('borrar la tarea creada deja el acuerdo sin vínculo y borrar un interesado lo quita de los asistentes', async () => {
    const meeting = await create({ stakeholderIds: [sponsor.id], agreements: [{ text: 'Pedir permisos' }] });
    const { taskId } = (await convert(meeting.id, meeting.agreements[0].id, 'task')).json();
    expect((await ctx.as(pm).delete(`/api/tasks/${taskId}`)).statusCode).toBe(200);
    expect((await ctx.as(pm).delete(`/api/projects/${project.id}/stakeholders/${sponsor.id}`)).statusCode).toBe(200);
    const detail = (await ctx.as(pm).get(`${url()}/${meeting.id}`)).json();
    expect(detail.agreements[0]).toMatchObject({ taskId: null, convertedTo: null });
    expect(detail.attendees.stakeholders).toEqual([]);
  });

  it('asistentes y responsables deben ser del proyecto', async () => {
    const stranger = await ctx.makeUser({ role: 'COLLABORATOR' });
    const bad = await ctx.as(pm).post(url(), { title: 'X', date: TODAY, userIds: [stranger.id] });
    expect(bad.statusCode).toBe(400);
    expect(JSON.stringify(bad.json())).toContain('El asistente debe ser miembro del proyecto');
    const otherProject = await ctx.makeProject();
    const foreign = await ctx.prisma.stakeholder.create({ data: { projectId: otherProject.id, name: 'Ajeno' } });
    const badStakeholder = await ctx.as(pm).post(url(), { title: 'X', date: TODAY, stakeholderIds: [foreign.id] });
    expect(JSON.stringify(badStakeholder.json())).toContain('El interesado no pertenece a este proyecto');
    const observerOwner = await ctx.as(pm).post(url(), { title: 'X', date: TODAY, agreements: [{ text: 'A', ownerId: obs.id }] });
    expect(observerOwner.statusCode).toBe(400);
    // El PM puede asistir aunque no sea miembro.
    await create({ userIds: [pm.id] });
  });

  it('un acuerdo convertido no se borra ni cambia de texto; los demás se sincronizan', async () => {
    const meeting = await create({ agreements: [{ text: 'Uno' }, { text: 'Dos' }] });
    const [one, two] = meeting.agreements;
    await convert(meeting.id, one.id, 'decision');
    const removed = await ctx.as(pm).patch(`${url()}/${meeting.id}`, { agreements: [{ id: two.id, text: 'Dos' }] });
    expect(removed.statusCode).toBe(409);
    const renamed = await ctx.as(pm).patch(`${url()}/${meeting.id}`, { agreements: [{ id: one.id, text: 'Otro' }, { id: two.id, text: 'Dos' }] });
    expect(renamed.statusCode).toBe(409);
    const ok = await ctx.as(pm).patch(`${url()}/${meeting.id}`, { title: 'Nuevo título', agreements: [{ id: one.id, text: 'Uno' }, { text: 'Tres' }] });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().title).toBe('Nuevo título');
    expect(ok.json().agreements.map((a: { text: string }) => a.text)).toEqual(['Uno', 'Tres']);
  });

  it('las notas se sanean y borrar el acta no borra lo creado', async () => {
    const meeting = await create({ notes: '<p>Hola</p><script>alert(1)</script>', agreements: [{ text: 'Uno' }] });
    expect(meeting.notes).not.toContain('<script>');
    await convert(meeting.id, meeting.agreements[0].id, 'decision');
    expect((await ctx.as(pm).delete(`${url()}/${meeting.id}`)).statusCode).toBe(200);
    expect(await ctx.prisma.decision.count()).toBe(1);
    expect((await ctx.as(pm).get(`${url()}/${meeting.id}`)).statusCode).toBe(404);
  });
});
