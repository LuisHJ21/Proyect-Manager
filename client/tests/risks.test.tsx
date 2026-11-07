import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'PLANNING', approach: 'AGILE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD' };
const risk = {
  id: 'r1',
  description: 'Retraso',
  type: 'THREAT',
  probability: 4,
  impact: 5,
  score: 20,
  response: 'MITIGATE',
  responsePlan: '',
  ownerId: 'c1',
  status: 'OPEN',
};
const routes = {
  ...signedInAs(pmUser),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '' }],
};

describe('riesgos', () => {
  it('al cambiar el tipo, las respuestas cambian y se limpia una inválida', async () => {
    const api = mockApi({ ...routes, 'GET /api/projects/p1/risks': [], 'POST /api/projects/p1/risks': risk });
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir riesgo' }));
    const response = screen.getByLabelText('Respuesta');
    expect(response).toHaveTextContent('Mitigar');
    expect(response).not.toHaveTextContent('Explotar');

    await user.selectOptions(screen.getByLabelText('Tipo'), 'OPPORTUNITY');
    expect(response).toHaveTextContent('Explotar');
    expect(response).not.toHaveTextContent('Mitigar');

    await user.type(screen.getByLabelText('Descripción'), 'Ahorro');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.key === 'POST /api/projects/p1/risks');
      expect(call?.body).toMatchObject({ type: 'OPPORTUNITY', response: 'EXPLOIT', probability: 3, impact: 3 });
    });
  });

  it('muestra el puntaje y destaca los de 15 o más', async () => {
    mockApi({ ...routes, 'GET /api/projects/p1/risks': [risk, { ...risk, id: 'r2', description: 'Menor', score: 6, probability: 2, impact: 3 }] });
    renderApp('/proyectos/p1/riesgos');
    expect(await screen.findByText('20 · Alto')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getAllByText('Carlos')).toHaveLength(2);
  });

  it('interesados muestra sus registros', async () => {
    mockApi({
      ...routes,
      'GET /api/projects/p1/stakeholders': [
        { id: 's1', name: 'Dirección', organization: 'ACME', position: 'CEO', contact: '', influence: 'HIGH', interest: 'LOW', strategy: 'Informar' },
      ],
    });
    renderApp('/proyectos/p1/interesados');
    expect(await screen.findByText('Dirección')).toBeInTheDocument();
    expect(screen.getByText('Alto')).toBeInTheDocument();
    expect(screen.getByText('Bajo')).toBeInTheDocument();
  });
});
