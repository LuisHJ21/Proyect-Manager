import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Task } from '../../api/types';
import { FormField, FormMessage } from '../FormField';
import { Button, inputClass } from '../ui';
import { refreshTaskData, tasksKey } from './taskQueries';

export function DependencyPicker({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const tasks = useQuery({ queryKey: tasksKey(task.projectId), queryFn: () => api<Task[]>(`/api/projects/${task.projectId}/tasks`) });
  const [predecessorId, setPredecessorId] = useState('');
  const [error, setError] = useState<string>();

  const titleOf = (id: string) => tasks.data?.find((t) => t.id === id)?.title ?? '…';
  const refresh = () => refreshTaskData(queryClient, task.projectId, task.id);

  const add = useMutation({
    mutationFn: () => api(`/api/tasks/${task.id}/dependencies`, { method: 'POST', body: { predecessorId } }),
    onSuccess: () => {
      setPredecessorId('');
      return refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${task.id}/dependencies/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });

  const candidates = tasks.data?.filter((t) => t.id !== task.id && !task.predecessorIds.includes(t.id)) ?? [];

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Predecesoras</h3>
      {task.predecessorIds.length === 0 ? (
        <p className="text-sm text-slate-500">Esta tarea no depende de otras.</p>
      ) : (
        <ul className="space-y-1">
          {task.predecessorIds.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
              {titleOf(id)}
              {canEdit && (
                <Button variant="ghost" aria-label={`Quitar dependencia de ${titleOf(id)}`} onClick={() => remove.mutate(id)}>
                  Quitar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <FormField label="Añadir predecesora">
              <select
                className={inputClass}
                value={predecessorId}
                onChange={(e) => {
                  setPredecessorId(e.target.value);
                  setError(undefined);
                }}
              >
                <option value="">Selecciona…</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <Button variant="secondary" disabled={!predecessorId || add.isPending} onClick={() => add.mutate()}>
            Añadir dependencia
          </Button>
        </div>
      )}
      <div className="mt-2">
        <FormMessage message={error} />
      </div>
    </div>
  );
}
