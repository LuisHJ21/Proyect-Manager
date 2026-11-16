import { LABELS } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { ChangeProposal } from '../../api/types';
import { Modal } from '../../components/ConfirmDialog';
import { ErrorState, Loading } from '../../components/ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../../components/FormField';
import { Badge, Button, Card, EmptyState, inputClass } from '../../components/ui';
import { RequirementPicker } from '../../components/requirements/RequirementPicker';
import { changeRequestsKey, code, STATUS_TONE } from './ChangeRequests';
import { useProject } from './ProjectLayout';

function ProposeForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirementIds, setRequirementIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/change-requests`, { method: 'POST', body: { title, description, requirementIds } });
      await queryClient.invalidateQueries({ queryKey: changeRequestsKey(projectId) });
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Proponer cambio" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        <FormField label="Título" error={errors.fields.title}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="Descripción" error={errors.fields.description} hint="Qué cambiarías y por qué. El Project Manager analiza los impactos y decide.">
          <textarea className={inputClass} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <RequirementPicker projectId={projectId} selected={requirementIds} onChange={setRequirementIds} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Enviar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Propuestas de cambio de quien no es PM: solo las suyas, con su estado y la decisión. */
export function MyProposals() {
  const { project, readOnly } = useProject();
  const list = useQuery({ queryKey: changeRequestsKey(project.id), queryFn: () => api<ChangeProposal[]>(`/api/projects/${project.id}/change-requests`) });
  const [proposing, setProposing] = useState(false);

  return (
    <Card title="Mis propuestas de cambio" actions={readOnly ? undefined : <Button variant="secondary" onClick={() => setProposing(true)}>Proponer cambio</Button>}>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState>Aún no has propuesto cambios.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {list.data.map((item) => (
            <li key={item.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{code(item)}</span>
                <span className="text-sm text-ink [overflow-wrap:anywhere]">{item.title}</span>
                <Badge tone={STATUS_TONE[item.status]}>{LABELS.changeStatus[item.status]}</Badge>
              </div>
              {item.status !== 'PENDING' && (
                <div className="mt-1 text-sm text-ink-nav">
                  <p className="[overflow-wrap:anywhere]">{item.decisionNote}</p>
                  <p className="text-xs text-ink-soft">
                    {`Decidió ${item.decidedBy?.name ?? 'una cuenta eliminada'}${item.decidedAt ? `, el ${new Date(item.decidedAt).toLocaleDateString('es')}` : ''}`}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {proposing && <ProposeForm projectId={project.id} onClose={() => setProposing(false)} />}
    </Card>
  );
}
