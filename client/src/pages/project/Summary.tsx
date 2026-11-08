import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { Indicators, Project } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FormField } from '../../components/FormField';
import { IndicatorCards } from '../../components/project/IndicatorCards';
import { MembersPanel } from '../../components/project/MembersPanel';
import { MilestonesPanel, ObjectivesPanel } from '../../components/project/PlanningPanels';
import { ProjectForm } from '../../components/project/ProjectForm';
import { RichTextView } from '../../components/richText/RichTextView';
import { useToast } from '../../components/Toast';
import { Button, Card, inputClass } from '../../components/ui';
import { LABELS } from '@pm/shared';
import { projectKey, useProject } from './ProjectLayout';

function DeleteProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmName, setConfirmName] = useState('');
  const remove = useMutation({
    mutationFn: () => api(`/api/projects/${project.id}`, { method: 'DELETE', body: { confirmName } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.removeQueries({ queryKey: ['project', project.id] });
      navigate('/proyectos');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <ConfirmDialog
      title="Eliminar proyecto"
      danger
      confirmLabel="Eliminar definitivamente"
      confirmDisabled={confirmName !== project.name || remove.isPending}
      onCancel={onClose}
      onConfirm={() => remove.mutate()}
    >
      <p>Se borrarán de forma permanente sus tareas, anexos y demás datos. Esta acción no se puede deshacer.</p>
      <FormField label="Nombre del proyecto" hint={`Escribe «${project.name}» para confirmar`}>
        <input className={inputClass} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
      </FormField>
    </ConfirmDialog>
  );
}

export function SummaryPage() {
  const { project, isPm } = useProject();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const indicators = useQuery({
    queryKey: ['project', project.id, 'indicators'],
    queryFn: () => api<Indicators>(`/api/projects/${project.id}/indicators`),
  });

  return (
    <div className="space-y-6">
      <IndicatorCards query={indicators} currency={project.currency} />
      <Card
        title="Descripción"
        actions={
          isPm ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Editar proyecto
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(true)}>
                Eliminar proyecto
              </Button>
            </div>
          ) : undefined
        }
      >
        <RichTextView html={project.description} empty="Sin descripción." />
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-soft">Enfoque de desarrollo</dt>
            <dd className="text-ink">{LABELS.approach[project.approach]}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Inicio</dt>
            <dd className="text-ink">{project.startDate ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Fin</dt>
            <dd className="text-ink">{project.endDate ?? '—'}</dd>
          </div>
        </dl>
      </Card>
      <ObjectivesPanel projectId={project.id} canEdit={isPm} />
      <MilestonesPanel projectId={project.id} canEdit={isPm} />
      <MembersPanel projectId={project.id} canEdit={isPm} />
      {editing && (
        <ProjectForm
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: projectKey(project.id) });
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            void queryClient.invalidateQueries({ queryKey: ['project', project.id, 'indicators'] });
            setEditing(false);
          }}
        />
      )}
      {deleting && <DeleteProjectDialog project={project} onClose={() => setDeleting(false)} />}
    </div>
  );
}
