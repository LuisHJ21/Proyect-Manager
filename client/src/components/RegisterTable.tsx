import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, EDIT_CONFLICT_NOTICE, errorMessage, isEditConflict } from '../api/client';
import { ConfirmDialog, Modal } from './ConfirmDialog';
import { ErrorState, Loading } from './ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from './FormField';
import { INVALID_MONEY_MESSAGE, MoneyInput } from './MoneyInput';
import { RichTextEditor } from './richText/RichTextEditor';
import { useToast } from './Toast';
import { Button, Card, EmptyState, inputClass } from './ui';
import { downloadCsv, toCsv, type CsvColumn } from '../lib/csv';

export type Option = { value: string | number; label: string };
export type Values = Record<string, any>;

export type FieldDef = {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'richtext' | 'date' | 'select' | 'money';
  options?: Option[] | ((values: Values) => Option[]);
  /** El valor del select se convierte a número al guardar. */
  numeric?: boolean;
  /** Admite dejar el select vacío; se guarda como null. */
  nullable?: boolean;
  /** Texto de la opción vacía de un select nullable. */
  emptyLabel?: string;
  /** Pista bajo el campo, según lo escrito en el formulario. */
  hint?: (values: Values) => string | undefined;
};

export type Column<T> = { header: string; cell: (item: T) => ReactNode };

/** Filas de un detalle: etiqueta y contenido. */
export function DetailList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="space-y-4">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-xs font-medium text-ink-soft">{row.label}</dt>
          <dd className="mt-0.5 text-sm text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type Props<T extends { id: string }> = {
  projectId: string;
  path: string;
  title?: string;
  singular: string;
  canEdit: boolean;
  columns: Column<T>[];
  fields: FieldDef[];
  defaults: Values;
  emptyText: string;
  /** Ajusta los valores tras cada cambio, por ejemplo para limpiar opciones que dejan de valer. */
  normalize?: (values: Values) => Values;
  itemLabel: (item: T) => string;
  onChanged?: () => void;
  /** Si existe, cada fila tiene un botón Ver que abre este detalle en una ventana. */
  detail?: { title: (item: T) => string; render: (item: T) => ReactNode };
  /** Botón «Exportar CSV» con las filas que la página ya tiene. */
  csv?: { filename: () => string; columns: CsvColumn<T>[] };
};

export const registerKey = (projectId: string, path: string) => ['project', projectId, path];

