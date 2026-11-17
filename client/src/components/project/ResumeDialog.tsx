import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { Project, ResumePreview } from '../../api/types';
import { shortDate } from '../../lib/display';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { Button, inputClass } from '../ui';

const validDays = (text: string) => /^\d{1,3}$/.test(text) && Number(text) <= 365;
const range = (from: string | null, to: string | null) => `${from ? shortDate(from) : '—'} → ${to ? shortDate(to) : '—'}`;

/** Reanudación (etapa 8): días a correr, vista previa y nueva línea base opcional. */
export function ResumeDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<string | null>(null);
  const [proposed, setProposed] = useState<number | null>(null);
  const [withBaseline, setWithBaseline] = useState(true);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  // Sin días escritos (o con los propuestos) se pide la vista por defecto; si no, con el número escrito.
  const query = days === null || (proposed !== null && Number(days) === proposed) ? '' : `?days=${days}`;
  const preview = useQuery({
    queryKey: ['project', project.id, 'resume-preview', query],
    queryFn: () => api<ResumePreview>(`/api/projects/${project.id}/resume-preview${query}`),
    enabled: days === null || validDays(days),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (days === null && preview.data) {
      setProposed(preview.data.proposedDays);
      setDays(String(preview.data.proposedDays));
    }
  }, [days, preview.data]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/resume`, {
        method: 'POST',
        body: { days: Number(days ?? 0), createBaseline: Boolean(canBaseline && withBaseline) },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  const changes = preview.data?.changes;
  const blocker = preview.data?.baselineProblem ?? null;
  const canBaseline = Boolean(preview.data?.hasBaseline) && !blocker;
  const total = changes ? changes.tasks.length + changes.milestones.length + (changes.endDate ? 1 : 0) : 0;

  return (
    <Modal title="Reanudar proyecto" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField
          label="Días a correr"
          error={errors.fields.days ?? (days !== null && !validDays(days) ? 'Usa un número de días entre 0 y 365' : undefined)}
          hint={preview.data ? `Días en pausa: ${preview.data.proposedDays}` : undefined}
        >
          <input className={inputClass} inputMode="numeric" value={days ?? ''} onChange={(e) => setDays(e.target.value)} />
        </FormField>
        {changes && (
          <div role="region" aria-label="Vista previa" className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-line px-4 py-3 text-sm">
            {total === 0 ? (
              <p className="text-ink-soft">No se mueve ninguna fecha.</p>
            ) : (
              <>
                <p className="text-ink-soft">{`${changes.tasks.length} tareas y ${changes.milestones.length} hitos cambian de fecha.`}</p>
                {changes.tasks.length > 0 && (
                  <ul className="space-y-1">
                    {changes.tasks.map((t) => (
                      <li key={t.id} className="flex flex-wrap justify-between gap-2">
                        <span className="text-ink">{t.name}</span>
                        <span className="text-ink-nav">{`${range(t.from.startDate, t.from.dueDate)}  ⇒  ${range(t.to.startDate, t.to.dueDate)}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {changes.milestones.length > 0 && (
                  <ul className="space-y-1">
                    {changes.milestones.map((m) => (
                      <li key={m.id} className="flex flex-wrap justify-between gap-2">
                        <span className="text-ink">{m.name}</span>
                        <span className="text-ink-nav">{`${shortDate(m.from)} → ${shortDate(m.to)}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {changes.endDate && <p className="text-ink">{`Fin del proyecto: ${shortDate(changes.endDate.from)} → ${shortDate(changes.endDate.to)}`}</p>}
              </>
            )}
          </div>
        )}
        {preview.data?.hasBaseline && (
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={canBaseline && withBaseline} disabled={!canBaseline} onChange={(e) => setWithBaseline(e.target.checked)} className="h-4 w-4 accent-primary" />
              Crear una nueva línea base
            </label>
            {blocker && <p className="text-xs text-warn-fg">{`No se puede crear una nueva línea base: ${blocker}. Puedes reanudar sin ella y fijarla después en Desempeño.`}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || days === null || !validDays(days)}>
            Reanudar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
