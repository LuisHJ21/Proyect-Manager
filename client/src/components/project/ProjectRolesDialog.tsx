import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Member } from '../../api/types';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { FormField, FormMessage } from '../FormField';
import { Button, inputClass } from '../ui';

export type ProjectRole = { id: string; name: string };
export const rolesKey = (projectId: string) => ['project', projectId, 'roles'];

export function ProjectRolesDialog({ projectId, roles, onClose }: { projectId: string; roles: ProjectRole[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<ProjectRole | null>(null);
  const [deleting, setDeleting] = useState<ProjectRole | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/roles${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', body: { name } });
      setName('');
      setEditing(null);
      await refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/roles/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      await refresh();
    } catch (cause) { setDeleting(null); setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return (
    <>
    <Modal title="Gestionar roles del proyecto" onClose={() => { if (!deleting) onClose(); }}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">Crea los roles que podrás elegir al añadir o editar personas del equipo.</p>
        <ul className="max-h-64 divide-y divide-line overflow-y-auto">
          {roles.map((role) => (
            <li key={role.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1 text-sm text-ink [overflow-wrap:anywhere]">{role.name}</span>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" aria-label={`Editar rol ${role.name}`} onClick={() => { setEditing(role); setName(role.name); setError(''); }}>Editar</Button>
                <Button variant="ghost" aria-label={`Eliminar rol ${role.name}`} onClick={() => setDeleting(role)}>Eliminar</Button>
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={save} className="space-y-3">
          <FormField label={editing ? 'Renombrar rol' : 'Nuevo rol'}><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></FormField>
          <FormMessage message={error} />
          <div className="flex flex-wrap justify-end gap-2">
            {editing && <Button variant="secondary" onClick={() => { setEditing(null); setName(''); }}>Cancelar edición</Button>}
            <Button type="submit" disabled={busy || !name.trim()}>{editing ? 'Guardar rol' : 'Añadir rol'}</Button>
          </div>
        </form>
      </div>
    </Modal>
      {deleting && <ConfirmDialog title={`Eliminar rol ${deleting.name}`} danger confirmLabel="Eliminar rol" confirmDisabled={busy} onCancel={() => setDeleting(null)} onConfirm={() => void remove()}>
        Si alguien usa este rol, primero tendrás que cambiarle el rol.
      </ConfirmDialog>}
    </>
  );
}

export function MemberRoleDialog({ projectId, member, roles, onClose }: { projectId: string; member: Member; roles: ProjectRole[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState(member.projectRole);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/members/${member.userId}`, { method: 'PATCH', body: { projectRole: role } });
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <Modal title={`Rol de ${member.name}`} onClose={onClose}>
    <form onSubmit={save} className="space-y-4">
      <FormField label="Rol en el proyecto"><select className={inputClass} value={role} onChange={(event) => setRole(event.target.value)}>
        <option value="">Sin rol</option>
        {role && !roles.some((item) => item.name === role) && <option value={role}>{role}</option>}
        {roles.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
      </select></FormField>
      <FormMessage message={error} />
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>Guardar</Button></div>
    </form>
  </Modal>;
}