function RegisterForm({
  title,
  fields,
  initial,
  normalize,
  onSubmit,
  onClose,
  notice,
}: {
  title: string;
  fields: FieldDef[];
  initial: Values;
  normalize?: (values: Values) => Values;
  onSubmit: (values: Values) => Promise<unknown>;
  onClose: () => void;
  /** Aviso que se muestra al abrir, por ejemplo tras un choque de ediciones. */
  notice?: string;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const setField = (name: string, value: unknown) => {
    const next = { ...values, [name]: value };
    setValues(normalize ? normalize(next) : next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalidMoney = fields.find((f) => f.type === 'money' && !f.nullable && values[f.name] === null);
    if (invalidMoney) {
      setErrors({ fields: { [invalidMoney.name]: INVALID_MONEY_MESSAGE } });
      return;
    }
    setErrors(NO_ERRORS);
    setBusy(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message ?? notice} />
        {fields.map((field) => (
          <FormField key={field.name} label={field.label} error={errors.fields[field.name]} hint={field.hint?.(values)}>
            {field.type === 'money' ? (
              <MoneyInput value={values[field.name]} onChange={(cents) => setField(field.name, cents)} />
            ) : field.type === 'select' ? (
              <select
                className={inputClass}
                value={values[field.name] ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  setField(field.name, field.nullable && raw === '' ? null : field.numeric ? Number(raw) : raw);
                }}
              >
                {field.nullable && <option value="">{field.emptyLabel ?? 'Sin asignar'}</option>}
                {(typeof field.options === 'function' ? field.options(values) : (field.options ?? [])).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'richtext' ? (
              <RichTextEditor label={field.label} value={values[field.name] ?? ''} onChange={(html) => setField(field.name, html)} />
            ) : field.type === 'textarea' ? (
              <textarea className={inputClass} rows={3} value={values[field.name] ?? ''} onChange={(e) => setField(field.name, e.target.value)} />
            ) : (
              <input
                className={inputClass}
                type={field.type}
                value={values[field.name] ?? ''}
                onChange={(e) => setField(field.name, e.target.value)}
              />
            )}
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

/** Lista con alta, edición y baja para los registros de un proyecto. */
export function RegisterTable<T extends { id: string }>(props: Props<T>) {
  const { projectId, path, title, singular, canEdit, columns, fields, defaults, emptyText, normalize, itemLabel, onChanged, detail, csv } = props;
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = registerKey(projectId, path);
  const base = `/api/projects/${projectId}/${path}`;
  const list = useQuery({ queryKey: key, queryFn: () => api<T[]>(base) });
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  // Tras un choque se vuelve a montar el formulario con la versión guardada y el aviso.
  const [conflict, setConflict] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState<T | null>(null);
  // Se guarda el id y no una copia: así el detalle abierto refleja los datos recargados.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = list.data?.find((item) => item.id === viewingId) ?? null;
  const showActions = canEdit || Boolean(detail);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: ['project', projectId, 'indicators'] });
    onChanged?.();
  };

  const remove = useMutation({
    mutationFn: (item: T) => api(`${base}/${item.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setDeleting(null),
  });

  const save = async (values: Values) => {
    const body = Object.fromEntries(fields.map((f) => [f.name, f.type === 'date' && values[f.name] === '' ? null : values[f.name]]));
    if (editing === 'new') await api(base, { method: 'POST', body });
    else if (editing) {
      const { version } = editing as { version?: number };
      try {
        await api(`${base}/${editing.id}`, { method: 'PATCH', body: version === undefined ? body : { ...body, version } });
      } catch (error) {
        if (isEditConflict(error)) {
          await refresh();
          const fresh = queryClient.getQueryData<T[]>(key)?.find((item) => item.id === editing.id);
          if (fresh) {
            setEditing(fresh);
            setConflict(true);
            setFormKey((n) => n + 1);
          }
        }
        throw error;
      }
    }
    await refresh();
  };

  const newButton = canEdit ? <Button variant="secondary" onClick={() => setEditing('new')}>{`Añadir ${singular}`}</Button> : undefined;
  const csvButton =
    csv && list.data && list.data.length > 0 ? (
      <Button variant="ghost" onClick={() => downloadCsv(csv.filename(), toCsv(csv.columns, list.data!))}>
        Exportar CSV
      </Button>
    ) : undefined;
  const actions = newButton || csvButton ? (
    <div className="flex flex-wrap gap-2">
      {csvButton}
      {newButton}
    </div>
  ) : undefined;

  return (
    <Card title={title} actions={actions}>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink-soft uppercase">
              <tr>
                {columns.map((column) => (
                  <th key={column.header} className="py-2 pr-4 font-medium">
                    {column.header}
                  </th>
                ))}
                {showActions && (
                  <th className="py-2 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.data.map((item) => (
                <tr key={item.id}>
                  {columns.map((column) => (
                    <td key={column.header} className="py-2 pr-4 align-top text-ink-nav">
                      {column.cell(item)}
                    </td>
                  ))}
                  {showActions && (
                    <td className="py-1 text-right whitespace-nowrap">
                      {detail && (
                        <Button variant="ghost" aria-label={`Ver ${itemLabel(item)}`} onClick={() => setViewingId(item.id)}>
                          Ver
                        </Button>
                      )}
                      {canEdit && (
                        <>
                          <Button variant="ghost" aria-label={`Editar ${itemLabel(item)}`} onClick={() => setEditing(item)}>
                            Editar
                          </Button>
                          <Button variant="ghost" aria-label={`Eliminar ${itemLabel(item)}`} onClick={() => setDeleting(item)}>
                            Eliminar
                          </Button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <RegisterForm
          key={formKey}
          notice={conflict ? EDIT_CONFLICT_NOTICE : undefined}
          title={editing === 'new' ? `Añadir ${singular}` : `Editar ${singular}`}
          fields={fields}
          initial={editing === 'new' ? defaults : (editing as Values)}
          normalize={normalize}
          onSubmit={save}
          onClose={() => {
            setEditing(null);
            setConflict(false);
          }}
        />
      )}
      {viewing && detail && (
        <Modal title={detail.title(viewing)} onClose={() => setViewingId(null)} wide>
          {detail.render(viewing)}
          <div className="mt-6 flex justify-end">
            <Button variant="secondary" onClick={() => setViewingId(null)}>
              Cerrar
            </Button>
          </div>
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog title={`Eliminar ${singular}`} danger confirmLabel="Eliminar" onCancel={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting)}>
          Se eliminará «{itemLabel(deleting)}» de forma permanente.
        </ConfirmDialog>
      )}
    </Card>
  );
}
