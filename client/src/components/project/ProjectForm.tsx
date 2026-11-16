import { APPROACH, LABELS, STATUS_REPORT_FREQUENCY, type Approach, type ProjectStatus, type StatusReportFrequency } from '@pm/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { Project } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { INVALID_MONEY_MESSAGE, MoneyInput } from '../MoneyInput';
import { RichTextEditor } from '../richText/RichTextEditor';
import { Button, inputClass } from '../ui';

/** Estados que el formulario ofrece: la pausa tiene sus propios botones. */
const FORM_STATUS = ['PLANNING', 'EXECUTING'] as const;

export function ProjectForm({ project, onSaved, onClose }: { project?: Project; onSaved: (project: Project) => void; onClose: () => void }) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'PLANNING');
  const [approach, setApproach] = useState<Approach>(project?.approach ?? 'PREDICTIVE');
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [endDate, setEndDate] = useState(project?.endDate ?? '');
  const [budget, setBudget] = useState<number | null>(project?.plannedBudgetCents ?? 0);
  const [contingency, setContingency] = useState<number | null>(project?.contingencyReserveCents ?? 0);
  const [management, setManagement] = useState<number | null>(project?.managementReserveCents ?? 0);
  const [currency, setCurrency] = useState(project?.currency ?? 'USD');
  const [frequency, setFrequency] = useState<StatusReportFrequency>(project?.statusReportFrequency ?? 'NONE');
  // Umbrales de salud (F16): los valores de siempre salvo que el PM los cambie.
  const [overdueTasks, setOverdueTasks] = useState(String(project?.healthOverdueTasks ?? 3));
  const [budgetPercent, setBudgetPercent] = useState(String(project?.healthBudgetPercent ?? 90));
  const [indexMin, setIndexMin] = useState(String(project?.healthIndexMin ?? 90));
  const [riskScore, setRiskScore] = useState(String(project?.highRiskScore ?? 15));
  const [shareLessons, setShareLessons] = useState(project?.shareLessons ?? true);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const isPaused = project?.status === 'PAUSED';
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = { plannedBudgetCents: budget, contingencyReserveCents: contingency, managementReserveCents: management };
    const fields = Object.fromEntries(Object.entries(invalid).filter(([, v]) => v === null).map(([k]) => [k, INVALID_MONEY_MESSAGE]));
    if (Object.keys(fields).length > 0) {
      setErrors({ fields });
      return;
    }
    setErrors(NO_ERRORS);
    setBusy(true);
    const body = {
      name,
      description,
      // Entrar o salir de la pausa va por Pausar o Reanudar: un proyecto pausado no envía su estado.
      ...(isPaused ? {} : { status }),
      approach,
      startDate: startDate || null,
      endDate: endDate || null,
      plannedBudgetCents: budget,
      contingencyReserveCents: contingency,
      managementReserveCents: management,
      currency,
      statusReportFrequency: frequency,
      healthOverdueTasks: Number(overdueTasks),
      healthBudgetPercent: Number(budgetPercent),
      healthIndexMin: Number(indexMin),
      highRiskScore: Number(riskScore),
      shareLessons,
    };
    try {
      const saved = project
        ? await api<Project>(`/api/projects/${project.id}`, { method: 'PATCH', body })
        : await api<Project>('/api/projects', { method: 'POST', body });
      onSaved(saved);
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={project ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <FormMessage message={errors.message} />
        </div>
        <div className="sm:col-span-2">
          <FormField label="Nombre" error={errors.fields.name}>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Descripción" error={errors.fields.description}>
            <RichTextEditor label="Descripción" value={description} onChange={setDescription} />
          </FormField>
        </div>
        {isPaused ? (
          <div className="text-sm">
            <p className="mb-1 font-medium text-ink">Estado</p>
            <p className="text-ink-soft">En pausa · usa Reanudar proyecto</p>
          </div>
        ) : (
          <FormField label="Estado" error={errors.fields.status}>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {FORM_STATUS.map((value) => (
                <option key={value} value={value}>
                  {LABELS.projectStatus[value]}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField label="Enfoque de desarrollo" error={errors.fields.approach}>
          <select className={inputClass} value={approach} onChange={(e) => setApproach(e.target.value as Approach)}>
            {APPROACH.map((value) => (
              <option key={value} value={value}>
                {LABELS.approach[value]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Fecha de inicio" error={errors.fields.startDate}>
          <input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label="Fecha de fin" error={errors.fields.endDate}>
          <input className={inputClass} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
        <FormField label="Presupuesto planificado" error={errors.fields.plannedBudgetCents}>
          <MoneyInput value={budget} onChange={setBudget} blankIsZero />
        </FormField>
        <FormField label="Reserva de contingencia" error={errors.fields.contingencyReserveCents} hint="Para riesgos identificados.">
          <MoneyInput value={contingency} onChange={setContingency} blankIsZero />
        </FormField>
        <FormField label="Reserva de gestión" error={errors.fields.managementReserveCents} hint="Para imprevistos no identificados.">
          <MoneyInput value={management} onChange={setManagement} blankIsZero />
        </FormField>
        <FormField label="Moneda" error={errors.fields.currency} hint="Código de 3 letras, por ejemplo USD o MXN">
          <input className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </FormField>
        <FormField label="Frecuencia del informe de estado" error={errors.fields.statusReportFrequency} hint="El panel avisa cuando toca emitirlo.">
          <select className={inputClass} value={frequency} onChange={(e) => setFrequency(e.target.value as StatusReportFrequency)}>
            {STATUS_REPORT_FREQUENCY.map((value) => (
              <option key={value} value={value}>
                {LABELS.reportFrequency[value]}
              </option>
            ))}
          </select>
        </FormField>
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input type="checkbox" checked={shareLessons} onChange={(e) => setShareLessons(e.target.checked)} className="h-4 w-4 accent-primary" />
          Compartir lecciones en la biblioteca
        </label>
        <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-4">
          <legend className="mb-1 text-sm font-medium text-ink">Umbrales de salud</legend>
          <FormField label="Tareas vencidas para «En riesgo»" error={errors.fields.healthOverdueTasks}>
            <input className={inputClass} inputMode="numeric" value={overdueTasks} onChange={(e) => setOverdueTasks(e.target.value)} />
          </FormField>
          <FormField label="% del presupuesto para «Atención»" error={errors.fields.healthBudgetPercent}>
            <input className={inputClass} inputMode="numeric" value={budgetPercent} onChange={(e) => setBudgetPercent(e.target.value)} />
          </FormField>
          <FormField label="CPI/SPI mínimo (centésimas)" error={errors.fields.healthIndexMin} hint="90 equivale a 0,90.">
            <input className={inputClass} inputMode="numeric" value={indexMin} onChange={(e) => setIndexMin(e.target.value)} />
          </FormField>
          <FormField label="Puntaje de riesgo alto" error={errors.fields.highRiskScore}>
            <input className={inputClass} inputMode="numeric" value={riskScore} onChange={(e) => setRiskScore(e.target.value)} />
          </FormField>
        </fieldset>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
