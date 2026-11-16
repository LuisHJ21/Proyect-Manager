import { EXPENSE_CATEGORY, formatMoney, LABELS, LEVEL, RISK_RESPONSE, RISK_STATUS, RISK_TYPE, toPlainText, type RiskType } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, EDIT_CONFLICT_NOTICE, errorMessage, isEditConflict } from '../../api/client';
import type { Expense, Indicators, Member, Risk, Stakeholder, Task } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { ErrorState, Loading } from '../../components/ErrorState';
import { incidentsKey } from '../../components/incidents/IncidentForm';
import { membersKey } from '../../components/project/MembersPanel';
import { RaciMatrix, raciKey } from '../../components/raci/RaciMatrix';
import { tasksKey } from '../../components/tasks/taskQueries';
import { DetailList, RegisterTable, registerKey, type Option, type Values } from '../../components/RegisterTable';
import { RichTextClamp, RichTextView } from '../../components/richText/RichTextView';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card } from '../../components/ui';
import { useAccess } from '../../auth/useAccess';
import { BudgetCategoriesSection } from '../../components/budget/BudgetCategories';
import { useProject } from './ProjectLayout';

const options = <T extends string>(values: readonly T[], labels: Record<T, string>): Option[] =>
  values.map((value) => ({ value, label: labels[value] }));

const HIGH_RISK_SCORE = 15;
const SCALE: Option[] = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }));
const responseOptions = (type: RiskType): Option[] =>
  RISK_RESPONSE[type].map((value) => ({ value, label: LABELS.riskResponse[value] }));

export function StakeholdersPage() {
  const { project, readOnly } = useProject();
  const queryClient = useQueryClient();
  return (
    <div className="space-y-6">
      <RegisterTable<Stakeholder>
        projectId={project.id}
        path="stakeholders"
        title="Registro de interesados"
        singular="interesado"
        canEdit={!readOnly}
        emptyText="Aún no hay interesados registrados."
        itemLabel={(item) => item.name}
        defaults={{ name: '', organization: '', position: '', contact: '', influence: 'MEDIUM', interest: 'MEDIUM', strategy: '' }}
        columns={[
          { header: 'Nombre', cell: (item) => <span className="font-medium text-ink">{item.name}</span> },
          { header: 'Organización y cargo', cell: (item) => [item.organization, item.position].filter(Boolean).join(' · ') },
          { header: 'Contacto', cell: (item) => item.contact },
          { header: 'Influencia', cell: (item) => <Badge>{LABELS.level[item.influence]}</Badge> },
          { header: 'Interés', cell: (item) => <Badge>{LABELS.level[item.interest]}</Badge> },
          { header: 'Estrategia', cell: (item) => item.strategy },
        ]}
        fields={[
          { name: 'name', label: 'Nombre', type: 'text' },
          { name: 'organization', label: 'Organización', type: 'text' },
          { name: 'position', label: 'Cargo', type: 'text' },
          { name: 'contact', label: 'Contacto', type: 'text' },
          { name: 'influence', label: 'Influencia', type: 'select', options: options(LEVEL, LABELS.level) },
          { name: 'interest', label: 'Interés', type: 'select', options: options(LEVEL, LABELS.level) },
          { name: 'strategy', label: 'Estrategia de gestión', type: 'textarea' },
        ]}
        onChanged={() => void queryClient.invalidateQueries({ queryKey: raciKey(project.id) })}
      />
      <RaciMatrix projectId={project.id} readOnly={readOnly} />
    </div>
  );
}

