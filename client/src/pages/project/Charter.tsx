import { LABELS } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, errorMessage, isBlockingError } from '../../api/client';
import type { Charter } from '../../api/types';
import { ErrorState, Loading } from '../../components/ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../../components/FormField';
import { Badge, Button, Card, inputClass } from '../../components/ui';
import { useProject } from './ProjectLayout';

const FIELDS = [
  { name: 'sponsor', label: 'Patrocinador', rows: 1 },
  { name: 'justification', label: 'Justificación', rows: 4 },
  { name: 'scopeIncluded', label: 'Alcance incluido', rows: 4 },
  { name: 'scopeExcluded', label: 'Alcance excluido', rows: 3 },
  { name: 'boundaries', label: 'Límites', rows: 3 },
  { name: 'assumptions', label: 'Supuestos', rows: 3 },
  { name: 'constraints', label: 'Restricciones', rows: 3 },
  { name: 'successCriteria', label: 'Criterios de éxito', rows: 4 },
] as const;

type FieldName = (typeof FIELDS)[number]['name'];
type Draft = Record<FieldName, string>;

const toDraft = (charter: Charter): Draft => Object.fromEntries(FIELDS.map((f) => [f.name, charter[f.name]])) as Draft;

function ApprovalNote({ charter }: { charter: Charter }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
      <Badge tone={charter.status === 'APPROVED' ? 'success' : 'warning'}>{LABELS.charterStatus[charter.status]}</Badge>
      {charter.status === 'APPROVED' && charter.approvedAt && (
        <span>
          Aprobada por {charter.approvedBy?.name ?? 'una cuenta eliminada'} el {new Date(charter.approvedAt).toLocaleDateString('es')}
        </span>
      )}
    </div>
  );
}

function CharterReadOnly({ charter }: { charter: Charter }) {
  return (
    <Card>
      <ApprovalNote charter={charter} />
      <dl className="mt-4 space-y-4">
        {FIELDS.map((field) => (
          <div key={field.name}>
            <dt className="text-xs font-medium text-slate-500">{field.label}</dt>
            <dd className="mt-0.5 text-sm whitespace-pre-wrap text-slate-800">{charter[field.name] || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function CharterForm({ projectId, charter }: { projectId: string; charter: Charter }) {
  const queryClient = useQueryClient();
  const url = `/api/projects/${projectId}/charter`;
  const [draft, setDraft] = useState<Draft>(() => toDraft(charter));
  const [saved, setSaved] = useState<Draft>(() => toDraft(charter));
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setSaved(toDraft(charter));
  }, [charter]);

  const dirty = FIELDS.some((f) => draft[f.name] !== saved[f.name]);

  const run = async (action: 'save' | 'approve') => {
    setErrors(NO_ERRORS);
    setNotice('');
    setBusy(true);
    try {
      let result = charter;
      if (dirty) result = await api<Charter>(url, { method: 'PUT', body: draft });
      if (action === 'approve') result = await api<Charter>(`${url}/approve`, { method: 'POST' });
      queryClient.setQueryData(['project', projectId, 'charter'], result);
      setSaved(toDraft(result));
      setNotice(action === 'approve' ? 'Acta aprobada.' : 'Cambios guardados.');
    } catch (error) {
      applyFieldErrors(error, setErrors);
      void queryClient.invalidateQueries({ queryKey: ['project', projectId, 'charter'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <ApprovalNote charter={charter} />
      {charter.status === 'APPROVED' && dirty && (
        <p role="status" className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Al guardar estos cambios, el acta volverá a Borrador y deberá aprobarse de nuevo.
        </p>
      )}
      <form
        className="mt-4 space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run('save');
        }}
      >
        <FormMessage message={errors.message} />
        {FIELDS.map((field) => (
          <FormField key={field.name} label={field.label} error={errors.fields[field.name]}>
            {field.rows === 1 ? (
              <input className={inputClass} value={draft[field.name]} onChange={(e) => setDraft({ ...draft, [field.name]: e.target.value })} />
            ) : (
              <textarea
                className={inputClass}
                rows={field.rows}
                value={draft[field.name]}
                onChange={(e) => setDraft({ ...draft, [field.name]: e.target.value })}
              />
            )}
          </FormField>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary" disabled={busy || !dirty}>
            Guardar
          </Button>
          {(charter.status !== 'APPROVED' || dirty) && (
            <Button disabled={busy} onClick={() => void run('approve')}>
              Aprobar acta
            </Button>
          )}
          {notice && (
            <span role="status" className="text-sm text-green-700">
              {notice}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

export function CharterPage() {
  const { project, isPm } = useProject();
  const charter = useQuery({
    queryKey: ['project', project.id, 'charter'],
    queryFn: () => api<Charter>(`/api/projects/${project.id}/charter`),
  });

  if (charter.isPending) return <Loading />;
  if (isBlockingError(charter)) return <ErrorState message={errorMessage(charter.error)} onRetry={() => charter.refetch()} />;
  return isPm ? <CharterForm projectId={project.id} charter={charter.data!} /> : <CharterReadOnly charter={charter.data!} />;
}
