import { EXPENSE_CATEGORY, formatMoney, LABELS, LEVEL, RISK_RESPONSE, RISK_STATUS, RISK_TYPE, type RiskType } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import type { Expense, Indicators, Member, Risk, Stakeholder } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { ErrorState, Loading } from '../../components/ErrorState';
import { membersKey } from '../../components/project/MembersPanel';
import { RegisterTable, type Option, type Values } from '../../components/RegisterTable';
import { Badge, Card } from '../../components/ui';
import { useProject } from './ProjectLayout';

const options = <T extends string>(values: readonly T[], labels: Record<T, string>): Option[] =>
  values.map((value) => ({ value, label: labels[value] }));

const HIGH_RISK_SCORE = 15;
const SCALE: Option[] = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }));
const responseOptions = (type: RiskType): Option[] =>
  RISK_RESPONSE[type].map((value) => ({ value, label: LABELS.riskResponse[value] }));

export function StakeholdersPage() {
  const { project } = useProject();
  return (
    <RegisterTable<Stakeholder>
      projectId={project.id}
      path="stakeholders"
      title="Registro de interesados"
      singular="interesado"
      canEdit
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
    />
  );
}

export function RisksPage() {
  const { project } = useProject();
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
      canEdit
      emptyText="Aún no hay riesgos registrados."
      itemLabel={(item) => item.description}
      normalize={normalize}
      defaults={{ description: '', type: 'THREAT', probability: 3, impact: 3, response: 'MITIGATE', responsePlan: '', ownerId: null, status: 'OPEN' }}
      columns={[
        { header: 'Riesgo', cell: (item) => <span className="font-medium text-ink">{item.description}</span> },
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
        { name: 'description', label: 'Descripción', type: 'textarea' },
        { name: 'type', label: 'Tipo', type: 'select', options: options(RISK_TYPE, LABELS.riskType) },
        { name: 'probability', label: 'Probabilidad (1 a 5)', type: 'select', numeric: true, options: SCALE },
        { name: 'impact', label: 'Impacto (1 a 5)', type: 'select', numeric: true, options: SCALE },
        { name: 'response', label: 'Respuesta', type: 'select', options: (values) => responseOptions(values.type) },
        { name: 'responsePlan', label: 'Plan de respuesta', type: 'textarea' },
        {
          name: 'ownerId',
          label: 'Responsable',
          type: 'select',
          nullable: true,
          options: members.data?.map((m) => ({ value: m.userId, label: m.name })) ?? [],
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
  const { project } = useProject();
  const currency = project.currency ?? 'USD';
  return (
    <div className="space-y-6">
      <BudgetTotals projectId={project.id} currency={currency} />
      <RegisterTable<Expense>
        projectId={project.id}
        path="expenses"
        title="Gastos"
        singular="gasto"
        canEdit
        emptyText="Aún no hay gastos registrados."
        itemLabel={(item) => item.description}
        defaults={{ description: '', amountCents: null, date: '', category: 'LABOR' }}
        columns={[
          { header: 'Fecha', cell: (item) => item.date },
          { header: 'Descripción', cell: (item) => <span className="font-medium text-ink">{item.description}</span> },
          { header: 'Categoría', cell: (item) => LABELS.expenseCategory[item.category] },
          { header: 'Monto', cell: (item) => formatMoney(item.amountCents, currency) },
        ]}
        fields={[
          { name: 'description', label: 'Descripción', type: 'text' },
          { name: 'amountCents', label: 'Monto', type: 'money' },
          { name: 'date', label: 'Fecha', type: 'date' },
          { name: 'category', label: 'Categoría', type: 'select', options: options(EXPENSE_CATEGORY, LABELS.expenseCategory) },
        ]}
      />
    </div>
  );
}

export function AttachmentsPage() {
  const { project, isPm } = useProject();
  const { user } = useAuth();
  return (
    <Card title="Anexos del proyecto">
      <p className="mb-3 text-sm text-ink-nav">Todos los miembros del proyecto pueden ver y descargar estos archivos.</p>
      <AttachmentList scope={{ projectId: project.id }} canUpload={isPm} isPm={isPm} currentUserId={user?.id} />
    </Card>
  );
}
