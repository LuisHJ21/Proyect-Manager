import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Task } from '../src/api/types';
import { KanbanBoard, useMoveTask } from '../src/components/tasks/KanbanBoard';
import { ToastProvider } from '../src/components/Toast';
import { apiError, mockApi } from './helpers';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  version: 1,
  projectId: 'p1',
  milestoneId: null,
  title: 'Construcción',
  description: '',
  status: 'TODO',
  priority: 'MEDIUM',
  startDate: null,
  dueDate: null,
  progress: 0,
  assignees: [{ id: 'c1', name: 'Carlos' }],
  predecessorIds: [],
  predecessors: [],
  successorCount: 0,
  commentCount: 0,
  stepsDone: 0,
  stepsTotal: 0,
  wbsCode: '1',
  parentId: null,
  position: 1,
  deliverableId: null,
  childCount: 0,
  isSummary: false,
  estimatedHours: null,
  waitingOn: [],
  warnings: [],
  ...over,
});

function setup(tasks: Task[], canMove: (t: Task) => boolean = () => true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['project', 'p1', 'tasks'], tasks);
  let move: ReturnType<typeof useMoveTask> | null = null;
  function Harness() {
    move = useMoveTask('p1');
    return <KanbanBoard tasks={client.getQueryData<Task[]>(['project', 'p1', 'tasks']) ?? []} canMove={canMove} onMove={move} />;
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <Harness />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, move: () => move! };
}

const statusIn = (client: QueryClient) => client.getQueryData<Task[]>(['project', 'p1', 'tasks'])![0]!.status;

describe('Kanban', () => {
  it('muestra una columna por estado con sus tarjetas', () => {
    setup([task()]);
    for (const name of ['Por hacer', 'En curso', 'Bloqueada', 'Hecha']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Construcción' })).toBeInTheDocument();
  });

  it('actualiza de inmediato y conserva el cambio si el servidor acepta', async () => {
    mockApi({ 'PATCH /api/tasks/t1/progress': task({ status: 'IN_PROGRESS' }), 'GET /api/projects/p1/tasks': [task({ status: 'IN_PROGRESS' })] });
    const { client, move } = setup([task()]);
    const pending = move()(task(), 'IN_PROGRESS');
    expect(statusIn(client)).toBe('IN_PROGRESS');
    await pending;
    await waitFor(() => expect(statusIn(client)).toBe('IN_PROGRESS'));
  });

  it('revierte la tarjeta ante 409 y muestra qué falta', async () => {
    mockApi({
      'PATCH /api/tasks/t1/progress': apiError(409, 'predecessors_pending', { message: 'Antes deben terminar: Diseño' }),
      'GET /api/projects/p1/tasks': [task()],
    });
    const { client, move } = setup([task()]);
    await move()(task(), 'IN_PROGRESS');
    expect(statusIn(client)).toBe('TODO');
    expect(await screen.findByText('Antes deben terminar: Diseño')).toBeInTheDocument();
  });

  it('no llama a la API si el estado no cambia', async () => {
    const api = mockApi({});
    const { move } = setup([task()]);
    await move()(task(), 'TODO');
    expect(api.calls).toHaveLength(0);
  });

  it('una tarjeta en espera muestra las predecesoras pendientes', () => {
    setup([task({ waitingOn: [{ id: 'd', title: 'Diseño' }] })]);
    expect(screen.getByText('En espera de: Diseño')).toBeInTheDocument();
  });

  it('solo se puede arrastrar lo permitido', () => {
    setup([task({ id: 'a', title: 'Mía' }), task({ id: 'b', title: 'Ajena' })], (t) => t.id === 'a');
    expect(screen.getByTestId('drag-a')).toBeInTheDocument();
    expect(screen.queryByTestId('drag-b')).not.toBeInTheDocument();
  });

  it('no muestra tareas padre y cada tarjeta dice su padre', () => {
    setup([
      task({ id: 'p', title: 'Diseño', wbsCode: '1', childCount: 1, isSummary: true }),
      task({ id: 'h', title: 'Pantallas', wbsCode: '1.1', parentId: 'p' }),
    ]);
    expect(screen.queryByRole('link', { name: 'Diseño' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pantallas' })).toBeInTheDocument();
    expect(screen.getByText('1 Diseño')).toBeInTheDocument();
  });
});
