import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, observer, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null };
const url = '/api/projects/p1/deliverables';
const row = { id: 'd2', number: 2, name: 'Portal publicado', status: 'IN_REVIEW', dueDate: null, overdue: false, milestone: null, criteriaMet: 1, criteriaTotal: 2 };
const review = { id: 'r1', outcome: 'ACCEPTED', reviewedOn: '2026-11-10', note: 'Todo bien', attachment: null, attachmentName: '', criteria: [], createdAt: '2026-11-10T10:00:00.000Z' };
const detail = (over: object = {}) => ({
  ...row,
  lastReview: { outcome: 'ACCEPTED', reviewedOn: '2026-11-10' },
  description: '',
  criteria: [
    { id: 'c1', text: 'Funciona en móvil', met: true, position: 0 },
    { id: 'c2', text: 'Manual', met: false, position: 1 },
  ],
  reviews: [review],
  work: [],
  ...over,
});
const deliverableRoutes = (user: object, d: object) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/milestones': [],
  'GET /api/projects/p1/stakeholders': [],
  'GET /api/projects/p1/attachments': [],
  [`GET ${url}`]: [row],
  [`GET ${url}/d2`]: d,
});
const openDeliverable = async () => {
  renderApp('/proyectos/p1/entregables');
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Ver ENT-2' }));
  return within(await screen.findByRole('dialog', { name: 'ENT-2 · Portal publicado' }));
};

describe('entregables del equipo', () => {
  for (const [who, user] of [['colaborador', collaborator], ['observador', observer]] as const) {
    it(`el ${who} los lee sin controles de edición ni nombre de quien revisó`, async () => {
      mockApi(deliverableRoutes(user, detail()));
      const dialog = await openDeliverable();
      expect(screen.queryByRole('button', { name: 'Añadir entregable' })).not.toBeInTheDocument();
      expect(dialog.getByText('Funciona en móvil')).toBeInTheDocument();
      // Las casillas muestran qué se cumple, pero no se pueden marcar.
      for (const box of dialog.getAllByRole('checkbox')) expect(box).toBeDisabled();
      expect(dialog.queryByLabelText('Nuevo criterio')).not.toBeInTheDocument();
      for (const name of ['Editar', 'Eliminar', 'Aceptar', 'Rechazar', 'Enviar a revisión']) {
        expect(dialog.queryByRole('button', { name })).not.toBeInTheDocument();
      }
      const history = within(dialog.getByRole('region', { name: 'Revisiones' }));
      expect(history.getByText(/^Aceptado el 10 [a-z]+ 2026$/)).toBeInTheDocument();
      expect(history.queryByText(/·/)).not.toBeInTheDocument();
    });
  }

  it('el PM sigue viendo quién revisó', async () => {
    mockApi(deliverableRoutes(pmUser, detail({ reviews: [{ ...review, stakeholder: { id: 's1', name: 'María Pérez' }, stakeholderName: 'María Pérez' }] })));
    const dialog = await openDeliverable();
    expect(within(dialog.getByRole('region', { name: 'Revisiones' })).getByText(/María Pérez/)).toBeInTheDocument();
  });
});

const risk = { id: 'r1', description: '<p>Proveedor tarde</p>', type: 'THREAT', probability: 2, impact: 3, score: 6, response: 'MITIGATE', responsePlan: '', ownerId: 'c1', status: 'OPEN', version: 2 };
const riskRoutes = {
  ...signedInAs(collaborator),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '' }],
  'GET /api/projects/p1/risks': [risk],
};

describe('riesgos del colaborador', () => {
  it('ve sus riesgos sin botones de registro y cambia su estado', async () => {
    const api = mockApi({ ...riskRoutes, 'PATCH /api/projects/p1/risks/r1': { ...risk, status: 'TREATING' } });
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    expect(await screen.findByText('Proveedor tarde')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir riesgo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver Proveedor tarde' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByText('Incidentes')).not.toBeInTheDocument();
    await user.selectOptions(dialog.getByLabelText('Estado del riesgo'), 'TREATING');
    await waitFor(() => {
      const call = api.calls.find((c) => c.key === 'PATCH /api/projects/p1/risks/r1');
      expect(call?.body).toEqual({ status: 'TREATING', version: 2 });
    });
  });

  it('con el proyecto cerrado no puede cambiar el estado', async () => {
    mockApi({ ...riskRoutes, 'GET /api/projects/p1': { ...project, status: 'CLOSED' } });
    renderApp('/proyectos/p1/riesgos');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ver Proveedor tarde' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByLabelText('Estado del riesgo')).not.toBeInTheDocument();
    expect(dialog.getByText('Abierto')).toBeInTheDocument();
  });
});
