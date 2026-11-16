import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: null, endDate: null, plannedBudgetCents: 0, currency: 'USD', highRiskScore: 15 };
const risk = (over: object = {}) => ({
  id: 'r1',
  version: 2,
  description: '<p>Lluvias</p>',
  type: 'THREAT',
  probability: 4,
  impact: 5,
  score: 20,
  response: 'MITIGATE',
  responsePlan: '',
  ownerId: 'c1',
  status: 'OPEN',
  trigger: 'Pronóstico de lluvia',
  nextReviewDate: '2026-11-01',
  reviewOverdue: true,
  residualProbability: 2,
  residualImpact: 3,
  residualScore: 6,
  contingencyCostCents: 50000,
  assessments: [
    { assessedAt: '2026-11-10T10:00:00Z', assessedBy: { id: 'pm', name: 'Paula' }, probability: 4, impact: 5, residualProbability: 2, residualImpact: 3 },
    { assessedAt: '2026-11-01T10:00:00Z', assessedBy: { id: 'pm', name: 'Paula' }, probability: 3, impact: 5, residualProbability: null, residualImpact: null },
  ],
  incidents: [],
  ...over,
});
const routes = (user: object, risks: object[]) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '' }],
  'GET /api/projects/p1/risks': risks,
});

describe('matriz e historial de riesgos', () => {
  it('ubica el riesgo en su celda y lo mueve al ver el residual', async () => {
    mockApi(routes(pmUser, [risk()]));
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    const matrix = await screen.findByRole('region', { name: 'Matriz de riesgos' });
    expect(within(within(matrix).getByRole('cell', { name: /Probabilidad 4, impacto 5/ })).getByText('Lluvias')).toBeInTheDocument();
    await user.selectOptions(within(matrix).getByLabelText('Mostrar'), 'residual');
    expect(within(within(matrix).getByRole('cell', { name: /Probabilidad 2, impacto 3/ })).getByText('Lluvias')).toBeInTheDocument();
    expect(within(within(matrix).getByRole('cell', { name: /Probabilidad 4, impacto 5/ })).queryByText('Lluvias')).not.toBeInTheDocument();
  });

  it('el detalle muestra la revisión vencida, el disparador y el historial', async () => {
    mockApi(routes(pmUser, [risk()]));
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Ver/ }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Revisión vencida')).toBeInTheDocument();
    expect(dialog.getByText('Pronóstico de lluvia')).toBeInTheDocument();
    expect(dialog.getByText(/4 × 5 · residual 2 × 3/)).toBeInTheDocument();
    expect(dialog.getByText(/3 × 5/)).toBeInTheDocument();
  });

  it('el colaborador no ve el costo de contingencia en el formulario', async () => {
    mockApi(routes(pmUser, []));
    renderApp('/proyectos/p1/riesgos');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Añadir riesgo' }));
    expect(screen.getByLabelText('Costo de contingencia')).toBeInTheDocument();
    expect(screen.getByLabelText('Disparador')).toBeInTheDocument();
  });

  it('para el colaborador la matriz aparece sin el campo de costo', async () => {
    const { contingencyCostCents: _c, ...mine } = risk();
    mockApi(routes(collaborator, [mine]));
    renderApp('/proyectos/p1/riesgos');
    expect(await screen.findByRole('region', { name: 'Matriz de riesgos' })).toBeInTheDocument();
    expect(screen.queryByText('Costo de contingencia')).not.toBeInTheDocument();
  });
});

describe('umbral de riesgo alto en la tabla', () => {
  it('la tabla marca «Alto» con el puntaje del proyecto', async () => {
    mockApi({ ...routes(pmUser, [risk({ probability: 3, impact: 3, score: 9 })]), 'GET /api/projects/p1': { ...project, highRiskScore: 9 } });
    renderApp('/proyectos/p1/riesgos');
    expect(await screen.findByText('9 · Alto')).toBeInTheDocument();
  });
});
