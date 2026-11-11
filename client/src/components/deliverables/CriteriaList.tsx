import { useState } from 'react';
import type { DeliverableDetail } from '../../api/types';
import { Button, inputClass } from '../ui';

type Change = (path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: object) => Promise<boolean>;

/** Criterios de aceptación de un entregable. Con el entregable aceptado quedan de solo lectura. */
export function CriteriaList({ deliverable, change, busy, readOnly = false }: { deliverable: DeliverableDetail; change: Change; busy: boolean; readOnly?: boolean }) {
  const locked = readOnly || deliverable.status === 'ACCEPTED';
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const ids = deliverable.criteria.map((c) => c.id);

  const move = (index: number, delta: number) => {
    const next = [...ids];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    void change('/criteria/order', 'PUT', { ids: next });
  };

  const add = async () => {
    if (!draft.trim()) return;
    if (await change('/criteria', 'POST', { text: draft })) setDraft('');
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (await change(`/criteria/${editing.id}`, 'PATCH', { text: editing.text })) setEditing(null);
  };

  return (
    <section aria-label="Criterios de aceptación">
      <h3 className="mb-2 text-sm font-semibold text-ink">Criterios de aceptación</h3>
      {deliverable.criteria.length === 0 && <p className="text-sm text-ink-soft">Aún no hay criterios.</p>}
      <ul className="divide-y divide-line">
        {deliverable.criteria.map((c, index) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
            {editing?.id === c.id ? (
              <>
                <input
                  aria-label={`Texto de ${c.text}`}
                  className={`${inputClass} min-w-0 flex-1`}
                  value={editing.text}
                  onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                />
                <Button onClick={saveEdit} disabled={busy}>
                  Guardar
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    aria-label={c.text}
                    className="h-4 w-4 shrink-0 accent-primary"
                    checked={c.met}
                    disabled={locked || busy}
                    onChange={(e) => void change(`/criteria/${c.id}`, 'PATCH', { met: e.target.checked })}
                  />
                  <span className="[overflow-wrap:anywhere]">{c.text}</span>
                </label>
                {!locked && (
                  <span className="flex flex-wrap gap-1">
                    <Button variant="ghost" aria-label={`Editar criterio ${c.text}`} onClick={() => setEditing({ id: c.id, text: c.text })}>
                      Editar
                    </Button>
                    <Button variant="ghost" aria-label={`Subir ${c.text}`} disabled={index === 0 || busy} onClick={() => move(index, -1)}>
                      Subir
                    </Button>
                    <Button variant="ghost" aria-label={`Bajar ${c.text}`} disabled={index === ids.length - 1 || busy} onClick={() => move(index, 1)}>
                      Bajar
                    </Button>
                    <Button variant="ghost" aria-label={`Eliminar ${c.text}`} disabled={busy} onClick={() => void change(`/criteria/${c.id}`, 'DELETE')}>
                      Eliminar
                    </Button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {!locked && (
        <div className="mt-2 flex gap-2">
          <input aria-label="Nuevo criterio" className={inputClass} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nuevo criterio" />
          <Button variant="secondary" onClick={add} disabled={busy || !draft.trim()}>
            Añadir criterio
          </Button>
        </div>
      )}
    </section>
  );
}
