import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, observer, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: null, endDate: null };
const charter = {
  justification: '<p>Justificación vigente</p>',
  scopeIncluded: '<p>Todo</p>',
  scopeExcluded: '',
  boundaries: '',
  assumptions: '',
  constraints: '',
  successCriteria: '<p>Lanzado</p>',
  sponsor: 'Gerencia',
  status: 'APPROVED',
  approvedAt: '2026-11-10T10:00:00.000Z',
  approvedBy: { id: 'pm', name: 'Paula' },
  version: 5,
};
const versions = [
  { number: 2, approvedAt: '2026-11-10T10:00:00.000Z', approvedBy: { id: 'pm', name: 'Paula' } },
  { number: 1, approvedAt: '2026-11-01T10:00:00.000Z', approvedBy: { id: 'pm', name: 'Paula' } },
];
const first = {
  ...versions[1],
  content: {
    ...charter,
    justification: '<p>Justificación original</p>',
    objectives: [{ description: 'Reducir tiempos', metric: 'Días', target: '10', status: 'PENDING' }],
    milestones: [{ name: 'Entrega', dueDate: '2026-12-01', status: 'PENDING' }],
  },
};
const routes = (user: object, list: object[] = versions, current: object = charter) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [],
  'GET /api/projects/p1/charter': current,
  'GET /api/projects/p1/charter/versions': list,
  'GET /api/projects/p1/charter/versions/1': first,
  'GET /api/projects/p1/assumptions': [],
});

afterEach(() => vi.restoreAllMocks());

describe('versiones del acta', () => {
  it('lista las versiones y abre una con su contenido congelado', async () => {
    mockApi(routes(observer));
    renderApp('/proyectos/p1/acta');
    const region = await screen.findByRole('region', { name: 'Versiones aprobadas' });
    expect(await within(region).findByText('Versión 2')).toBeInTheDocument();
    expect(within(region).getByText('Versión 1')).toBeInTheDocument();
    await userEvent.setup().click(within(region).getByRole('button', { name: 'Ver versión 1' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Versión 1 del acta' }));
    expect(await dialog.findByText('Justificación original')).toBeInTheDocument();
    expect(dialog.getByText('Reducir tiempos')).toBeInTheDocument();
    expect(dialog.getByText('Entrega')).toBeInTheDocument();
  });

  it('sin versiones no aparece la sección', async () => {
    mockApi(routes(pmUser, []));
    renderApp('/proyectos/p1/acta');
    await screen.findByRole('button', { name: 'Imprimir / Guardar PDF' });
    expect(screen.queryByRole('region', { name: 'Versiones aprobadas' })).not.toBeInTheDocument();
  });

  it('imprime el acta actual y una versión', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    mockApi(routes(pmUser));
    renderApp('/proyectos/p1/acta');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Imprimir / Guardar PDF' }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Versión 2 · aprobada el 10 nov 2026 por Paula')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Ver versión 1' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Versión 1 del acta' }));
    await dialog.findByText('Justificación original');
    await user.click(dialog.getByRole('button', { name: 'Imprimir / Guardar PDF' }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Versión 1 · aprobada el 1 nov 2026 por Paula')).toBeInTheDocument();
  });

  it('un acta en borrador se imprime como borrador', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    mockApi(routes(pmUser, [], { ...charter, status: 'DRAFT', approvedAt: null, approvedBy: null }));
    renderApp('/proyectos/p1/acta');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Imprimir / Guardar PDF' }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(screen.getByText('Borrador sin aprobar')).toBeInTheDocument();
  });
});
