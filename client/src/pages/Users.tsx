import { LABELS, ROLE, type Role } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage, isBlockingError } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog, Modal } from '../components/ConfirmDialog';
import { ErrorState, Loading } from '../components/ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../components/FormField';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, inputClass, PageHeader } from '../components/ui';

function NewUserModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('COLLABORATOR');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const create = useMutation({
    mutationFn: () => api('/api/users', { method: 'POST', body: { name, email, role, temporaryPassword } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuario creado. Comparte la contraseña temporal con esta persona.');
      onClose();
    },
    onError: (error) => applyFieldErrors(error, setErrors),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    create.mutate();
  };

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Nombre" error={errors.fields.name}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Correo" error={errors.fields.email}>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Rol" error={errors.fields.role}>
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE.map((r) => (
              <option key={r} value={r}>
                {LABELS.role[r]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Contraseña temporal" error={errors.fields.temporaryPassword} hint="Al menos 10 caracteres. La persona deberá cambiarla al entrar.">
          <input className={inputClass} value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} autoComplete="off" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending}>
            Crear usuario
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ target, onClose }: { target: User; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const reset = useMutation({
    mutationFn: () => api(`/api/users/${target.id}/reset-password`, { method: 'POST', body: { temporaryPassword } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Contraseña restablecida para ${target.name}.`);
      onClose();
    },
    onError: (error) => applyFieldErrors(error, setErrors),
  });

  return (
    <Modal title={`Restablecer contraseña de ${target.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setErrors(NO_ERRORS);
          reset.mutate();
        }}
      >
        <FormMessage message={errors.message} />
        <FormField label="Contraseña temporal" error={errors.fields.temporaryPassword} hint="Al menos 10 caracteres. Se cerrarán sus sesiones abiertas.">
          <input className={inputClass} value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} autoComplete="off" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={reset.isPending}>
            Restablecer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/api/users') });
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [toggling, setToggling] = useState<User | null>(null);

  const setActive = useMutation({
    mutationFn: (target: User) => api(`/api/users/${target.id}`, { method: 'PATCH', body: { active: !target.active } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setToggling(null),
  });

  if (users.isPending) return <Loading />;
  if (isBlockingError(users)) return <ErrorState message={errorMessage(users.error)} onRetry={() => users.refetch()} />;

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Las cuentas se desactivan en lugar de borrarse, para conservar su historial."
        actions={<Button onClick={() => setCreating(true)}>Nuevo usuario</Button>}
      />
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500 uppercase">
            <tr>
              <th className="py-2 pr-4 font-medium">Nombre</th>
              <th className="py-2 pr-4 font-medium">Correo</th>
              <th className="py-2 pr-4 font-medium">Rol</th>
              <th className="py-2 pr-4 font-medium">Estado</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.data?.map((target) => (
              <tr key={target.id}>
                <td className="py-2 pr-4 font-medium text-slate-900">{target.name}</td>
                <td className="py-2 pr-4 text-slate-600">{target.email}</td>
                <td className="py-2 pr-4">{LABELS.role[target.role]}</td>
                <td className="py-2 pr-4">
                  <Badge tone={target.active ? 'success' : 'neutral'}>{target.active ? 'Activo' : 'Inactivo'}</Badge>
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {target.id !== me?.id && (
                    <Button variant="ghost" aria-label={`Restablecer contraseña de ${target.name}`} onClick={() => setResetting(target)}>
                      Restablecer contraseña
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    aria-label={`${target.active ? 'Desactivar' : 'Activar'} a ${target.name}`}
                    onClick={() => setToggling(target)}
                  >
                    {target.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {creating && <NewUserModal onClose={() => setCreating(false)} />}
      {resetting && <ResetPasswordModal target={resetting} onClose={() => setResetting(null)} />}
      {toggling && (
        <ConfirmDialog
          title={`${toggling.active ? 'Desactivar' : 'Activar'} a ${toggling.name}`}
          danger={toggling.active}
          onCancel={() => setToggling(null)}
          onConfirm={() => setActive.mutate(toggling)}
        >
          {toggling.active ? 'Esta persona no podrá entrar y se cerrarán sus sesiones abiertas.' : 'Esta persona podrá volver a entrar.'}
        </ConfirmDialog>
      )}
    </>
  );
}
