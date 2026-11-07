import type { User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('correcciones de la revisión', () => {
  let ctx: TestCtx;
  let pm: User;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
  });
  afterEach(() => ctx.close());

  describe('montos grandes', () => {
    const FIFTY_MILLION = 5_000_000_000;

    it('un presupuesto de 50 millones se guarda y la lista de proyectos sigue funcionando', async () => {
      const created = await ctx.as(pm).post('/api/projects', { name: 'Grande', plannedBudgetCents: FIFTY_MILLION });
      expect(created.statusCode).toBe(201);
      expect(created.json().plannedBudgetCents).toBe(FIFTY_MILLION);
      const list = await ctx.as(pm).get('/api/projects');
      expect(list.statusCode).toBe(200);
      expect(list.json()[0].plannedBudgetCents).toBe(FIFTY_MILLION);
    });

    it('editar el presupuesto a 50 millones responde bien y el proyecto sigue abriendo', async () => {
      const p = await ctx.makeProject({ name: 'X' });
      const res = await ctx.as(pm).patch(`/api/projects/${p.id}`, { plannedBudgetCents: FIFTY_MILLION });
      expect(res.statusCode).toBe(200);
      expect(res.json().plannedBudgetCents).toBe(FIFTY_MILLION);
      expect((await ctx.as(pm).get(`/api/projects/${p.id}`)).statusCode).toBe(200);
      expect((await ctx.as(pm).delete(`/api/projects/${p.id}`, { confirmName: 'X' })).statusCode).toBe(200);
    });

    it('un gasto de 30 millones se lista y los indicadores lo suman', async () => {
      const p = await ctx.makeProject({ plannedBudgetCents: FIFTY_MILLION });
      const url = `/api/projects/${p.id}`;
      const body = { description: 'Obra', amountCents: 3_000_000_000, date: '2026-11-01', category: 'OTHER' };
      const created = await ctx.as(pm).post(`${url}/expenses`, body);
      expect(created.statusCode).toBe(201);
      expect(created.json().amountCents).toBe(3_000_000_000);
      expect((await ctx.as(pm).get(`${url}/expenses`)).json()[0].amountCents).toBe(3_000_000_000);
      const updated = await ctx.as(pm).patch(`${url}/expenses/${created.json().id}`, { amountCents: 4_000_000_000 });
      expect(updated.json().amountCents).toBe(4_000_000_000);
      const { budget } = (await ctx.as(pm).get(`${url}/indicators`)).json();
      expect(budget).toEqual({ plannedCents: FIFTY_MILLION, spentCents: 4_000_000_000, differenceCents: 1_000_000_000 });
    });

    it('un monto fuera del límite se rechaza por campo, sin romper nada', async () => {
      const tooBig = 100_000_000_000_000;
      const res = await ctx.as(pm).post('/api/projects', { name: 'X', plannedBudgetCents: tooBig });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields.plannedBudgetCents).toBeTruthy();
      const p = await ctx.makeProject();
      const patch = await ctx.as(pm).patch(`/api/projects/${p.id}`, { plannedBudgetCents: tooBig });
      expect(patch.json().error.fields.plannedBudgetCents).toBeTruthy();
      const expense = await ctx.as(pm).post(`/api/projects/${p.id}/expenses`, { description: 'G', amountCents: tooBig, date: '2026-11-01', category: 'OTHER' });
      expect(expense.json().error.fields.amountCents).toBeTruthy();
    });
  });

  it('con contraseña temporal, setup/status sigue respondiendo', async () => {
    const c = await ctx.makeUser({ role: 'COLLABORATOR', mustChangePassword: true });
    const res = await ctx.as(c).get('/api/setup/status');
    expect(res.statusCode).toBe(200);
    expect(res.json().needsSetup).toBe(false);
  });

  describe('asignado desactivado', () => {
    it('se puede editar la tarea conservándolo', async () => {
      const inactive = await ctx.makeUser({ role: 'COLLABORATOR', active: false });
      const project = await ctx.makeProject({ members: [inactive] });
      const task = await ctx.makeTask(project.id, { assignees: [inactive] });
      const res = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { title: 'Nuevo', assigneeIds: [inactive.id] });
      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe('Nuevo');
      expect(res.json().assignees.map((a: { id: string }) => a.id)).toEqual([inactive.id]);
      const put = await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [inactive.id] });
      expect(put.statusCode).toBe(200);
    });

    it('no se puede asignar a alguien inactivo que no estaba asignado', async () => {
      const inactive = await ctx.makeUser({ role: 'COLLABORATOR', active: false });
      const project = await ctx.makeProject({ members: [inactive] });
      const task = await ctx.makeTask(project.id);
      const res = await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [inactive.id] });
      expect(res.statusCode).toBe(400);
    });

    it('una edición con asignados inválidos no guarda nada', async () => {
      const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
      const project = await ctx.makeProject();
      const task = await ctx.makeTask(project.id, { title: 'Original' });
      const res = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { title: 'Cambiado', assigneeIds: [outsider.id] });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields.assigneeIds).toBeTruthy();
      expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe('Original');
    });

    it('la lista de miembros indica quién está inactivo', async () => {
      const inactive = await ctx.makeUser({ role: 'COLLABORATOR', active: false });
      const project = await ctx.makeProject({ members: [inactive] });
      const [member] = (await ctx.as(pm).get(`/api/projects/${project.id}/members`)).json();
      expect(member.active).toBe(false);
    });
  });

  it('el bloqueo de inicio de sesión dice cuándo volver a intentarlo', async () => {
    const u = await ctx.makeUser({ role: 'PM', password: 'contraseña-larga' });
    for (let i = 0; i < 5; i++) await ctx.anon.post('/api/auth/login', { email: u.email, password: 'incorrecta-123' });
    const res = await ctx.anon.post('/api/auth/login', { email: u.email, password: 'contraseña-larga' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.message).toContain('15 minutos');
  });
});
