import { act, screen, waitFor } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, pmUser, renderApp, setRichText, signedInAs } from './helpers';

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
  version: 3,
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
    await screen.findByRole('textbox', { name: 'Justificación' });
    await setRichText('Justificación', '<p>Mi justificación</p>');
    await user.click(screen.getByRole('button', { name: 'Aprobar acta' }));
    expect(await screen.findByText('Este campo es obligatorio para aprobar el acta')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Justificación' })).toHaveTextContent('Mi justificación');
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
    await screen.findByRole('textbox', { name: 'Justificación' });
    await setRichText('Justificación', '<p>Texto</p>');
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

  it('el acta con formato se ve con formato en solo lectura', async () => {
    mockApi({
      ...signedInAs(collaborator),
      ...routes,
      'GET /api/projects/p1/charter': { ...approved, justification: '<p><strong>Porque sí</strong></p><ul><li>Uno</li></ul>' },
    });
    renderApp('/proyectos/p1/acta');
    expect((await screen.findByText('Porque sí')).tagName).toBe('STRONG');
    expect(screen.getByText('Uno').tagName).toBe('LI');
  });

  it('abrir un acta antigua no la marca como modificada', async () => {
    mockApi({ ...signedInAs(pmUser), ...routes, 'GET /api/projects/p1/charter': { ...approved, justification: ['Línea 1', 'Línea 2'].join('\n') } });
    renderApp('/proyectos/p1/acta');
    const textbox = await screen.findByRole('textbox', { name: 'Justificación' });
    expect(textbox.querySelectorAll('p')).toHaveLength(2);
    expect(screen.queryByText(/volverá a Borrador/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('tras guardar no quedan cambios pendientes aunque el servidor devuelva el HTML con otra forma', async () => {
    mockApi({
      ...signedInAs(pmUser),
      ...routes,
      'GET /api/projects/p1/charter': draft,
      'PUT /api/projects/p1/charter': { ...draft, justification: '<p>a<br />b</p>' },
    });
    renderApp('/proyectos/p1/acta');
    const user = userEvent.setup();
    await screen.findByRole('textbox', { name: 'Justificación' });
    await setRichText('Justificación', '<p>a<br>b</p>');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Justificación' })).toHaveTextContent('ab');
  });

  it('el PM edita el acta con barra de formato', async () => {
    mockApi({ ...signedInAs(pmUser), ...routes, 'GET /api/projects/p1/charter': draft });
    renderApp('/proyectos/p1/acta');
    expect(await screen.findByRole('toolbar', { name: 'Formato de Justificación' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Formato de Patrocinador' })).not.toBeInTheDocument();
  });

  describe('choque de ediciones', () => {
    const CONFLICT = 'Otra persona guardó cambios en el acta mientras editabas. Tu texto sigue aquí para que lo copies; luego carga la versión actual.';
    const conflict = apiError(409, 'edit_conflict', { message: 'Otra persona guardó cambios en este registro mientras editabas' });

    it('guardar y aprobar mandan la versión', async () => {
      const api = mockApi({
        ...signedInAs(pmUser),
        ...routes,
        'GET /api/projects/p1/charter': draft,
        'PUT /api/projects/p1/charter': { ...draft, justification: '<p>Uno</p>', version: 4 },
        'POST /api/projects/p1/charter/approve': { ...approved, version: 5 },
      });
      renderApp('/proyectos/p1/acta');
      const user = userEvent.setup();
      await screen.findByRole('textbox', { name: 'Justificación' });
      await setRichText('Justificación', '<p>Uno</p>');
      await user.click(screen.getByRole('button', { name: 'Aprobar acta' }));
      await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/charter/approve')?.body).toEqual({ version: 4 }));
      expect(api.calls.find((c) => c.key === 'PUT /api/projects/p1/charter')?.body).toMatchObject({ justification: '<p>Uno</p>', version: 3 });
    });

    it('ante un choque el borrador sigue visible y no se puede guardar', async () => {
      mockApi({ ...signedInAs(pmUser), ...routes, 'GET /api/projects/p1/charter': draft, 'PUT /api/projects/p1/charter': conflict });
      renderApp('/proyectos/p1/acta');
      const user = userEvent.setup();
      await screen.findByRole('textbox', { name: 'Justificación' });
      await setRichText('Justificación', '<p>Mi texto largo</p>');
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      expect(await screen.findByText(CONFLICT)).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Justificación' })).toHaveTextContent('Mi texto largo');
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Aprobar acta' })).toBeDisabled();
    });

    it('«Cargar la versión actual» reemplaza el borrador', async () => {
      let clashed = false;
      const api = mockApi({
        ...signedInAs(pmUser),
        ...routes,
        'GET /api/projects/p1/charter': () => (clashed ? { ...draft, justification: '<p>De Pedro</p>', version: 4 } : draft),
        'PUT /api/projects/p1/charter': () => ((clashed = true), conflict),
      });
      renderApp('/proyectos/p1/acta');
      const user = userEvent.setup();
      await screen.findByRole('textbox', { name: 'Justificación' });
      await setRichText('Justificación', '<p>Mi texto</p>');
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      await user.click(await screen.findByRole('button', { name: 'Cargar la versión actual' }));
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Justificación' })).toHaveTextContent('De Pedro'));
      expect(screen.queryByText(CONFLICT)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Aprobar acta' })).toBeEnabled();
      expect(api.calls.filter((c) => c.key === 'GET /api/projects/p1/charter').length).toBeGreaterThan(1);
    });

    const refocus = () =>
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });

    it('una recarga en segundo plano no cambia la versión del borrador', async () => {
      let newer = false;
      const api = mockApi({
        ...signedInAs(pmUser),
        ...routes,
        'GET /api/projects/p1/charter': () => (newer ? { ...draft, justification: '<p>De Pedro</p>', version: 4 } : draft),
        'PUT /api/projects/p1/charter': conflict,
      });
      renderApp('/proyectos/p1/acta');
      const user = userEvent.setup();
      await screen.findByRole('textbox', { name: 'Justificación' });
      await setRichText('Justificación', '<p>Mi texto</p>');
      newer = true;
      const gets = () => api.calls.filter((c) => c.key === 'GET /api/projects/p1/charter').length;
      const before = gets();
      await refocus();
      await waitFor(() => expect(gets()).toBeGreaterThan(before));
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() => expect(api.calls.find((c) => c.key === 'PUT /api/projects/p1/charter')?.body).toMatchObject({ version: 3 }));
      expect(await screen.findByText(CONFLICT)).toBeInTheDocument();
    });

    it('sin cambios propios, una recarga en segundo plano trae la versión nueva y aprobar no reescribe el texto', async () => {
      let newer = false;
      const api = mockApi({
        ...signedInAs(pmUser),
        ...routes,
        'GET /api/projects/p1/charter': () => (newer ? { ...draft, justification: '<p>De Pedro</p>', version: 4 } : draft),
        'POST /api/projects/p1/charter/approve': { ...approved, version: 5 },
      });
      renderApp('/proyectos/p1/acta');
      const user = userEvent.setup();
      await screen.findByRole('textbox', { name: 'Justificación' });
      newer = true;
      await refocus();
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Justificación' })).toHaveTextContent('De Pedro'));
      await user.click(screen.getByRole('button', { name: 'Aprobar acta' }));
      await waitFor(() => expect(api.calls.find((c) => c.key === 'POST /api/projects/p1/charter/approve')?.body).toEqual({ version: 4 }));
      expect(api.calls.some((c) => c.key === 'PUT /api/projects/p1/charter')).toBe(false);
    });
  });
});
