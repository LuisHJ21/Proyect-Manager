import { toPlainText } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Requirement } from '../../api/types';

export const requirementsKey = (projectId: string) => ['project', projectId, 'requirements'];
export const traceabilityKey = (projectId: string) => ['project', projectId, 'traceability'];
export const requirementCode = (r: { number: number }) => `REQ-${r.number}`;
const short = (html: string) => {
  const text = toPlainText(html);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
};

/** Casillas para elegir los requisitos afectados por una solicitud de cambio. */
export function RequirementPicker({ projectId, selected, onChange }: { projectId: string; selected: string[]; onChange: (ids: string[]) => void }) {
  const query = useQuery({ queryKey: requirementsKey(projectId), queryFn: () => api<Requirement[]>(`/api/projects/${projectId}/requirements`) });
  const items = query.data ?? [];
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink">Requisitos afectados</legend>
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">{query.isPending ? 'Cargando…' : 'El proyecto no tiene requisitos.'}</p>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {items.map((r) => (
            <label key={r.id} className="flex items-start gap-1.5 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(r.id)}
                onChange={() => onChange(selected.includes(r.id) ? selected.filter((id) => id !== r.id) : [...selected, r.id])}
              />
              {`${requirementCode(r)} · ${short(r.description)}`}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
