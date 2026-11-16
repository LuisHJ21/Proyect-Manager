import { LABELS } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Requirement } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { deliverableCode } from '../../components/deliverables/DeliverableForm';
import { ErrorState, Loading } from '../../components/ErrorState';
import { RequirementForm } from '../../components/requirements/RequirementForm';
import { requirementCode, requirementsKey, traceabilityKey } from '../../components/requirements/RequirementPicker';
import { TraceabilityMatrix } from '../../components/requirements/TraceabilityMatrix';
import { RichTextClamp } from '../../components/richText/RichTextView';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, EmptyState } from '../../components/ui';
import { useProject } from './ProjectLayout';

/** Registro de requisitos y su trazabilidad. Todos los miembros leen; edita el PM. */
export function RequirementsPage() {
  const { project, isPm, readOnly } = useProject();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Requirement | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Requirement | null>(null);
  const list = useQuery({ queryKey: requirementsKey(project.id), queryFn: () => api<Requirement[]>(`/api/projects/${project.id}/requirements`) });
  const canEdit = isPm && !readOnly;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: requirementsKey(project.id) });
    void queryClient.invalidateQueries({ queryKey: traceabilityKey(project.id) });
  };
  const markMet = async (r: Requirement) => {
    try {
      await api(`/api/projects/${project.id}/requirements/${r.id}`, { method: 'PATCH', body: { status: 'MET', version: r.version } });
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const remove = async (r: Requirement) => {
    try {
      await api(`/api/projects/${project.id}/requirements/${r.id}`, { method: 'DELETE' });
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(null);
    }
  };

  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />;
  return (
    <div className="space-y-6">
      <Card title="Requisitos" actions={canEdit ? <Button onClick={() => setEditing('new')}>Añadir requisito</Button> : undefined}>
        {list.data.length === 0 ? (
          <EmptyState>Aún no hay requisitos registrados.</EmptyState>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {list.data.map((r) => (
              <li key={r.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-ink">{requirementCode(r)}</span>
                    <div className="text-ink">
                      <RichTextClamp html={r.description} />
                    </div>
                    <p className="text-xs text-ink-soft">
                      {r.deliverables.length === 0 ? 'Sin entregable' : r.deliverables.map((d) => `${deliverableCode(d)} · ${d.name}`).join(', ')}
                      {r.stakeholder ? ` · Origen: ${r.stakeholder.name}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{LABELS.priority[r.priority]}</Badge>
                    <Badge tone={r.status === 'MET' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'neutral'}>{LABELS.requirementStatus[r.status]}</Badge>
                    {canEdit && (
                      <>
                        <Button variant="ghost" onClick={() => setEditing(r)}>
                          Editar
                        </Button>
                        <Button variant="ghost" onClick={() => setDeleting(r)}>
                          Eliminar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {r.suggestMet && canEdit && (
                  <p className="flex flex-wrap items-center gap-2 rounded-md bg-ok-bg px-3 py-2 text-ok-fg">
                    Todos sus entregables están aceptados
                    <Button variant="secondary" onClick={() => void markMet(r)}>
                      Marcar cumplido
                    </Button>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TraceabilityMatrix projectId={project.id} />
      {editing && <RequirementForm projectId={project.id} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog title={`Eliminar ${requirementCode(deleting)}`} danger confirmLabel="Eliminar" onConfirm={() => void remove(deleting)} onCancel={() => setDeleting(null)}>
          <p>Se quita el requisito y sus vínculos con entregables y cambios.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
