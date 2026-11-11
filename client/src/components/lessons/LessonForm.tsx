import { LABELS, LESSON_CATEGORY, LESSON_TYPE, type LessonCategory, type LessonType } from '@pm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { Lesson } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { Button, inputClass } from '../ui';

export const lessonsKey = (projectId: string) => ['project', projectId, 'lessons'];

/** Ventana para añadir o editar una lección aprendida. */
export function LessonForm({ projectId, item, onClose }: { projectId: string; item?: Lesson; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<LessonType>(item?.type ?? 'WORKED_WELL');
  const [category, setCategory] = useState<LessonCategory>(item?.category ?? 'SCOPE');
  const [situation, setSituation] = useState(item?.situation ?? '');
  const [recommendation, setRecommendation] = useState(item?.recommendation ?? '');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      const url = `/api/projects/${projectId}/lessons`;
      const body = { type, category, situation, recommendation };
      if (item) await api(`${url}/${item.id}`, { method: 'PATCH', body });
      else await api(url, { method: 'POST', body });
      await Promise.all([queryClient.invalidateQueries({ queryKey: lessonsKey(projectId) }), queryClient.invalidateQueries({ queryKey: ['lessons'] })]);
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? 'Editar lección' : 'Añadir lección'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <FormMessage message={errors.message} />
        </div>
        <FormField label="Tipo" error={errors.fields.type}>
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as LessonType)}>
            {LESSON_TYPE.map((t) => (
              <option key={t} value={t}>
                {LABELS.lessonType[t]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Categoría" error={errors.fields.category}>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as LessonCategory)}>
            {LESSON_CATEGORY.map((c) => (
              <option key={c} value={c}>
                {LABELS.lessonCategory[c]}
              </option>
            ))}
          </select>
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Situación" error={errors.fields.situation} hint="Qué pasó y en qué contexto.">
            <textarea className={inputClass} rows={3} value={situation} onChange={(e) => setSituation(e.target.value)} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Recomendación" error={errors.fields.recommendation} hint="Qué conviene repetir o evitar en próximos proyectos.">
            <textarea className={inputClass} rows={3} value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
