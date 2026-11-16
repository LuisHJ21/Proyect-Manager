import { ACTIVE_PROJECT_STATUS, APPROACH, LABELS, type Approach, type ProjectStatus } from '@pm/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { Project } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { INVALID_MONEY_MESSAGE, MoneyInput } from '../MoneyInput';
import { RichTextEditor } from '../richText/RichTextEditor';
import { Button, inputClass } from '../ui';

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
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
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
      status,
      approach,
      startDate: startDate || null,
      endDate: endDate || null,
      plannedBudgetCents: budget,
      contingencyReserveCents: contingency,
      managementReserveCents: management,
      currency,
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
        <FormField label="Estado" error={errors.fields.status}>
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {ACTIVE_PROJECT_STATUS.map((value) => (
              <option key={value} value={value}>
                {LABELS.projectStatus[value]}
              </option>
            ))}
          </select>
        </FormField>
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
