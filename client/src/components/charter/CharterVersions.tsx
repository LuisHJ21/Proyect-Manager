import { localToday } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { CharterVersionDetail, CharterVersionSummary } from '../../api/types';
import { shortDate } from '../../lib/display';
import { Modal } from '../ConfirmDialog';
import { Button, Card } from '../ui';
import { CharterContent } from './CharterPrint';

export const charterVersionsKey = (projectId: string) => ['project', projectId, 'charter', 'versions'];

function VersionDialog({ projectId, number, onPrint, onClose }: { projectId: string; number: number; onPrint: (version: CharterVersionDetail) => void; onClose: () => void }) {
  const version = useQuery({
    queryKey: [...charterVersionsKey(projectId), number],
    queryFn: () => api<CharterVersionDetail>(`/api/projects/${projectId}/charter/versions/${number}`),
  });
  return (
    <Modal title={`Versión ${number} del acta`} onClose={onClose} wide>
      {version.isPending && <p className="text-sm text-ink-soft">Cargando…</p>}
      {version.isError && <p className="text-sm text-risk-fg">{errorMessage(version.error)}</p>}
      {version.data && (
        <div className="space-y-4">
          <CharterContent content={version.data.content} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button onClick={() => onPrint(version.data!)}>Imprimir / Guardar PDF</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Versiones congeladas en cada aprobación (F18); no se editan ni se borran. */
export function CharterVersions({ projectId, onPrint }: { projectId: string; onPrint: (version: CharterVersionDetail) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const versions = useQuery({ queryKey: charterVersionsKey(projectId), queryFn: () => api<CharterVersionSummary[]>(`/api/projects/${projectId}/charter/versions`) });
  if (!versions.data || versions.data.length === 0) return null;
  return (
    <div role="region" aria-label="Versiones aprobadas">
      <Card title="Versiones aprobadas">
        <ul className="divide-y divide-line text-sm">
          {versions.data.map((v) => (
            <li key={v.number} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-medium text-ink">{`Versión ${v.number}`}</span>
              <span className="text-ink-nav">{`${shortDate(localToday(new Date(v.approvedAt)))} · ${v.approvedBy?.name ?? 'una cuenta eliminada'}`}</span>
              <Button variant="ghost" className="ml-auto" aria-label={`Ver versión ${v.number}`} onClick={() => setOpen(v.number)}>
                Ver
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      {open !== null && (
        <VersionDialog
          projectId={projectId}
          number={open}
          onClose={() => setOpen(null)}
          onPrint={(version) => {
            setOpen(null);
            onPrint(version);
          }}
        />
      )}
    </div>
  );
}