/** Incidentes de un riesgo y el botón para pasarlo a incidente. */
function RiskIncidents({ projectId, risk, readOnly }: { projectId: string; risk: Risk; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: () => api<{ number: number }>(`/api/projects/${projectId}/risks/${risk.id}/incident`, { method: 'POST' }),
    onSuccess: (incident) => {
      toast.success(`Se creó INC-${incident.number}`);
      void queryClient.invalidateQueries({ queryKey: registerKey(projectId, 'risks') });
      void queryClient.invalidateQueries({ queryKey: incidentsKey(projectId) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="space-y-2">
      {risk.incidents && risk.incidents.length > 0 ? (
        <ul className="space-y-1">
          {risk.incidents.map((i) => (
            <li key={i.id}>
              <Link className="text-link hover:underline" to={`/proyectos/${projectId}/incidentes`}>
                {`INC-${i.number} · ${i.title} · ${LABELS.incidentStatus[i.status]}`}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">Sin incidentes.</p>
      )}
      {!readOnly && (
        <Button variant="secondary" disabled={create.isPending} onClick={() => create.mutate()}>
          Pasar a incidente
        </Button>
      )}
    </div>
  );
}

/** El responsable de un riesgo (nivel `own`) solo cambia su estado. */
function RiskStatusSelect({ projectId, risk }: { projectId: string; risk: Risk }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const change = useMutation({
    mutationFn: (status: string) => api(`/api/projects/${projectId}/risks/${risk.id}`, { method: 'PATCH', body: { status, version: risk.version } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: registerKey(projectId, 'risks') }),
    onError: (error) => {
      toast.error(isEditConflict(error) ? EDIT_CONFLICT_NOTICE : errorMessage(error));
      if (isEditConflict(error)) void queryClient.invalidateQueries({ queryKey: registerKey(projectId, 'risks') });
    },
  });
  return (
    <select
      aria-label="Estado del riesgo"
      className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
      value={risk.status}
      disabled={change.isPending}
      onChange={(e) => change.mutate(e.target.value)}
    >
      {RISK_STATUS.map((status) => (
        <option key={status} value={status}>
          {LABELS.riskStatus[status]}
        </option>
      ))}
    </select>
  );
}

export function RisksPage() {
  const { project, readOnly } = useProject();
  const { canWrite, level } = useAccess();
  const canChangeOwnStatus = !readOnly && level('risks') === 'own';
  const members = useQuery({ queryKey: membersKey(project.id), queryFn: () => api<Member[]>(`/api/projects/${project.id}/members`) });
  const memberName = (id: string | null) => members.data?.find((m) => m.userId === id)?.name ?? '—';

  const normalize = (values: Values): Values => {
    const valid = responseOptions(values.type).map((o) => o.value);
    return valid.includes(values.response) ? values : { ...values, response: valid[0] };
  };

  return (
    <RegisterTable<Risk>
      projectId={project.id}
      path="risks"
      title="Registro de riesgos"
      singular="riesgo"
      canEdit={!readOnly && canWrite('risks')}
      emptyText="Aún no hay riesgos registrados."
      itemLabel={(item) => toPlainText(item.description)}
      normalize={normalize}
      detail={{
        title: () => 'Detalle del riesgo',
        render: (item) => (
          <DetailList
            rows={[
              { label: 'Descripción', value: <RichTextView html={item.description} /> },
              { label: 'Plan de respuesta', value: <RichTextView html={item.responsePlan} empty="Sin plan de respuesta." /> },
              { label: 'Tipo', value: LABELS.riskType[item.type] },
              { label: 'Puntaje', value: `${item.score} (${item.probability} × ${item.impact})` },
              { label: 'Respuesta', value: LABELS.riskResponse[item.response as keyof typeof LABELS.riskResponse] },
              { label: 'Responsable', value: memberName(item.ownerId) },
              { label: 'Estado', value: canChangeOwnStatus ? <RiskStatusSelect projectId={project.id} risk={item} /> : LABELS.riskStatus[item.status] },
              // El vínculo con incidentes es del PM.
              ...(canWrite('risks') ? [{ label: 'Incidentes', value: <RiskIncidents projectId={project.id} risk={item} readOnly={readOnly} /> }] : []),
            ]}
          />
        ),
      }}
      defaults={{ description: '', type: 'THREAT', probability: 3, impact: 3, response: 'MITIGATE', responsePlan: '', ownerId: null, status: 'OPEN' }}
      columns={[
        { header: 'Riesgo', cell: (item) => <span className="font-medium text-ink"><RichTextClamp html={item.description} /></span> },
        { header: 'Tipo', cell: (item) => LABELS.riskType[item.type] },
        { header: 'Prob. × Impacto', cell: (item) => `${item.probability} × ${item.impact}` },
        {
          header: 'Puntaje',
          cell: (item) =>
            item.score >= HIGH_RISK_SCORE && item.status !== 'CLOSED' ? <Badge tone="danger">{item.score} · Alto</Badge> : <span>{item.score}</span>,
        },
        { header: 'Respuesta', cell: (item) => LABELS.riskResponse[item.response as keyof typeof LABELS.riskResponse] },
        { header: 'Responsable', cell: (item) => memberName(item.ownerId) },
        { header: 'Estado', cell: (item) => LABELS.riskStatus[item.status] },
      ]}
      fields={[
        { name: 'description', label: 'Descripción', type: 'richtext' },
        { name: 'type', label: 'Tipo', type: 'select', options: options(RISK_TYPE, LABELS.riskType) },
        { name: 'probability', label: 'Probabilidad (1 a 5)', type: 'select', numeric: true, options: SCALE },
        { name: 'impact', label: 'Impacto (1 a 5)', type: 'select', numeric: true, options: SCALE },
        { name: 'response', label: 'Respuesta', type: 'select', options: (values) => responseOptions(values.type) },
        { name: 'responsePlan', label: 'Plan de respuesta', type: 'richtext' },
        {
          name: 'ownerId',
          label: 'Responsable',
          type: 'select',
          nullable: true,
          // Un observador no puede ser responsable.
          options: (values) =>
            members.data?.filter((m) => m.role !== 'OBSERVER' || m.userId === values.ownerId).map((m) => ({ value: m.userId, label: m.name })) ?? [],
        },
        { name: 'status', label: 'Estado', type: 'select', options: options(RISK_STATUS, LABELS.riskStatus) },
      ]}
    />
  );
}

function BudgetTotals({ projectId, currency }: { projectId: string; currency: string }) {
  const indicators = useQuery({
    queryKey: ['project', projectId, 'indicators'],
    queryFn: () => api<Indicators>(`/api/projects/${projectId}/indicators`),
  });
  if (indicators.isPending) return <Loading />;
  if (indicators.isError) return <ErrorState message={errorMessage(indicators.error)} onRetry={() => indicators.refetch()} />;
  const budget = indicators.data.budget ?? { plannedCents: 0, spentCents: 0, differenceCents: 0 };
  const overBudget = budget.differenceCents < 0;
  const stats = [
    { label: 'Planificado', value: budget.plannedCents },
    { label: 'Gastado', value: budget.spentCents },
    { label: 'Diferencia', value: budget.differenceCents, alert: overBudget },
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-line bg-surface p-4">
            <p className="text-xs font-medium text-ink-soft">{stat.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${stat.alert ? 'text-risk-fg' : 'text-ink'}`}>{formatMoney(stat.value, currency)}</p>
          </div>
        ))}
      </div>
      {overBudget && (
        <p role="alert" className="rounded-md bg-risk-bg px-3 py-2 text-sm text-risk-fg">
          Los gastos superan el presupuesto planificado.
        </p>
      )}
    </div>
  );
}

export function BudgetPage() {
  const { project, readOnly } = useProject();
  const currency = project.currency ?? 'USD';
  const tasks = useQuery({ queryKey: tasksKey(project.id), queryFn: () => api<Task[]>(`/api/projects/${project.id}/tasks`) });
  const taskTitle = (id: string | null) => (id ? (tasks.data?.find((t) => t.id === id)?.title ?? '—') : '—');
  return (
    <div className="space-y-6">
      <BudgetTotals projectId={project.id} currency={currency} />
      <BudgetCategoriesSection projectId={project.id} currency={currency} canEdit={!readOnly} />
      <RegisterTable<Expense>
        projectId={project.id}
        path="expenses"
        title="Gastos"
        singular="gasto"
        canEdit={!readOnly}
        emptyText="Aún no hay gastos registrados."
        itemLabel={(item) => item.description}
        defaults={{ description: '', amountCents: null, date: '', category: 'LABOR', taskId: null }}
        columns={[
          { header: 'Fecha', cell: (item) => item.date },
          { header: 'Descripción', cell: (item) => <span className="font-medium text-ink">{item.description}</span> },
          { header: 'Categoría', cell: (item) => LABELS.expenseCategory[item.category] },
          { header: 'Tarea', cell: (item) => taskTitle(item.taskId) },
          { header: 'Monto', cell: (item) => formatMoney(item.amountCents, currency) },
        ]}
        fields={[
          { name: 'description', label: 'Descripción', type: 'text' },
          { name: 'amountCents', label: 'Monto', type: 'money' },
          { name: 'date', label: 'Fecha', type: 'date' },
          {
            name: 'category',
            label: 'Categoría',
            type: 'select',
            options: options(EXPENSE_CATEGORY, LABELS.expenseCategory),
            // Contra el costo doble: las horas del equipo ya suman su costo.
            hint: (values) =>
              values.category === 'LABOR'
                ? 'Usa esta categoría para trabajo externo. Las horas del equipo ya suman su costo desde la tarifa de cada miembro.'
                : undefined,
          },
          {
            name: 'taskId',
            label: 'Tarea (opcional)',
            type: 'select',
            nullable: true,
            emptyLabel: 'Sin tarea',
            // Un gasto se liga a una tarea sin subtareas.
            options: tasks.data?.filter((t) => !t.isSummary).map((t) => ({ value: t.id, label: t.title })) ?? [],
          },
        ]}
      />
    </div>
  );
}

export function AttachmentsPage() {
  const { project, isPm, readOnly } = useProject();
  const { user } = useAuth();
  return (
    <Card title="Anexos del proyecto">
      <p className="mb-3 text-sm text-ink-nav">Todos los miembros del proyecto pueden ver y descargar estos archivos.</p>
      <AttachmentList scope={{ projectId: project.id }} canUpload={isPm && !readOnly} isPm={isPm} currentUserId={user?.id} readOnly={readOnly} />
    </Card>
  );
}
