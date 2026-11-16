import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Task } from '../../api/types';
import { FormField, FormMessage } from '../FormField';
import { Button, inputClass } from '../ui';
import { refreshTaskData, tasksKey } from './taskQueries';
import { DEPENDENCY_TYPE, LABELS, type DependencyType } from '@pm/shared';
import { Modal } from '../ConfirmDialog';
import { dependencyLabel } from './Reschedule';

function EditDependency({
  taskId,
  dependency,
  title,
  onClose,
  onSaved,
}: {
  taskId: string;
  dependency: { id: string; type: DependencyType; lagDays: number };
  title: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [type, setType] = useState(dependency.type);
  const [lag, setLag] = useState(String(dependency.lagDays));
  const [error, setError] = useState<string>();
  const save = useMutation({
    mutationFn: () => api(`/api/tasks/${taskId}/dependencies/${dependency.id}`, { method: 'PATCH', body: { type, lagDays: Number(lag) || 0 } }),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal title={`Dependencia con ${title}`} onClose={onClose}>
      <div className="space-y-4">
        <FormMessage message={error} />
        <FormField label="Tipo">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as DependencyType)}>
            {DEPENDENCY_TYPE.map((t) => (
              <option key={t} value={t}>
                {`${t} · ${LABELS.dependencyType[t]}`}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Desfase (días)" hint="Negativo para solaparse con la predecesora.">
          <input className={inputClass} inputMode="numeric" value={lag} onChange={(e) => setLag(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DependencyPicker({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const tasks = useQuery({ queryKey: tasksKey(task.projectId), queryFn: () => api<Task[]>(`/api/projects/${task.projectId}/tasks`) });
  const [predecessorId, setPredecessorId] = useState('');
  const [type, setType] = useState<DependencyType>('FS');
  const [lag, setLag] = useState('0');
  const [editing, setEditing] = useState<{ id: string; type: DependencyType; lagDays: number } | null>(null);
  const [error, setError] = useState<string>();

  const titleOf = (id: string) => tasks.data?.find((t) => t.id === id)?.title ?? '…';
  const refresh = () => refreshTaskData(queryClient, task.projectId, task.id);

  const add = useMutation({
    mutationFn: () => api(`/api/tasks/${task.id}/dependencies`, { method: 'POST', body: { predecessorId, type, lagDays: Number(lag) || 0 } }),
    onSuccess: () => {
      setPredecessorId('');
      setType('FS');
      setLag('0');
      return refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${task.id}/dependencies/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });

  // Una tarea con subtareas no tiene dependencias propias: solo se ofrecen hojas.
  const candidates = tasks.data?.filter((t) => t.id !== task.id && !t.isSummary && !task.predecessorIds.includes(t.id)) ?? [];

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">Predecesoras</h3>
      {task.predecessorIds.length === 0 ? (
        <p className="text-sm text-ink-soft">Esta tarea no depende de otras.</p>
      ) : (
        <ul className="space-y-1">
          {task.predecessorIds.map((id) => {
            const dep = task.predecessors.find((p) => p.id === id) ?? { id, type: 'FS' as DependencyType, lagDays: 0 };
            return (
              <li key={id} className="flex items-center justify-between gap-2 text-sm text-ink-nav">
                <span>
                  {titleOf(id)} <span className="font-mono text-xs text-ink-soft">{dependencyLabel(dep.type, dep.lagDays)}</span>
                </span>
                {canEdit && (
                  <span className="flex gap-1">
                    <Button variant="ghost" aria-label={`Editar dependencia con ${titleOf(id)}`} onClick={() => setEditing(dep)}>
                      Editar
                    </Button>
                    <Button variant="ghost" aria-label={`Quitar dependencia de ${titleOf(id)}`} onClick={() => remove.mutate(id)}>
                      Quitar
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
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
          <FormField label="Tipo de dependencia">
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as DependencyType)}>
              {DEPENDENCY_TYPE.map((t) => (
                <option key={t} value={t}>
                  {`${t} · ${LABELS.dependencyType[t]}`}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Desfase">
            <input className={`${inputClass} w-20`} inputMode="numeric" value={lag} onChange={(e) => setLag(e.target.value)} />
          </FormField>
          <Button variant="secondary" disabled={!predecessorId || add.isPending} onClick={() => add.mutate()}>
            Añadir dependencia
          </Button>
        </div>
      )}
      <div className="mt-2">
        <FormMessage message={error} />
      </div>
      {editing && (
        <EditDependency
          taskId={task.id}
          dependency={editing}
          title={titleOf(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            return refresh();
          }}
        />
      )}
    </div>
  );
}
