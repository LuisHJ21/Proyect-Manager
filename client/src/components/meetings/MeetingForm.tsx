import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { Meeting, Member, Stakeholder } from '../../api/types';
import { Modal } from '../ConfirmDialog';
import { applyFieldErrors, FormField, FormMessage, NO_ERRORS, type FormErrors } from '../FormField';
import { membersKey } from '../project/MembersPanel';
import { registerKey } from '../RegisterTable';
import { RichTextEditor } from '../richText/RichTextEditor';
import { Button, inputClass } from '../ui';

type AgreementDraft = { id?: string; text: string; ownerId: string | null; dueDate: string | null; locked: boolean };

function CheckList({ legend, people, selected, onToggle }: { legend: string; people: { id: string; name: string }[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink">{legend}</legend>
      {people.length === 0 ? (
        <p className="text-sm text-ink-soft">Nadie para elegir.</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-1.5 text-sm text-ink">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => onToggle(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** Crear o editar un acta. Un acuerdo ya convertido no se puede quitar ni cambiar de texto. */
export function MeetingForm({ projectId, meeting, onClose, onSaved }: { projectId: string; meeting?: Meeting; onClose: () => void; onSaved: (m: Meeting) => void }) {
  const members = useQuery({ queryKey: membersKey(projectId), queryFn: () => api<Member[]>(`/api/projects/${projectId}/members`) });
  const stakeholders = useQuery({ queryKey: registerKey(projectId, 'stakeholders'), queryFn: () => api<Stakeholder[]>(`/api/projects/${projectId}/stakeholders`) });
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [date, setDate] = useState(meeting?.date ?? '');
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [userIds, setUserIds] = useState<string[]>(meeting?.attendees.users.map((u) => u.id) ?? []);
  const [stakeholderIds, setStakeholderIds] = useState<string[]>(meeting?.attendees.stakeholders.map((s) => s.id) ?? []);
  const [agreements, setAgreements] = useState<AgreementDraft[]>(
    meeting?.agreements.map((a) => ({ id: a.id, text: a.text, ownerId: a.owner?.id ?? null, dueDate: a.dueDate, locked: a.convertedTo !== null })) ?? [],
  );
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  // Quien ya dejó el proyecto sigue en el acta: se muestra para poder conservarlo o quitarlo.
  const memberIds = new Set(members.data?.map((m) => m.userId) ?? []);
  const former = (person: { id: string; name: string }) => ({ id: person.id, name: `${person.name} (ya no es miembro)` });
  const formerPeople = [...(meeting?.attendees.users ?? []), ...(meeting?.agreements.flatMap((a) => (a.owner ? [a.owner] : [])) ?? [])].filter(
    (p, i, list) => members.data && !memberIds.has(p.id) && list.findIndex((x) => x.id === p.id) === i,
  );
  const team = [...(members.data?.map((m) => ({ id: m.userId, name: m.name })) ?? []), ...formerPeople.filter((p) => meeting?.attendees.users.some((u) => u.id === p.id)).map(former)];
  const owners = [...(members.data?.filter((m) => m.role !== 'OBSERVER').map((m) => ({ id: m.userId, name: m.name })) ?? []), ...formerPeople.map(former)];
  // Errores que el formulario no muestra junto a un campo (por ejemplo, de un acuerdo concreto).
  const shown = new Set(['title', 'date', 'notes', 'userIds', 'stakeholderIds', 'agreements']);
  const agreementError = (index: number) =>
    Object.entries(errors.fields).find(([key]) => key.startsWith(`agreements.${index}.`))?.[1];
  const otherError = Object.entries(errors.fields).find(([key]) => !shown.has(key) && !/^agreements\.\d+\./.test(key))?.[1];
  const setAgreement = (index: number, patch: Partial<AgreementDraft>) => setAgreements((list) => list.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors(NO_ERRORS);
    setBusy(true);
    const body = {
      title,
      date,
      notes,
      userIds,
      stakeholderIds,
      agreements: agreements.map(({ id, text, ownerId, dueDate }) => ({ ...(id ? { id } : {}), text, ownerId, dueDate })),
    };
    try {
      const saved = meeting
        ? await api<Meeting>(`/api/projects/${projectId}/meetings/${meeting.id}`, { method: 'PATCH', body })
        : await api<Meeting>(`/api/projects/${projectId}/meetings`, { method: 'POST', body });
      onSaved(saved);
    } catch (error) {
      applyFieldErrors(error, setErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={meeting ? 'Editar reunión' : 'Nueva reunión'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormMessage message={errors.message ?? otherError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Título" error={errors.fields.title}>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label="Fecha" error={errors.fields.date}>
            <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        </div>
        <CheckList legend="Asistentes del equipo" people={team} selected={userIds} onToggle={(id) => setUserIds((l) => toggle(l, id))} />
        {errors.fields.userIds && <p className="text-sm text-danger">{errors.fields.userIds}</p>}
        <CheckList legend="Interesados" people={stakeholders.data ?? []} selected={stakeholderIds} onToggle={(id) => setStakeholderIds((l) => toggle(l, id))} />
        {errors.fields.stakeholderIds && <p className="text-sm text-danger">{errors.fields.stakeholderIds}</p>}
        <FormField label="Notas" error={errors.fields.notes} hint="Los asistentes del equipo verán estas notas">
          <RichTextEditor label="Notas" value={notes} onChange={setNotes} />
        </FormField>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Acuerdos</legend>
          {agreements.map((a, index) => (
            <div key={a.id ?? `new-${index}`} className="grid min-w-0 gap-2 rounded-md border border-line p-2 lg:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]">
              <input
                className={inputClass}
                aria-label={`Acuerdo ${index + 1}`}
                value={a.text}
                disabled={a.locked}
                title={a.locked ? 'Este acuerdo ya se convirtió' : undefined}
                onChange={(e) => setAgreement(index, { text: e.target.value })}
              />
              <select className={inputClass} aria-label={`Responsable del acuerdo ${index + 1}`} value={a.ownerId ?? ''} onChange={(e) => setAgreement(index, { ownerId: e.target.value || null })}>
                <option value="">Sin responsable</option>
                {owners.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input className={inputClass} type="date" aria-label={`Fecha del acuerdo ${index + 1}`} value={a.dueDate ?? ''} onChange={(e) => setAgreement(index, { dueDate: e.target.value || null })} />
              <Button variant="ghost" aria-label={`Quitar acuerdo ${index + 1}`} disabled={a.locked} onClick={() => setAgreements((list) => list.filter((_, i) => i !== index))}>
                <Trash2 size={16} aria-hidden="true" />
              </Button>
              {agreementError(index) && <p className="text-sm text-danger sm:col-span-4">{agreementError(index)}</p>}
            </div>
          ))}
          {errors.fields.agreements && <p className="text-sm text-danger">{errors.fields.agreements}</p>}
          <Button variant="secondary" onClick={() => setAgreements((list) => [...list, { text: '', ownerId: null, dueDate: null, locked: false }])}>
            <Plus size={16} aria-hidden="true" /> Añadir acuerdo
          </Button>
        </fieldset>
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
