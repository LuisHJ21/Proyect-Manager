import { LABELS, MILESTONE_STATUS, OBJECTIVE_STATUS, toPlainText } from '@pm/shared';
import type { Milestone, Objective } from '../../api/types';
import { DetailList, RegisterTable, type Option } from '../RegisterTable';
import { RichTextClamp, RichTextView } from '../richText/RichTextView';
import { Badge } from '../ui';
import { useProject } from '../../pages/project/ProjectLayout';

const options = <T extends string>(values: readonly T[], labels: Record<T, string>): Option[] =>
  values.map((value) => ({ value, label: labels[value] }));

export function ObjectivesPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  return (
    <RegisterTable<Objective>
      projectId={projectId}
      path="objectives"
      title="Objetivos"
      singular="objetivo"
      canEdit={canEdit}
      emptyText="Aún no hay objetivos."
      itemLabel={(item) => toPlainText(item.description)}
      defaults={{ description: '', metric: '', target: '', status: 'PENDING' }}
      detail={{
        title: () => 'Detalle del objetivo',
        render: (item) => (
          <DetailList
            rows={[
              { label: 'Objetivo', value: <RichTextView html={item.description} /> },
              { label: 'Métrica', value: item.metric || '—' },
              { label: 'Meta', value: item.target || '—' },
              { label: 'Estado', value: LABELS.objectiveStatus[item.status] },
            ]}
          />
        ),
      }}
      columns={[
        { header: 'Objetivo', cell: (item) => <RichTextClamp html={item.description} /> },
        { header: 'Métrica', cell: (item) => item.metric },
        { header: 'Meta', cell: (item) => item.target },
        {
          header: 'Estado',
          cell: (item) => (
            <Badge tone={item.status === 'MET' ? 'success' : item.status === 'NOT_MET' ? 'danger' : 'neutral'}>
              {LABELS.objectiveStatus[item.status]}
            </Badge>
          ),
        },
      ]}
      fields={[
        { name: 'description', label: 'Objetivo', type: 'richtext' },
        { name: 'metric', label: 'Métrica', type: 'text' },
        { name: 'target', label: 'Meta', type: 'text' },
        { name: 'status', label: 'Estado', type: 'select', options: options(OBJECTIVE_STATUS, LABELS.objectiveStatus) },
      ]}
    />
  );
}

export function MilestonesPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  return (
    <RegisterTable<Milestone>
      projectId={projectId}
      path="milestones"
      title="Hitos"
      singular="hito"
      canEdit={canEdit}
      emptyText="Aún no hay hitos."
      itemLabel={(item) => item.name}
      defaults={{ name: '', dueDate: '', status: 'PENDING' }}
      nameSuggestions={[
        'Acta y objetivos aprobados',
        'Plan de entrega acordado',
        'Primer resultado validado',
        'Entrega final aceptada',
        'Cierre y transferencia completados',
      ]}
      columns={[
        { header: 'Hito', cell: (item) => item.name },
        { header: 'Fecha límite', cell: (item) => item.dueDate },
        {
          header: 'Estado',
          cell: (item) => (
            <>
              <Badge tone={item.status === 'REACHED' ? 'success' : 'neutral'}>{LABELS.milestoneStatus[item.status]}</Badge>
              {item.readyToReach && <p className="mt-1 text-xs text-ink-soft">Listo para marcar como alcanzado</p>}
            </>
          ),
        },
      ]}
      fields={[
        { name: 'name', label: 'Nombre', type: 'text' },
        { name: 'dueDate', label: 'Fecha límite', type: 'date' },
        { name: 'status', label: 'Estado', type: 'select', options: options(MILESTONE_STATUS, LABELS.milestoneStatus) },
      ]}
    />
  );
}

export function MilestonesPage() {
  const { project, isPm, readOnly } = useProject();
  return <MilestonesPanel projectId={project.id} canEdit={isPm && !readOnly} />;
}
