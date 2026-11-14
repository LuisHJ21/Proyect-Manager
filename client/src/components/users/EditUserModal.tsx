import { LABELS, ROLE, type Role } from '@pm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { UserOverview } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { Button, inputClass } from '../ui';

export function EditUserModal({ target, onClose }: { target: UserOverview; onClose: () => void }) {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(target.name);
  const [role, setRole] = useState<Role>(target.role);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
    setBusy(true);
    try {
      await api(`/api/users/${target.id}`, { method: 'PATCH', body: { name, role } });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (isSelf) await queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Editar a ${target.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
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
