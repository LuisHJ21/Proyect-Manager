import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const download = vi.fn();
vi.mock('../src/lib/csv', async (original) => ({ ...(await original<typeof import('../src/lib/csv')>()), downloadCsv: (name: string, csv: string) => download(name, csv) }));

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: null, endDate: null, currency: 'USD' };
const risk = {
  id: 'r1', version: 1, description: '<p>Lluvias</p>', type: 'THREAT', probability: 4, impact: 5, score: 20, response: 'MITIGATE', responsePlan: '', ownerId: 'c1', status: 'OPEN',
  trigger: '', nextReviewDate: null, reviewOverdue: false, residualProbability: null, residualImpact: null, residualScore: null, assessments: [],
};
const routes = (user: object, risks: object[]) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '' }],
  'GET /api/projects/p1/risks': risks,
});

describe('exportar a CSV', () => {
  it('el colaborador exporta sus riesgos sin la columna de costo de contingencia', async () => {
    download.mockClear();
    mockApi(routes(collaborator, [risk]));
    renderApp('/proyectos/p1/riesgos');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    const [name, csv] = download.mock.calls[0]!;
    expect(name).toMatch(/^portal-riesgos-/);
    expect(csv).toContain('Lluvias');
    expect(csv).not.toContain('Costo de contingencia');
  });

  it('el PM exporta con la columna de costo de contingencia', async () => {
    download.mockClear();
    mockApi(routes(pmUser, [{ ...risk, contingencyCostCents: 50000, incidents: [] }]));
    renderApp('/proyectos/p1/riesgos');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    expect(download.mock.calls[0]![1]).toContain('Costo de contingencia');
    expect(download.mock.calls[0]![1]).toContain('500,00');
  });
});
