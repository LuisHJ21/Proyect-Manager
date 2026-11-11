import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, pmUser, renderApp, setRichText, signedInAs } from './helpers';

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

    await setRichText('Descripción', '<p>Ahorro</p>');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.key === 'POST /api/projects/p1/risks');
      expect(call?.body).toMatchObject({ type: 'OPPORTUNITY', response: 'EXPLOIT', probability: 3, impact: 3, description: '<p>Ahorro</p>' });
    });
  });

  const formatted = { ...risk, description: '<p><strong>Retraso</strong> del proveedor</p>', responsePlan: '<ul><li>Llamar</li></ul>' };

  it('la tabla muestra el riesgo en texto plano recortado', async () => {
    mockApi({ ...routes, 'GET /api/projects/p1/risks': [formatted] });
    renderApp('/proyectos/p1/riesgos');
    const cell = await screen.findByText('Retraso del proveedor');
    expect(cell).toHaveClass('line-clamp-2');
    expect(screen.getByRole('table').querySelector('strong')).toBeNull();
  });

  it('las acciones y la confirmación usan texto plano', async () => {
    mockApi({ ...routes, 'GET /api/projects/p1/risks': [formatted] });
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Editar Retraso del proveedor' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eliminar Retraso del proveedor' }));
    expect(within(screen.getByRole('dialog')).getByText(/«Retraso del proveedor»/)).toBeInTheDocument();
  });

  it('Ver riesgo muestra descripción y plan con formato', async () => {
    mockApi({ ...routes, 'GET /api/projects/p1/risks': [formatted, { ...risk, id: 'r2', description: '<p>Sin plan</p>', responsePlan: '' }] });
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver Retraso del proveedor' }));
    const dialog = screen.getByRole('dialog', { name: 'Detalle del riesgo' });
    expect(within(dialog).getByText('Retraso').tagName).toBe('STRONG');
    expect(within(dialog).getByText('Llamar').tagName).toBe('LI');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await user.click(screen.getByRole('button', { name: 'Ver Sin plan' }));
    expect(within(screen.getByRole('dialog', { name: 'Detalle del riesgo' })).getByText('Sin plan de respuesta.')).toBeInTheDocument();
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

describe('riesgo a incidente', () => {
  const linked = { ...risk, incidents: [{ id: 'i1', number: 1, title: 'Retraso', status: 'OPEN' }] };

  it('Pasar a incidente crea INC y lo avisa', async () => {
    const api = mockApi({
      ...routes,
      'GET /api/projects/p1/risks': [{ ...risk, incidents: [] }],
      'POST /api/projects/p1/risks/r1/incident': { id: 'i1', number: 1, title: 'Retraso' },
    });
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver Retraso' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pasar a incidente' }));
    expect(await screen.findByText('Se creó INC-1')).toBeInTheDocument();
    expect(api.calls.some((c) => c.key === 'POST /api/projects/p1/risks/r1/incident')).toBe(true);
  });

  it('tras pasar a incidente, el detalle abierto muestra el incidente nuevo', async () => {
    let created = false;
    mockApi({
      ...routes,
      'GET /api/projects/p1/risks': () => [created ? linked : { ...risk, incidents: [] }],
      'POST /api/projects/p1/risks/r1/incident': () => {
        created = true;
        return { id: 'i1', number: 1, title: 'Retraso' };
      },
    });
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ver Retraso' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Sin incidentes.')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Pasar a incidente' }));
    expect(await dialog.findByText(/INC-1 · Retraso · Abierto/)).toBeInTheDocument();
  });

  it('el detalle lista los incidentes del riesgo', async () => {
    mockApi({ ...routes, 'GET /api/projects/p1/risks': [linked] });
    renderApp('/proyectos/p1/riesgos');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ver Retraso' }));
    expect(within(screen.getByRole('dialog')).getByText(/INC-1 · Retraso · Abierto/)).toBeInTheDocument();
  });
});
