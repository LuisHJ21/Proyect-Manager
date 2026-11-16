import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: null, endDate: null, closedAt: null };
const stakeholder = (over: object) => ({
  id: 's1',
  name: 'Dirección',
  organization: '',
  position: '',
  contact: '',
  influence: 'HIGH',
  interest: 'HIGH',
  strategy: '',
  currentEngagement: null,
  desiredEngagement: null,
  expectations: '',
  ...over,
});
const open = (stakeholders: object[]) => {
  mockApi({
    ...signedInAs(pmUser),
    'GET /api/projects/p1': project,
    'GET /api/projects/p1/members': [],
    'GET /api/projects/p1/stakeholders': stakeholders,
    'GET /api/projects/p1/raci': { activities: [], members: [], stakeholders: [], cells: [] },
    'GET /api/projects/p1/communications': [],
  });
  renderApp('/proyectos/p1/interesados');
};

describe('involucramiento de interesados', () => {
  it('la matriz marca la brecha', async () => {
    open([
      stakeholder({ id: 's1', name: 'Dirección', currentEngagement: 'RESISTANT', desiredEngagement: 'SUPPORTIVE' }),
      stakeholder({ id: 's2', name: 'Vecinos', currentEngagement: 'NEUTRAL', desiredEngagement: 'NEUTRAL' }),
    ]);
    expect(await screen.findByText('1 interesado con brecha')).toBeInTheDocument();
    const rows = document.querySelectorAll('tr[data-gap="true"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Dirección');
  });

  it('agrega una fila al plan de comunicaciones', async () => {
    const api = mockApi({
      ...signedInAs(pmUser),
      'GET /api/projects/p1': project,
      'GET /api/projects/p1/members': [],
      'GET /api/projects/p1/stakeholders': [],
      'GET /api/projects/p1/raci': { activities: [], members: [], stakeholders: [], cells: [] },
      'GET /api/projects/p1/communications': [],
      'POST /api/projects/p1/communications': { id: 'c1', topic: 'Avance', audience: 'Patrocinador', frequency: 'WEEKLY', channel: 'Correo', ownerId: null, owner: null, notes: '' },
    });
    renderApp('/proyectos/p1/interesados');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir comunicación' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Añadir comunicación' }));
    await user.type(dialog.getByLabelText('Qué se comunica'), 'Avance');
    await user.type(dialog.getByLabelText('A quién'), 'Patrocinador');
    await user.selectOptions(dialog.getByLabelText('Frecuencia'), 'WEEKLY');
    await user.type(dialog.getByLabelText('Canal'), 'Correo');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/communications')?.body).toMatchObject({ topic: 'Avance', audience: 'Patrocinador', frequency: 'WEEKLY', channel: 'Correo' }),
    );
  });

  it('la cuadrícula ubica al interesado en su cuadrante', async () => {
    open([stakeholder({ id: 's1', name: 'Dirección', influence: 'HIGH', interest: 'HIGH' }), stakeholder({ id: 's2', name: 'Vecinos', influence: 'LOW', interest: 'HIGH' })]);
    const close = await screen.findByRole('region', { name: 'Gestionar de cerca' });
    expect(within(close).getByText('Dirección')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Mantener informado' })).getByText('Vecinos')).toBeInTheDocument();
  });
});
