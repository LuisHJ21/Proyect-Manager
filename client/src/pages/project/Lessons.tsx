import { LABELS, LESSON_CATEGORY, LESSON_TYPE } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Lesson } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState, Loading } from '../../components/ErrorState';
import { LessonCard } from '../../components/lessons/LessonCard';
import { LessonForm, lessonsKey } from '../../components/lessons/LessonForm';
import { useToast } from '../../components/Toast';
import { Button, Card, EmptyState, inputClass } from '../../components/ui';
import { useProject } from './ProjectLayout';

type Dialog = { kind: 'new' } | { kind: 'edit' | 'delete'; item: Lesson };

/** Lecciones aprendidas del proyecto. Todo el equipo las registra, también con el proyecto cerrado. */
export function LessonsPage() {
  const { project } = useProject();
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: lessonsKey(project.id), queryFn: () => api<Lesson[]>(`/api/projects/${project.id}/lessons`) });
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  const remove = useMutation({
    mutationFn: (item: Lesson) => api(`/api/projects/${project.id}/lessons/${item.id}`, { method: 'DELETE' }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: lessonsKey(project.id) }), queryClient.invalidateQueries({ queryKey: ['lessons'] })]),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: close,
  });
  const visible = list.data?.filter((l) => (!type || l.type === type) && (!category || l.category === category)) ?? [];

  return (
    <Card title="Lecciones aprendidas" actions={<Button variant="secondary" onClick={() => setDialog({ kind: 'new' })}>Añadir lección</Button>}>
      <div className="mb-4 flex flex-wrap gap-4">
        <label className="text-sm text-ink-nav">
          <span className="mb-1 block font-medium">Tipo</span>
          <select aria-label="Tipo" className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos</option>
            {LESSON_TYPE.map((t) => (
              <option key={t} value={t}>
                {LABELS.lessonType[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-nav">
          <span className="mb-1 block font-medium">Categoría</span>
          <select aria-label="Categoría" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {LESSON_CATEGORY.map((c) => (
              <option key={c} value={c}>
                {LABELS.lessonCategory[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState>Aún no hay lecciones aprendidas.</EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState>No hay lecciones con esos filtros.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((l) => (
            <LessonCard key={l.id} lesson={l} onEdit={() => setDialog({ kind: 'edit', item: l })} onDelete={() => setDialog({ kind: 'delete', item: l })} />
          ))}
        </div>
      )}
      {dialog?.kind === 'new' && <LessonForm projectId={project.id} onClose={close} />}
      {dialog?.kind === 'edit' && <LessonForm projectId={project.id} item={dialog.item} onClose={close} />}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog title="Eliminar lección" danger confirmLabel="Eliminar" onCancel={close} onConfirm={() => remove.mutate(dialog.item)}>
          Se eliminará esta lección aprendida de forma permanente.
        </ConfirmDialog>
      )}
    </Card>
  );
}
