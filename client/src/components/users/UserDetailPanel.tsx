import { LABELS } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { UserOverview, UserTask } from '../../api/types';
import { shortDate } from '../../lib/display';
import { Modal } from '../ConfirmDialog';
import { ErrorState, Loading } from '../ErrorState';
import { Button } from '../ui';

export function UserDetailPanel({ target, onClose }: { target: UserOverview; onClose: () => void }) {
  const tasks = useQuery({ queryKey: ['user-tasks', target.id], queryFn: () => api<UserTask[]>(`/api/users/${target.id}/tasks`) });

  return (
    <Modal title={target.name} onClose={onClose} wide>
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        {target.email} · {LABELS.role[target.role]}
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Proyectos</h3>
          {target.projects.length === 0 ? (
            <p className="text-sm text-ink-soft">{target.role === 'PM' ? 'Ve todos los proyectos' : 'Sin proyectos'}</p>
          ) : (
            <ul className="divide-y divide-line">
              {target.projects.map((project) => (
                <li key={project.id} className="py-2 text-sm">
                  <Link to={`/proyectos/${project.id}/resumen`} className="font-medium text-link hover:underline">
                    {project.name}
                  </Link>
                  {project.projectRole && <span className="text-ink-soft"> · {project.projectRole}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Tareas abiertas</h3>
          {tasks.isPending ? (
            <Loading />
          ) : tasks.isError ? (
            <ErrorState message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />
          ) : tasks.data.length === 0 ? (
            <p className="text-sm text-ink-soft">Sin tareas abiertas</p>
          ) : (
            <ul className="divide-y divide-line">
              {tasks.data.map((task) => (
                <li key={task.id} className="py-2 text-sm">
                  <Link to={`/proyectos/${task.projectId}/tareas/${task.id}`} className="block hover:underline">
                    <span className="block font-medium text-link">{task.title}</span>
                    <span className="block text-xs text-ink-soft">
                      {task.projectName} · {task.dueDate ? `Vence ${shortDate(task.dueDate)}` : 'Sin fecha'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
