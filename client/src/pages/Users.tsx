import { LABELS, ROLE, type Role } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { api, errorMessage, isBlockingError } from '../api/client';
import type { UserOverview } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog, Modal } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../components/FormField';
import { useToast } from '../components/Toast';
import { Avatar, Badge, Button, EmptyState, inputClass, PageHeader, Skeleton } from '../components/ui';
import { EditUserModal } from '../components/users/EditUserModal';
import { UserDetailPanel } from '../components/users/UserDetailPanel';
import { normalizeText } from '../lib/display';

const INITIAL_FILTERS = { search: '', role: 'ALL', state: 'ACTIVE' };
const MENU_HEIGHT = 96;

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

function ResetPasswordModal({ target, onClose }: { target: UserOverview; onClose: () => void }) {
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

function ActionsMenu({ target, onReset, onToggle }: { target: UserOverview; onReset: () => void; onToggle: () => void }) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const open = position !== null;
  const setOpen = (value: boolean) => {
    if (!value) {
      setPosition(null);
      return;
    }
    // Posición fija: la tabla recorta lo que se sale de su caja.
    const rect = container.current!.getBoundingClientRect();
    const flip = rect.bottom + MENU_HEIGHT > window.innerHeight;
    setPosition({
      right: window.innerWidth - rect.right,
      ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  };
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const itemClass = 'block w-full cursor-pointer px-3 py-2.5 text-left text-sm text-ink hover:bg-raised';
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={container} className="relative inline-block">
      <Button variant="secondary" className="!px-2.5" aria-label={`Más acciones de ${target.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </Button>
      {open && (
        <div role="menu" style={position} className="fixed z-30 w-56 overflow-hidden rounded-lg border border-control bg-surface shadow-xl">
          <button type="button" role="menuitem" className={itemClass} onClick={choose(onReset)}>
            Restablecer contraseña
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={choose(onToggle)}>
            {target.active ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      )}
    </div>
  );
}

function projectsLabel(target: UserOverview): ReactNode {
  if (target.projects.length === 0) {
    return <span className="text-ink-soft">{target.role === 'PM' ? 'Ve todos los proyectos' : 'Sin proyectos'}</span>;
  }
  const names = target.projects.slice(0, 2).map((p) => p.name).join(', ');
  const extra = target.projects.length - 2;
  return extra > 0 ? `${names} y ${extra} más` : names;
}

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<UserOverview[]>('/api/users') });
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserOverview | null>(null);
  const [resetting, setResetting] = useState<UserOverview | null>(null);
  const [toggling, setToggling] = useState<UserOverview | null>(null);
  const [detail, setDetail] = useState<UserOverview | null>(null);

  const setActive = useMutation({
    mutationFn: (target: UserOverview) => api(`/api/users/${target.id}`, { method: 'PATCH', body: { active: !target.active } }),
    onSuccess: async (_data, target) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      if (target.id === me?.id) await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setToggling(null),
  });

  const all = users.data ?? [];
  const search = normalizeText(filters.search.trim());
  const visible = all.filter((target) => {
    if (search && !normalizeText(`${target.name} ${target.email}`).includes(search)) return false;
    if (filters.role !== 'ALL' && target.role !== filters.role) return false;
    if (filters.state === 'ACTIVE' && !target.active) return false;
    if (filters.state === 'INACTIVE' && target.active) return false;
    return true;
  });

  let body: ReactNode;
  if (users.isPending) {
    body = <Skeleton className="h-64" />;
  } else if (isBlockingError(users)) {
    body = <ErrorState message={errorMessage(users.error)} onRetry={() => users.refetch()} />;
  } else if (visible.length === 0) {
    body = (
      <EmptyState>
        <p className="mb-3">Ningún usuario coincide con los filtros.</p>
        <Button variant="secondary" onClick={() => setFilters(INITIAL_FILTERS)}>
          Limpiar filtros
        </Button>
      </EmptyState>
    );
  } else {
    body = (
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface text-xs font-semibold tracking-wide text-ink-soft uppercase">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">Persona</th>
              <th scope="col" className="px-3 py-3 font-semibold">Rol</th>
              <th scope="col" className="px-3 py-3 font-semibold">Estado</th>
              <th scope="col" className="px-3 py-3 font-semibold">Proyectos</th>
              <th scope="col" className="px-3 py-3 font-semibold">Tareas</th>
              <th scope="col" className="px-5 py-3 font-semibold">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((target) => (
              <tr key={target.id} className="border-t border-line transition-colors duration-150 hover:bg-raised">
                <td className="px-5 py-2.5">
                  <button type="button" aria-label={`Ver detalle de ${target.name}`} onClick={() => setDetail(target)} className="flex cursor-pointer items-center gap-2.5 text-left">
                    <Avatar name={target.name} size="lg" />
                    <span>
                      <span className="block font-semibold text-ink hover:underline">{target.name}</span>
                      <span className="block text-xs text-ink-soft">{target.email}</span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-ink-nav">{LABELS.role[target.role]}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={target.active ? 'success' : 'neutral'}>{target.active ? 'Activo' : 'Inactivo'}</Badge>
                </td>
                <td className="px-3 py-2.5 text-ink-nav">{projectsLabel(target)}</td>
                <td className="px-3 py-2.5 text-[13px] whitespace-nowrap">
                  {target.role === 'PM' ? (
                    <span className="text-ink-soft">No aplica</span>
                  ) : (
                    <>
                      <span className="block text-ink-nav">
                        {target.openTasks} {target.openTasks === 1 ? 'abierta' : 'abiertas'}
                      </span>
                      {target.overdueTasks > 0 && (
                        <span className="block font-semibold text-risk-fg">
                          {target.overdueTasks} {target.overdueTasks === 1 ? 'vencida' : 'vencidas'}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right whitespace-nowrap">
                  <span className="inline-flex gap-1.5">
                    <Button variant="secondary" aria-label={`Editar a ${target.name}`} onClick={() => setEditing(target)}>
                      Editar
                    </Button>
                    <ActionsMenu target={target} onReset={() => setResetting(target)} onToggle={() => setToggling(target)} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const togglingSelf = toggling?.id === me?.id;

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Las cuentas se desactivan en lugar de borrarse, para conservar su historial."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" />
            Nuevo usuario
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar usuarios"
            placeholder="Buscar por nombre o correo"
            className={`${inputClass} pl-9`}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <select aria-label="Rol" className={`${inputClass} !w-auto`} value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
          <option value="ALL">Rol: todos</option>
          {ROLE.map((r) => (
            <option key={r} value={r}>
              {LABELS.role[r]}
            </option>
          ))}
        </select>
        <select aria-label="Estado" className={`${inputClass} !w-auto`} value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}>
          <option value="ACTIVE">Activos</option>
          <option value="INACTIVE">Inactivos</option>
          <option value="ALL">Todos</option>
        </select>
        {!users.isPending && all.length > 0 && (
          <span className="ml-auto text-[13px] text-ink-soft">
            {visible.length} de {all.length} usuarios
          </span>
        )}
      </div>
      {body}
      {creating && <NewUserModal onClose={() => setCreating(false)} />}
      {editing && <EditUserModal target={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal target={resetting} onClose={() => setResetting(null)} />}
      {detail && <UserDetailPanel target={detail} onClose={() => setDetail(null)} />}
      {toggling && (
        <ConfirmDialog
          title={`${toggling.active ? 'Desactivar' : 'Activar'} a ${toggling.name}`}
          danger={toggling.active}
          onCancel={() => setToggling(null)}
          onConfirm={() => setActive.mutate(toggling)}
        >
          {togglingSelf && toggling.active
            ? 'Esto cerrará tu sesión y no podrás volver a entrar hasta que otro Project Manager te active.'
            : toggling.active
              ? 'Esta persona no podrá entrar y se cerrarán sus sesiones abiertas.'
              : 'Esta persona podrá volver a entrar.'}
        </ConfirmDialog>
      )}
    </>
  );
}
