import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES } from '@pm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ChangeEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Attachment } from '../../api/types';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorState, Loading } from '../ErrorState';
import { FormMessage } from '../FormField';
import { Button } from '../ui';

type Scope = { projectId: string } | { taskId: string };

type Props = { scope: Scope; canUpload: boolean; isPm: boolean; currentUserId?: string };

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function AttachmentList({ scope, canUpload, isPm, currentUserId }: Props) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const base = 'taskId' in scope ? `/api/tasks/${scope.taskId}/attachments` : `/api/projects/${scope.projectId}/attachments`;
  const key = ['attachments', base];
  const list = useQuery({ queryKey: key, queryFn: () => api<Attachment[]>(base) });
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState<Attachment | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api(base, { method: 'POST', formData });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (attachment: Attachment) => api(`/api/attachments/${attachment.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => setError(errorMessage(e)),
    onSettled: () => setDeleting(null),
  });

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError(undefined);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('El archivo supera el límite de 25 MB');
      return;
    }
    upload.mutate(file);
  };

  return (
    <div>
      <FormMessage message={error} />
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className="text-sm text-slate-500">Sin anexos.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.data.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <a href={`/api/attachments/${attachment.id}/download`} className="block truncate font-medium text-indigo-700 hover:underline">
                  {attachment.originalName}
                </a>
                <p className="text-xs text-slate-500">
                  {formatSize(attachment.size)} · {attachment.uploadedBy.name}
                </p>
              </div>
              {(isPm || attachment.uploadedBy.id === currentUserId) && (
                <Button variant="ghost" aria-label={`Eliminar ${attachment.originalName}`} onClick={() => setDeleting(attachment)}>
                  Eliminar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="mt-3">
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
            Adjuntar archivo
          </label>
          <input id={inputId} type="file" accept={ACCEPT_ATTRIBUTE} onChange={onPick} disabled={upload.isPending} className="block w-full text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
          <p className="mt-1 text-xs text-slate-500">{upload.isPending ? 'Subiendo…' : 'Hasta 25 MB. PDF, Office, imágenes, TXT, CSV o ZIP.'}</p>
        </div>
      )}
      {deleting && (
        <ConfirmDialog title="Eliminar anexo" danger confirmLabel="Eliminar" onCancel={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting)}>
          Se eliminará «{deleting.originalName}» de forma permanente.
        </ConfirmDialog>
      )}
    </div>
  );
}
