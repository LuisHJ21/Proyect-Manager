import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Comment } from '../../api/types';
import { FormField, FormMessage } from '../FormField';
import { Button, inputClass } from '../ui';
import { taskKey } from './taskQueries';

export function CommentList({ taskId, comments, canComment }: { taskId: string; comments: Comment[]; canComment: boolean }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string>();

  const post = useMutation({
    mutationFn: () => api(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { body } }),
    onSuccess: () => {
      setBody('');
      return queryClient.invalidateQueries({ queryKey: taskKey(taskId) });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    post.mutate();
  };

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Comentarios</h3>
      {comments.length === 0 && <p className="text-sm text-slate-500">Sin comentarios.</p>}
      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="text-sm">
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">{comment.author.name}</span> · {new Date(comment.createdAt).toLocaleString('es')}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-slate-800">{comment.body}</p>
          </li>
        ))}
      </ul>
      {canComment && (
        <form onSubmit={submit} className="mt-3 space-y-2" noValidate>
          <FormMessage message={error} />
          <FormField label="Nuevo comentario">
            <textarea className={inputClass} rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
          </FormField>
          <Button type="submit" variant="secondary" disabled={post.isPending || !body.trim()}>
            Comentar
          </Button>
        </form>
      )}
    </div>
  );
}
