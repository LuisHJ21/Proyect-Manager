import { LABELS } from '@pm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, errorMessage, isBlockingError, isEditConflict } from '../../api/client';
import type { Charter } from '../../api/types';
import { ErrorState, Loading } from '../../components/ErrorState';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../../components/FormField';
import { RichTextEditor } from '../../components/richText/RichTextEditor';
import { RichTextView } from '../../components/richText/RichTextView';
import { Badge, Button, Card, inputClass } from '../../components/ui';
import { useProject } from './ProjectLayout';
import { AssumptionsRegister } from '../../components/assumptions/AssumptionsRegister';

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

const CONFLICT_MESSAGE = 'Otra persona guardó cambios en el acta mientras editabas. Tu texto sigue aquí para que lo copies; luego carga la versión actual.';

const toDraft = (charter: Charter): Draft => Object.fromEntries(FIELDS.map((f) => [f.name, charter[f.name]])) as Draft;

function ApprovalNote({ charter }: { charter: Charter }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-nav">
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
            <dt className="text-xs font-medium text-ink-soft">{field.label}</dt>
            <dd className="mt-0.5">
              {field.rows === 1 ? <span className="text-sm text-ink">{charter[field.name] || '—'}</span> : <RichTextView html={charter[field.name]} />}
            </dd>
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
  // Tras un choque el borrador se conserva para copiarlo; no se guarda hasta cargar la versión actual.
  const [conflict, setConflict] = useState(false);
  // Versión sobre la que se escribió el borrador. Una recarga en segundo plano no la mueve: si otra
  // persona guardó mientras tanto, el guardado debe chocar en vez de pisar su texto.
  const [baseVersion, setBaseVersion] = useState(charter.version);

  useEffect(() => {
    if (charter.version === baseVersion) {
      setSaved(toDraft(charter));
    } else if (FIELDS.every((f) => draft[f.name] === saved[f.name])) {
      // Sin cambios propios: se adopta la versión nueva.
      setSaved(toDraft(charter));
      setDraft(toDraft(charter));
      setBaseVersion(charter.version);
    }
    // Con cambios propios sobre una versión vieja se deja todo como está: guardar responderá con el choque.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charter]);

  const dirty = FIELDS.some((f) => draft[f.name] !== saved[f.name]);

  const run = async (action: 'save' | 'approve') => {
    setErrors(NO_ERRORS);
    setNotice('');
    setBusy(true);
    try {
      let result = charter;
      let version = baseVersion;
      if (dirty) {
        result = await api<Charter>(url, { method: 'PUT', body: { ...draft, version } });
        version = result.version;
      }
      if (action === 'approve') result = await api<Charter>(`${url}/approve`, { method: 'POST', body: { version } });
      queryClient.setQueryData(['project', projectId, 'charter'], result);
      // El servidor devuelve el HTML ya limpio, que puede diferir del del editor (por ejemplo <br /> frente a <br>).
      // El borrador toma lo guardado para que no queden cambios pendientes falsos.
      setSaved(toDraft(result));
      setDraft(toDraft(result));
      setBaseVersion(result.version);
      setNotice(action === 'approve' ? 'Acta aprobada.' : 'Cambios guardados.');
    } catch (error) {
      if (isEditConflict(error)) setConflict(true);
      else applyFieldErrors(error, setErrors);
      void queryClient.invalidateQueries({ queryKey: ['project', projectId, 'charter'] });
    } finally {
      setBusy(false);
    }
  };

  const loadCurrent = async () => {
    setBusy(true);
    try {
      const fresh = await queryClient.fetchQuery({ queryKey: ['project', projectId, 'charter'], queryFn: () => api<Charter>(url), staleTime: 0 });
      setSaved(toDraft(fresh));
      setDraft(toDraft(fresh));
      setBaseVersion(fresh.version);
      setConflict(false);
    } catch (error) {
      setErrors({ fields: {}, message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <ApprovalNote charter={charter} />
      {conflict && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-risk-bg px-3 py-2 text-sm text-risk-fg">
          <span>{CONFLICT_MESSAGE}</span>
          <Button variant="secondary" disabled={busy} onClick={() => void loadCurrent()}>
            Cargar la versión actual
          </Button>
        </div>
      )}
      {charter.status === 'APPROVED' && dirty && (
        <p role="status" className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
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
              <RichTextEditor
                label={field.label}
                value={draft[field.name]}
                minHeight={field.rows >= 4 ? 'md' : 'sm'}
                onChange={(html) => setDraft((current) => ({ ...current, [field.name]: html }))}
              />
            )}
          </FormField>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary" disabled={busy || !dirty || conflict}>
            Guardar
          </Button>
          {(charter.status !== 'APPROVED' || dirty) && (
            <Button disabled={busy || conflict} onClick={() => void run('approve')}>
              Aprobar acta
            </Button>
          )}
          {notice && (
            <span role="status" className="text-sm text-ok-fg">
              {notice}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

export function CharterPage() {
  const { project, isPm, readOnly } = useProject();
  const charter = useQuery({
    queryKey: ['project', project.id, 'charter'],
    queryFn: () => api<Charter>(`/api/projects/${project.id}/charter`),
  });

  if (charter.isPending) return <Loading />;
  if (isBlockingError(charter)) return <ErrorState message={errorMessage(charter.error)} onRetry={() => charter.refetch()} />;
  return (
    <div className="space-y-6">
      {isPm && !readOnly ? <CharterForm projectId={project.id} charter={charter.data!} /> : <CharterReadOnly charter={charter.data!} />}
      <AssumptionsRegister projectId={project.id} charterText={charter.data?.assumptions ?? ''} canEdit={isPm && !readOnly} />
    </div>
  );
}
