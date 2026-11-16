import { formatMoney, localToday } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { TimeEntry } from '../../api/types';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { shortDate } from '../../lib/display';
import { Button, inputClass } from '../ui';
import { refreshTaskData } from './taskQueries';

export const timeEntriesKey = (taskId: string) => ['task', taskId, 'time-entries'];

/** «1,5 h»: horas con coma decimal y hasta dos decimales. */
export const formatHours = (hours: number) => `${hours.toLocaleString('es', { maximumFractionDigits: 2 })} h`;
const parseHours = (text: string) => (text.trim() === '' ? NaN : Number(text.replace(',', '.')));

/** Formulario para registrar horas en una tarea; lo usan el detalle y Mis tareas. */
export function LogHoursForm({ projectId, taskId, onDone }: { projectId: string; taskId: string; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(localToday(new Date()));
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = parseHours(hours);
    if (Number.isNaN(value)) {
      setErrors({ fields: { hours: 'Escribe las horas, por ejemplo 1,5' } });
      return;
    }
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await api(`/api/tasks/${taskId}/time-entries`, { method: 'POST', body: { date, hours: value, note } });
      setHours('');
      setNote('');
      await Promise.all([queryClient.invalidateQueries({ queryKey: timeEntriesKey(taskId) }), refreshTaskData(queryClient, projectId, taskId)]);
      onDone?.();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[9rem_6rem_1fr_auto] sm:items-end" noValidate>
      <div className="sm:col-span-4">
        <FormMessage message={errors.message} />
      </div>
      <FormField label="Fecha" error={errors.fields.date}>
        <input className={inputClass} type="date" max={localToday(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      <FormField label="Horas" error={errors.fields.hours}>
        <input className={inputClass} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
      </FormField>
      <FormField label="Nota" error={errors.fields.note}>
        <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
      <Button type="submit" disabled={busy}>
        Registrar horas
      </Button>
    </form>
  );
}

type Props = {
  projectId: string;
  taskId: string;
  estimatedHours: number | null;
  currency: string;
  canLog: boolean;
  isPm: boolean;
  currentUserId?: string;
};

/** Horas registradas en la tarea: lista, total frente a lo estimado y, para quien puede, el formulario. */
export function TimeEntriesSection({ projectId, taskId, estimatedHours, currency, canLog, isPm, currentUserId }: Props) {
  const queryClient = useQueryClient();
  const entries = useQuery({ queryKey: timeEntriesKey(taskId), queryFn: () => api<TimeEntry[]>(`/api/tasks/${taskId}/time-entries`) });
  const [error, setError] = useState<string>();
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${taskId}/time-entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: timeEntriesKey(taskId) }), refreshTaskData(queryClient, projectId, taskId)]),
    onError: (e) => setError(errorMessage(e)),
  });
  const total = entries.data?.reduce((sum, e) => sum + e.hours, 0) ?? 0;

  return (
    <section aria-label="Horas" className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Horas</h2>
        <span className="text-sm text-ink-soft">
          {estimatedHours != null ? `${formatHours(total)} de ${formatHours(estimatedHours)} estimadas` : `${formatHours(total)} registradas`}
        </span>
      </div>
      <FormMessage message={error} />
      {entries.data && entries.data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink-soft uppercase">
              <tr>
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Persona</th>
                <th className="py-2 pr-3 font-medium">Horas</th>
                <th className="py-2 pr-3 font-medium">Nota</th>
                {isPm && <th className="py-2 pr-3 font-medium">Costo</th>}
                <th className="py-2 font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.data.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 pr-3 whitespace-nowrap text-ink-nav">{shortDate(entry.date)}</td>
                  <td className="py-2 pr-3 text-ink">{entry.user.name}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-ink-nav">{formatHours(entry.hours)}</td>
                  <td className="py-2 pr-3 text-ink-nav [overflow-wrap:anywhere]">{entry.note}</td>
                  {isPm && <td className="py-2 pr-3 whitespace-nowrap text-ink-nav">{formatMoney(entry.costCents ?? 0, currency)}</td>}
                  <td className="py-1 text-right">
                    {canLog && (isPm || entry.user.id === currentUserId) && (
                      <Button variant="ghost" aria-label={`Borrar horas del ${shortDate(entry.date)}`} onClick={() => remove.mutate(entry.id)}>
                        Borrar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !entries.isPending && <p className="text-sm text-ink-soft">Aún no hay horas registradas.</p>
      )}
      {canLog && (
        <div className="mt-4">
          <LogHoursForm projectId={projectId} taskId={taskId} />
        </div>
      )}
    </section>
  );
}
