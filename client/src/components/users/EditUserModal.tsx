import { LABELS, ROLE, type Role } from '@pm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { UserOverview } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { Button, inputClass } from '../ui';

const WORK_NOUNS = { tasks: ['tarea', 'tareas'], steps: ['paso', 'pasos'], risks: ['riesgo', 'riesgos'], incidents: ['incidente', 'incidentes'] } as const;

/** "2 tareas · 1 riesgo": solo el trabajo abierto que hay, en singular o plural. */
export function openWorkSummary(details: Partial<Record<keyof typeof WORK_NOUNS, number>>): string {
  return (Object.keys(WORK_NOUNS) as (keyof typeof WORK_NOUNS)[])
    .filter((key) => (details[key] ?? 0) > 0)
    .map((key) => `${details[key]} ${WORK_NOUNS[key][details[key] === 1 ? 0 : 1]}`)
    .join(' · ');
}

export function EditUserModal({ target, onClose }: { target: UserOverview; onClose: () => void }) {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(target.name);
  const [role, setRole] = useState<Role>(target.role);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [openWork, setOpenWork] = useState('');

  const isSelf = target.id === me?.id;
  const losesOwnAccess = isSelf && target.role === 'PM' && role !== 'PM';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (losesOwnAccess) setConfirming(true);
    else void save();
  };

  const save = async () => {
    setConfirming(false);
    setErrors(NO_ERRORS);
    setOpenWork('');
    setBusy(true);
    try {
      await api(`/api/users/${target.id}`, { method: 'PATCH', body: { name, role } });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (isSelf) await queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
      if (error instanceof ApiError && error.code === 'observer_has_work' && error.details) setOpenWork(openWorkSummary(error.details));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Editar a ${target.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        {openWork && <p className="text-sm text-ink-nav">{openWork}</p>}
        <FormField label="Nombre" error={errors.fields.name}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Rol" error={errors.fields.role}>
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE.map((value) => (
              <option key={value} value={value}>
                {LABELS.role[value]}
              </option>
            ))}
          </select>
        </FormField>
        {losesOwnAccess && (
          <p role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            Perderás el acceso al panel y a la gestión de usuarios y proyectos.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
        </div>
      </form>
      {confirming && (
        <ConfirmDialog title={`Cambiar el rol de ${target.name}`} danger onCancel={() => setConfirming(false)} onConfirm={() => void save()}>
          Perderás el acceso al panel y a la gestión de usuarios y proyectos.
        </ConfirmDialog>
      )}
    </Modal>
  );
}
