import type { RaciPartyKind, RaciRole, RaciWarning } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { RaciMatrixData, RaciParty } from '../../api/types';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorState, Loading } from '../ErrorState';
import { useToast } from '../Toast';
import { Badge, Button, Card, EmptyState } from '../ui';
import { ActivityForm } from './ActivityForm';

export const raciKey = (projectId: string) => ['project', projectId, 'raci'];

type Activity = RaciMatrixData['activities'][number];
type Column = RaciParty & { kind: RaciPartyKind };
type CellValue = RaciRole | null;

const WARNING_LABELS: Record<RaciWarning, string> = { missing_a: 'Falta A', multiple_a: 'Más de una A', missing_r: 'Falta R' };
const ROLE_OPTIONS: { value: RaciRole; label: string }[] = [
  { value: 'R', label: 'R · Hace' },
  { value: 'A', label: 'A · Aprueba' },
  { value: 'C', label: 'C · Consultado' },
  { value: 'I', label: 'I · Informado' },
];
const ROLE_CLASS: Record<RaciRole, string> = {
  R: 'bg-ok-bg text-ok-fg',
  A: 'bg-warn-bg text-warn-fg',
  C: 'bg-info-bg text-info-fg',
  I: 'bg-raised text-ink-nav',
};
const LEGEND = ['R: hace el trabajo', 'A: rinde cuentas y aprueba', 'C: se le consulta', 'I: se le informa'];

const cellKey = (activityId: string, column: Column) => `${activityId}:${column.kind}:${column.id}`;

function RoleSelect({ projectId, activity, column, value }: { projectId: string; activity: Activity; column: Column; value: CellValue }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  // Valor elegido mientras se guarda; si falla, se descarta y vuelve el del servidor.
  const [pending, setPending] = useState<{ role: CellValue } | null>(null);
  const save = useMutation({
    mutationFn: (role: CellValue) =>
      api(`/api/projects/${projectId}/raci/cells`, { method: 'PUT', body: { activityId: activity.id, kind: column.kind, partyId: column.id, role } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: raciKey(projectId) }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setPending(null),
  });
  const shown = pending ? pending.role : value;
  return (
    <select
      aria-label={`${activity.title} — ${column.name}`}
      value={shown ?? ''}
      disabled={save.isPending}
      onChange={(event) => {
        const role = (event.target.value || null) as CellValue;
        setPending({ role });
        save.mutate(role);
      }}
      className={`h-9 w-full min-w-16 cursor-pointer rounded-md border border-control px-1 text-center text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${shown ? ROLE_CLASS[shown] : 'bg-surface text-ink-soft'}`}
    >
      <option value="">—</option>
      {ROLE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Warnings({ warnings }: { warnings: RaciWarning[] }) {
  if (warnings.length === 0) {
    return (
      <Badge tone="success">
        <CircleCheck size={12} aria-hidden="true" />
        Completa
      </Badge>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {warnings.map((warning) => (
        <Badge key={warning} tone="warning">
          <TriangleAlert size={12} aria-hidden="true" />
          {WARNING_LABELS[warning]}
        </Badge>
      ))}
    </span>
  );
}

/** Matriz RACI del proyecto: actividades en filas y miembros e interesados en columnas. */
export function RaciMatrix({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const matrix = useQuery({ queryKey: raciKey(projectId), queryFn: () => api<RaciMatrixData>(`/api/projects/${projectId}/raci`) });
  const [editing, setEditing] = useState<Activity | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: raciKey(projectId) });

  const remove = useMutation({
    mutationFn: (activity: Activity) => api(`/api/projects/${projectId}/raci/activities/${activity.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setDeleting(null),
  });

  const addButton = (
    <Button variant="secondary" onClick={() => setEditing('new')}>
      <Plus size={16} aria-hidden="true" />
      Añadir actividad
    </Button>
  );

  let body;
  if (matrix.isPending) body = <Loading />;
  else if (matrix.isError) body = <ErrorState message={errorMessage(matrix.error)} onRetry={() => matrix.refetch()} />;
  else {
    const { activities, members, stakeholders, cells } = matrix.data;
    const columns: Column[] = [...members.map((m) => ({ ...m, kind: 'member' as const })), ...stakeholders.map((s) => ({ ...s, kind: 'stakeholder' as const }))];
    const roles = new Map(cells.map((c) => [`${c.activityId}:${c.kind}:${c.partyId}`, c.role]));
    if (activities.length === 0) {
      body = <EmptyState>Aún no hay actividades. Crea la primera para asignar responsabilidades.</EmptyState>;
    } else if (columns.length === 0) {
      body = <EmptyState>Añade miembros en el Resumen o interesados en el registro de arriba para completar la matriz.</EmptyState>;
    } else {
      body = (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="text-xs text-ink-soft">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 min-w-48 border-b border-line bg-surface px-3 py-2 font-medium uppercase">
                  Actividad
                </th>
                {members.length > 0 && (
                  <th colSpan={members.length} className="border-b border-l border-line px-2 py-2 text-center font-medium uppercase">
                    Equipo
                  </th>
                )}
                {stakeholders.length > 0 && (
                  <th colSpan={stakeholders.length} className="border-b border-l border-line px-2 py-2 text-center font-medium uppercase">
                    Interesados
                  </th>
                )}
              </tr>
              <tr>
                {columns.map((column) => (
                  <th key={`${column.kind}:${column.id}`} className="max-w-32 border-b border-l border-line px-2 py-2 text-center font-medium text-ink-nav">
                    <span className="line-clamp-2 [overflow-wrap:anywhere]" title={column.name}>
                      {column.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {activities.map((activity) => (
                <tr key={activity.id}>
                  <th scope="row" className="sticky left-0 z-10 min-w-48 bg-surface px-3 py-2 align-top font-normal">
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink [overflow-wrap:anywhere]">{activity.title}</p>
                        {activity.description && <p className="text-xs text-ink-soft [overflow-wrap:anywhere]">{activity.description}</p>}
                        <div className="mt-1">
                          <Warnings warnings={activity.warnings} />
                        </div>
                      </div>
                      <button type="button" aria-label={`Editar ${activity.title}`} onClick={() => setEditing(activity)} className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-soft hover:bg-raised hover:text-ink">
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={`Eliminar ${activity.title}`} onClick={() => setDeleting(activity)} className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-soft hover:bg-raised hover:text-ink">
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </th>
                  {columns.map((column) => (
                    <td key={`${column.kind}:${column.id}`} className="border-l border-line px-2 py-2 align-top">
                      <RoleSelect projectId={projectId} activity={activity} column={column} value={roles.get(cellKey(activity.id, column)) ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  return (
    <div role="region" aria-label="Matriz RACI">
      <Card title="Matriz RACI" actions={addButton}>
        {body}
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft" aria-label="Leyenda">
          {LEGEND.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        {editing && <ActivityForm projectId={projectId} activity={editing === 'new' ? undefined : editing} onSaved={refresh} onClose={() => setEditing(null)} />}
        {deleting && (
          <ConfirmDialog title="Eliminar actividad" danger confirmLabel="Eliminar" onCancel={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting)}>
            Se eliminará «{deleting.title}» y sus asignaciones de forma permanente.
          </ConfirmDialog>
        )}
      </Card>
    </div>
  );
}
