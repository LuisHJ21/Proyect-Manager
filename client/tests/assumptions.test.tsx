import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, observer, pmUser, renderApp, setRichText, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'PREDICTIVE', startDate: null, endDate: null };
const charter = {
  justification: 'J', scopeIncluded: 'S', scopeExcluded: '', boundaries: '', assumptions: 'El cliente aprueba en 48 horas', constraints: '', successCriteria: 'C', sponsor: '',
  status: 'APPROVED', approvedAt: '2026-11-01T10:00:00.000Z', approvedBy: { id: 'pm', name: 'Paula' }, version: 3,
};
const assumption = (over: object = {}) => ({
  id: 'a1', number: 1, description: '<p>Los planos llegan a tiempo</p>', owner: { id: 'c1', name: 'Carlos' }, validateBy: '2026-11-10', status: 'PENDING', version: 1, risk: null, incident: null, overdue: true, ...over,
});
const routes = (user: object, items: object[]) => ({
  ...signedInAs(user),
  'GET /api/projects/p1': project,
  'GET /api/projects/p1/members': [{ userId: 'c1', name: 'Carlos', email: '', role: 'COLLABORATOR', projectRole: '' }],
  'GET /api/projects/p1/charter': charter,
  'GET /api/projects/p1/assumptions': items,
});

describe('registro de supuestos', () => {
  it('el PM crea un supuesto', async () => {
    const api = mockApi({ ...routes(pmUser, []), 'POST /api/projects/p1/assumptions': assumption() });
    renderApp('/proyectos/p1/acta');
    const user = userEvent.setup();
    const region = await screen.findByRole('region', { name: 'Registro de supuestos' });
    expect(within(region).getByText('Supuestos del acta')).toBeInTheDocument();
    expect(within(region).getByText('El cliente aprueba en 48 horas')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Añadir supuesto' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Añadir supuesto' }));
    await setRichText('Descripción', '<p>Los planos llegan a tiempo</p>');
    await user.selectOptions(dialog.getByLabelText('Responsable'), 'c1');
    await user.type(dialog.getByLabelText('Validar antes de'), '2026-11-30');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/assumptions')?.body).toMatchObject({ description: '<p>Los planos llegan a tiempo</p>', ownerId: 'c1', validateBy: '2026-11-30' }),
    );
  });

  it('un supuesto falso se convierte en riesgo', async () => {
    const api = mockApi({ ...routes(pmUser, [assumption({ status: 'FALSE', overdue: false })]), 'POST /api/projects/p1/assumptions/a1/convert': assumption({ status: 'FALSE', risk: { id: 'r9' } }) });
    renderApp('/proyectos/p1/acta');
    const user = userEvent.setup();
    const region = await screen.findByRole('region', { name: 'Registro de supuestos' });
    await user.click(await within(region).findByRole('button', { name: 'Convertir SUP-1 en riesgo' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/assumptions/a1/convert')?.body).toEqual({ kind: 'risk' }));
  });

  it('el observador ve el registro sin botones y con el vencido marcado', async () => {
    mockApi(routes(observer, [assumption()]));
    renderApp('/proyectos/p1/acta');
    const region = await screen.findByRole('region', { name: 'Registro de supuestos' });
    expect(await within(region).findByText('Vencido')).toBeInTheDocument();
    expect(within(region).getByText('Los planos llegan a tiempo')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Añadir supuesto' })).not.toBeInTheDocument();
  });
});
