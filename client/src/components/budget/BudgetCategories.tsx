import { EXPENSE_CATEGORY, formatMoney, LABELS, type ExpenseCategory } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { BudgetCategories } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { ErrorState, Loading } from '../ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { INVALID_MONEY_MESSAGE, MoneyInput } from '../MoneyInput';
import { Button } from '../ui';

export const budgetCategoriesKey = (projectId: string) => ['project', projectId, 'budget-categories'];

function EditDialog({ projectId, data, onClose }: { projectId: string; data: BudgetCategories; onClose: () => void }) {
  const queryClient = useQueryClient();
  const initial = Object.fromEntries(EXPENSE_CATEGORY.map((c) => [c, data.items.find((i) => i.category === c)?.plannedCents ?? 0])) as Record<ExpenseCategory, number | null>;
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = EXPENSE_CATEGORY.filter((c) => values[c] === null);
    if (invalid.length > 0) {
      setErrors({ fields: Object.fromEntries(invalid.map((c) => [c, INVALID_MONEY_MESSAGE])) });
      return;
    }
    setBusy(true);
    try {
      // Solo viajan las categorías con monto; las demás quedan sin planear.
      const items = EXPENSE_CATEGORY.filter((c) => (values[c] ?? 0) > 0).map((category) => ({ category, plannedCents: values[category]! }));
      const saved = await api<BudgetCategories>(`/api/projects/${projectId}/budget-categories`, { method: 'PUT', body: { items } });
      queryClient.setQueryData(budgetCategoriesKey(projectId), saved);
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Editar presupuesto por categoría" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message} />
        {EXPENSE_CATEGORY.map((category) => (
          <FormField key={category} label={LABELS.expenseCategory[category]} error={errors.fields[category]}>
            <MoneyInput value={values[category]} onChange={(cents) => setValues((v) => ({ ...v, [category]: cents }))} blankIsZero />
          </FormField>
        ))}
        <div className="flex justify-end gap-2">
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

/** Presupuesto planeado frente a real por categoría, mano de obra del equipo y reservas. */
export function BudgetCategoriesSection({ projectId, currency, canEdit }: { projectId: string; currency: string; canEdit: boolean }) {
  const query = useQuery({ queryKey: budgetCategoriesKey(projectId), queryFn: () => api<BudgetCategories>(`/api/projects/${projectId}/budget-categories`) });
  const [editing, setEditing] = useState(false);
  const money = (cents: number) => formatMoney(cents, currency);
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const data = query.data;

  return (
    <section aria-label="Presupuesto por categoría" className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Presupuesto por categoría</h2>
        {canEdit && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar presupuesto por categoría
          </Button>
        )}
      </div>
      {data.overAllocated && (
        <p role="alert" className="mb-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          La línea base y las reservas superan el presupuesto del proyecto
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink-soft uppercase">
            <tr>
              <th className="py-2 pr-4 font-medium">Categoría</th>
              <th className="py-2 pr-4 font-medium">Planeado</th>
              <th className="py-2 pr-4 font-medium">Real</th>
              <th className="py-2 font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.items.map((item) => {
              const difference = item.plannedCents - item.actualCents;
              return (
                <tr key={item.category}>
                  <td className="py-2 pr-4 text-ink">{LABELS.expenseCategory[item.category]}</td>
                  <td className="py-2 pr-4 text-ink-nav">{money(item.plannedCents)}</td>
                  <td className="py-2 pr-4 text-ink-nav">{money(item.actualCents)}</td>
                  <td className={`py-2 ${difference < 0 ? 'text-risk-fg' : 'text-ink-nav'}`}>{money(difference)}</td>
                </tr>
              );
            })}
            <tr>
              <td className="py-2 pr-4 text-ink">Mano de obra del equipo</td>
              <td className="py-2 pr-4 text-ink-soft">—</td>
              <td className="py-2 pr-4 text-ink-nav">{money(data.teamLaborCents)}</td>
              <td className="py-2 text-ink-soft">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Contingencia', value: data.contingencyCents },
          { label: 'Reserva de gestión', value: data.managementCents },
          { label: 'Sin asignar', value: data.unallocatedCents, alert: data.unallocatedCents < 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-line p-3">
            <dt className="text-xs font-medium text-ink-soft">{stat.label}</dt>
            <dd className={`mt-1 font-semibold ${stat.alert ? 'text-risk-fg' : 'text-ink'}`}>{money(stat.value)}</dd>
          </div>
        ))}
      </dl>
      {editing && <EditDialog projectId={projectId} data={data} onClose={() => setEditing(false)} />}
    </section>
  );
}
