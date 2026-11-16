import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, observer, pmUser, renderApp, setRichText, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: null, endDate: null, closedAt: null };
const requirement = (over: object = {}) => ({
  id: 'r1',
  number: 1,
  description: '<p>Acceso con usuario</p>',
  priority: 'HIGH',
  status: 'APPROVED',
  acceptance: '',
  version: 3,
  deliverables: [{ id: 'd1', number: 1, name: 'Portal web', status: 'ACCEPTED' }],
  suggestMet: false,
  ...over,
});
const matrix = {
  requirements: [
    { id: 'r1', number: 1, description: 'Acceso con usuario', status: 'APPROVED', priority: 'HIGH', deliverables: [{ id: 'd1', number: 1, name: 'Portal web', status: 'ACCEPTED', tasks: { done: 2, total: 3 }, criteria: { met: 1, total: 2 } }] },
    { id: 'r2', number: 2, description: 'Reportes', status: 'PROPOSED', priority: 'LOW', deliverables: [] },
  ],
  orphanDeliverables: [{ id: 'd2', number: 2, name: 'Manual' }],
};
const base = (user: object, requirements: object[] = [requirement()]) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/requirements': requirements,
  'GET /api/projects/p1/traceability': matrix,
  'GET /api/projects/p1/deliverables': [
    { id: 'd1', number: 1, name: 'Portal web', status: 'ACCEPTED' },
    { id: 'd2', number: 2, name: 'Manual', status: 'PENDING' },
  ],
  'GET /api/projects/p1/stakeholders': [{ id: 's1', name: 'Patrocinador' }],
});

describe('requisitos y trazabilidad', () => {
  it('el PM crea un requisito eligiendo un entregable', async () => {
    const api = mockApi({ ...base(pmUser, []), 'POST /api/projects/p1/requirements': requirement() });
    renderApp('/proyectos/p1/requisitos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir requisito' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Añadir requisito' }));
    await setRichText('Descripción', '<p>Acceso con usuario</p>');
    await user.click(dialog.getByRole('checkbox', { name: 'ENT-2 · Manual' }));
    await user.selectOptions(dialog.getByLabelText('Prioridad'), 'HIGH');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/requirements')?.body).toMatchObject({ description: '<p>Acceso con usuario</p>', deliverableIds: ['d2'], priority: 'HIGH' }),
    );
  });

  it('sugiere marcar cumplido y lo marca', async () => {
    const api = mockApi({ ...base(pmUser, [requirement({ suggestMet: true })]), 'PATCH /api/projects/p1/requirements/r1': requirement({ status: 'MET' }) });
    renderApp('/proyectos/p1/requisitos');
    const user = userEvent.setup();
    expect(await screen.findByText('Todos sus entregables están aceptados')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marcar cumplido' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'PATCH /api/projects/p1/requirements/r1')?.body).toEqual({ status: 'MET', version: 3 }));
  });

  it('la matriz muestra conteos, requisitos sin entregable y entregables sin requisito', async () => {
    mockApi(base(observer));
    renderApp('/proyectos/p1/requisitos');
    const region = await screen.findByRole('region', { name: 'Matriz de trazabilidad' });
    expect(within(region).getByText('2 de 3')).toBeInTheDocument();
    expect(within(region).getByText('1 de 2')).toBeInTheDocument();
    expect(within(region).getByText('Sin entregable')).toBeInTheDocument();
    expect(within(region).getByText('Entregables sin requisito')).toBeInTheDocument();
    expect(within(region).getByText('ENT-2 · Manual')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir requisito' })).not.toBeInTheDocument();
  });

  it('el colaborador propone un cambio citando requisitos', async () => {
    const api = mockApi({
      ...base(collaborator),
      'GET /api/projects/p1/change-requests': [],
      'POST /api/projects/p1/change-requests': { id: 'c1', number: 1, title: 'Blog', description: '', status: 'PENDING', decisionNote: '', decidedAt: null, decidedBy: null, createdAt: '2026-11-16T10:00:00Z', requirements: [] },
    });
    renderApp('/proyectos/p1/cambios');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Proponer/ }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Título'), 'Blog');
    await user.click(await dialog.findByRole('checkbox', { name: /REQ-1/ }));
    await user.click(dialog.getByRole('button', { name: /Enviar|Proponer|Guardar/ }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/change-requests')?.body).toMatchObject({ title: 'Blog', requirementIds: ['r1'] }));
  });
});
