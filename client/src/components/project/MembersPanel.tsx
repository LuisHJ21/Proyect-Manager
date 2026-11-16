import { LABELS } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Member, User } from '../../api/types';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { INVALID_MONEY_MESSAGE, MoneyInput } from '../MoneyInput';
import { ErrorState, Loading } from '../ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { useToast } from '../Toast';
import { Button, Card, EmptyState, inputClass } from '../ui';

export const membersKey = (projectId: string) => ['project', projectId, 'members'];

function RemoveMemberDialog({ projectId, member, onClose }: { projectId: string; member: Member; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const base = `/api/projects/${projectId}/members/${member.userId}`;
  const impact = useQuery({
    queryKey: ['member-impact', projectId, member.userId],
    queryFn: () => api<{ tasks: number; risks: number; raciCells: number; incidents: number }>(`${base}/impact`),
  });
  const remove = useMutation({
    mutationFn: () => api(base, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <ConfirmDialog
      title={`Quitar a ${member.name}`}
      danger
      confirmLabel="Quitar del proyecto"
      confirmDisabled={impact.isPending || remove.isPending}
      onCancel={onClose}
      onConfirm={() => remove.mutate()}
    >
      {impact.data ? (
        <p>
          Dejará de estar asignado a {impact.data.tasks} tarea(s), de ser responsable de {impact.data.risks} riesgo(s) y de {impact.data.raciCells} celda(s) RACI, y será responsable de {impact.data.incidents} incidente(s) menos.
        </p>
      ) : (
        <p>Comprobando sus asignaciones…</p>
      )}
    </ConfirmDialog>
  );
}

/** Tarifa por hora (solo la ve el PM) y capacidad semanal del miembro en este proyecto. */
function RateDialog({ projectId, member, onClose }: { projectId: string; member: Member; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rate, setRate] = useState<number | null>(member.hourlyRateCents ?? 0);
  const [capacity, setCapacity] = useState(String(member.weeklyCapacityHours ?? 40));
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/projects/${projectId}/members/${member.userId}`, { method: 'PATCH', body: { hourlyRateCents: rate, weeklyCapacityHours: Number(capacity) } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: membersKey(projectId) });
      onClose();
    },
    onError: (error) => applyFieldErrors(error, setErrors),
  });
  return (
    <Modal title={`Tarifa y capacidad de ${member.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (rate === null) return setErrors({ fields: { hourlyRateCents: INVALID_MONEY_MESSAGE } });
          if (!/^\d+$/.test(capacity.trim())) return setErrors({ fields: { weeklyCapacityHours: 'Usa un número entero de horas' } });
          setErrors(NO_ERRORS);
          save.mutate();
        }}
      >
        <FormMessage message={errors.message} />
        <FormField label="Tarifa por hora" error={errors.fields.hourlyRateCents} hint="Solo la ves tú. Se usa para el costo de las horas que registre.">
          <MoneyInput value={rate} onChange={setRate} blankIsZero />
        </FormField>
        <FormField label="Capacidad semanal (h)" error={errors.fields.weeklyCapacityHours}>
          <input className={inputClass} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function MembersPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: membersKey(projectId), queryFn: () => api<Member[]>(`/api/projects/${projectId}/members`) });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/api/users'), enabled: canEdit });
  const [userId, setUserId] = useState('');
  const [projectRole, setProjectRole] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [rating, setRating] = useState<Member | null>(null);

  const add = useMutation({
    mutationFn: () => api(`/api/projects/${projectId}/members`, { method: 'POST', body: { userId, projectRole } }),
    onSuccess: () => {
      setUserId('');
      setProjectRole('');
      return queryClient.invalidateQueries({ queryKey: membersKey(projectId) });
    },
    onError: (error) => applyFieldErrors(error, setErrors),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    add.mutate();
  };

  const memberIds = new Set(members.data?.map((m) => m.userId));
  const candidates = users.data?.filter((u) => u.active && !memberIds.has(u.id)) ?? [];

  return (
    <Card title="Equipo">
      {members.isPending ? (
        <Loading />
      ) : members.isError ? (
        <ErrorState message={errorMessage(members.error)} onRetry={() => members.refetch()} />
      ) : members.data.length === 0 ? (
        <EmptyState>Aún no hay miembros en este proyecto.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {members.data.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-medium text-ink">{member.active === false ? `${member.name} (inactivo)` : member.name}</span>
                <span className="text-ink-soft"> · {member.projectRole || LABELS.role[member.role]}</span>
              </span>
              {canEdit && (
                <span className="flex items-center gap-1">
                  {member.hourlyRateCents !== undefined && (
                    <Button variant="ghost" aria-label={`Tarifa y capacidad de ${member.name}`} onClick={() => setRating(member)}>
                      Tarifa
                    </Button>
                  )}
                  <Button variant="ghost" aria-label={`Quitar a ${member.name}`} onClick={() => setRemoving(member)}>
                    Quitar
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={submit} className="mt-4 grid items-end gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto]" noValidate>
          <FormField label="Añadir persona" error={errors.fields.userId}>
            <select className={inputClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Selecciona…</option>
              {candidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Rol en el proyecto" error={errors.fields.projectRole}>
            <input className={inputClass} value={projectRole} onChange={(e) => setProjectRole(e.target.value)} />
          </FormField>
          <Button type="submit" variant="secondary" disabled={add.isPending}>
            Añadir al equipo
          </Button>
          <div className="sm:col-span-3">
            <FormMessage message={errors.message} />
          </div>
        </form>
      )}
      {rating && <RateDialog projectId={projectId} member={rating} onClose={() => setRating(null)} />}
      {removing && <RemoveMemberDialog projectId={projectId} member={removing} onClose={() => setRemoving(null)} />}
    </Card>
  );
}
