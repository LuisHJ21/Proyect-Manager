import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, pmUser, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'PLANNING', approach: 'AGILE', startDate: null, endDate: null };
const draft = {
  justification: '',
  scopeIncluded: '',
  scopeExcluded: '',
  boundaries: '',
  assumptions: '',
  constraints: '',
  successCriteria: '',
  sponsor: '',
  status: 'DRAFT',
  approvedAt: null,
  approvedBy: null,
};
const approved = {
  ...draft,
  justification: 'Porque sí',
  scopeIncluded: 'Todo',
  successCriteria: 'Lanzado',
  status: 'APPROVED',
  approvedAt: '2026-11-01T10:00:00.000Z',
  approvedBy: { id: 'pm', name: 'Paula' },
};
const routes = { 'GET /api/projects/p1': project };

describe('acta', () => {
  it('muestra los errores de aprobación por campo sin perder lo escrito', async () => {
    mockApi({
      ...signedInAs(pmUser),
      ...routes,
      'GET /api/projects/p1/charter': draft,
      'PUT /api/projects/p1/charter': draft,
      'POST /api/projects/p1/charter/approve': apiError(400, 'charter_incomplete', {
        message: 'Completa los campos',
        fields: { scopeIncluded: 'Este campo es obligatorio para aprobar el acta' },
      }),
    });
    renderApp('/proyectos/p1/acta');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Justificación'), 'Mi justificación');
    await user.click(screen.getByRole('button', { name: 'Aprobar acta' }));
    expect(await screen.findByText('Este campo es obligatorio para aprobar el acta')).toBeInTheDocument();
    expect(screen.getByLabelText('Justificación')).toHaveValue('Mi justificación');
  });

  it('aprobar guarda antes los cambios pendientes', async () => {
    const api = mockApi({
      ...signedInAs(pmUser),
      ...routes,
      'GET /api/projects/p1/charter': draft,
      'PUT /api/projects/p1/charter': draft,
      'POST /api/projects/p1/charter/approve': approved,
    });
    renderApp('/proyectos/p1/acta');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Justificación'), 'Texto');
    await user.click(screen.getByRole('button', { name: 'Aprobar acta' }));
    await waitFor(() => expect(api.calls.some((c) => c.key.endsWith('/approve'))).toBe(true));
    const order = api.calls.map((c) => c.key);
    expect(order.indexOf('PUT /api/projects/p1/charter')).toBeLessThan(order.indexOf('POST /api/projects/p1/charter/approve'));
  });

  it('editar un acta aprobada advierte que volverá a Borrador', async () => {
    mockApi({ ...signedInAs(pmUser), ...routes, 'GET /api/projects/p1/charter': approved });
    renderApp('/proyectos/p1/acta');
    const user = userEvent.setup();
    expect(await screen.findByText(/Aprobada por Paula/)).toBeInTheDocument();
    expect(screen.queryByText(/volverá a Borrador/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Patrocinador'), 'X');
    expect(screen.getByText(/volverá a Borrador/)).toBeInTheDocument();
  });

  it('el colaborador ve el acta sin controles de edición', async () => {
    mockApi({ ...signedInAs(collaborator), ...routes, 'GET /api/projects/p1/charter': approved });
    renderApp('/proyectos/p1/acta');
    expect(await screen.findByText('Porque sí')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar acta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
