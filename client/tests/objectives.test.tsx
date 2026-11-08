import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collaborator, mockApi, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null };
const objective = { id: 'o1', description: '<p><em>Lanzar</em> el sitio</p>', metric: 'Fecha', target: 'Marzo', status: 'PENDING' };

describe('objetivos', () => {
  it('el colaborador ve el detalle de un objetivo con formato', async () => {
    mockApi({
      ...signedInAs(collaborator),
      'GET /api/projects/p1': project,
      'GET /api/projects/p1/indicators': { progress: 0, overdueTasks: 0, blockedTasks: 0, upcomingMilestones: [] },
      'GET /api/projects/p1/objectives': [objective],
      'GET /api/projects/p1/milestones': [],
      'GET /api/projects/p1/members': [],
    });
    renderApp('/proyectos/p1/resumen');
    expect(await screen.findByText('Lanzar el sitio')).toHaveClass('line-clamp-2');
    expect(screen.queryByRole('button', { name: 'Editar Lanzar el sitio' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ver Lanzar el sitio' }));
    const dialog = screen.getByRole('dialog', { name: 'Detalle del objetivo' });
    expect(within(dialog).getByText('Lanzar').tagName).toBe('EM');
    expect(within(dialog).getByText('Fecha')).toBeInTheDocument();
    expect(within(dialog).getByText('Marzo')).toBeInTheDocument();
  });
});
