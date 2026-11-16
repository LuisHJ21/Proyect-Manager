import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { RescheduleChange, Schedule, Task } from '../../api/types';
import { shortDate } from '../../lib/display';
import { Modal } from '../ConfirmDialog';
import { FormMessage } from '../FormField';
import { Button } from '../ui';
import { refreshTaskData, tasksKey } from './taskQueries';

export const scheduleKey = (projectId: string) => ['project', projectId, 'schedule'];
export const rescheduleKey = (taskId: string) => ['task', taskId, 'reschedule'];

/** Holgura y ruta crítica del proyecto. */
export function useSchedule(projectId: string, enabled = true) {
  return useQuery({ queryKey: scheduleKey(projectId), queryFn: () => api<Schedule>(`/api/projects/${projectId}/schedule`), enabled });
}

/** «SS +2 d»; sin desfase, solo el tipo. */
export const dependencyLabel = (type: string, lagDays: number) => (lagDays === 0 ? type : `${type} ${lagDays > 0 ? '+' : '−'}${Math.abs(lagDays)} d`);

/**
 * Para el PM: si hay sucesoras que ya no respetan sus dependencias, avisa y ofrece la propuesta de
 * nuevas fechas. Nada se guarda hasta pulsar «Aplicar».
 */
export function RescheduleNotice({ projectId, taskId }: { projectId: string; taskId: string }) {
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: rescheduleKey(taskId),
    queryFn: () => api<{ changes: RescheduleChange[] }>(`/api/tasks/${taskId}/reschedule`),
  });
  const tasks = useQuery({ queryKey: tasksKey(projectId), queryFn: () => api<Task[]>(`/api/projects/${projectId}/tasks`) });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const apply = useMutation({
    mutationFn: () => api(`/api/tasks/${taskId}/reschedule`, { method: 'POST', body: { apply: true } }),
    onSuccess: async () => {
      await Promise.all([
        refreshTaskData(queryClient, projectId, taskId),
        queryClient.invalidateQueries({ queryKey: scheduleKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: rescheduleKey(taskId) }),
      ]);
      setOpen(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const changes = preview.data?.changes ?? [];
  if (changes.length === 0) return null;
  const titleOf = (id: string) => tasks.data?.find((t) => t.id === id)?.title ?? '…';

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
      <span>Hay sucesoras que ya no respetan sus dependencias</span>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Reprogramar sucesoras
      </Button>
      {open && (
        <Modal title="Reprogramar sucesoras" onClose={() => setOpen(false)} wide>
          <div className="space-y-4">
            <FormMessage message={error} />
            <p className="text-sm text-ink-nav">Cada tarea se adelanta lo mínimo para cumplir sus dependencias y conserva su duración.</p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-soft uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Tarea</th>
                  <th className="py-2 pr-4 font-medium">Fechas actuales</th>
                  <th className="py-2 font-medium">Fechas nuevas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {changes.map((change) => (
                  <tr key={change.id}>
                    <td className="py-2 pr-4 text-ink">{titleOf(change.id)}</td>
                    <td className="py-2 pr-4 text-ink-nav">{`${shortDate(change.from.startDate)} – ${shortDate(change.from.dueDate)}`}</td>
                    <td className="py-2 font-medium text-ink">{`${shortDate(change.to.startDate)} – ${shortDate(change.to.dueDate)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={apply.isPending} onClick={() => apply.mutate()}>
                Aplicar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
