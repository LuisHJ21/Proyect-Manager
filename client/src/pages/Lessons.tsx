import { LABELS, LESSON_CATEGORY, LESSON_TYPE } from '@pm/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Lesson } from '../api/types';
import { ErrorState, Loading } from '../components/ErrorState';
import { LessonCard } from '../components/lessons/LessonCard';
import { Card, EmptyState, inputClass } from '../components/ui';

/** Lecciones aprendidas de todos los proyectos, para consultar antes de empezar uno nuevo. */
export function LessonsLibraryPage() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (type) params.set('type', type);
  if (projectId) params.set('projectId', projectId);
  const query = params.toString();
  const list = useQuery({ queryKey: ['lessons', query], queryFn: () => api<Lesson[]>(`/api/lessons${query ? `?${query}` : ''}`) });
  // Las opciones de proyecto salen de todas las lecciones, sin filtrar.
  const all = useQuery({ queryKey: ['lessons', ''], queryFn: () => api<Lesson[]>('/api/lessons') });
  const projects = [...new Map((all.data ?? []).map((l) => [l.project.id, l.project.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));

  return (
    <div className="space-y-6">
      <h1 className="text-[26px] font-semibold text-ink">Lecciones aprendidas</h1>
      <Card title="Buscar lecciones">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-ink-nav">
            <span className="mb-1 block font-medium">Buscar</span>
            <input aria-label="Buscar" type="search" className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Texto de la lección" />
          </label>
          <label className="text-sm text-ink-nav">
            <span className="mb-1 block font-medium">Categoría</span>
            <select aria-label="Categoría" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas</option>
              {LESSON_CATEGORY.map((c) => (
                <option key={c} value={c}>
                  {LABELS.lessonCategory[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-nav">
            <span className="mb-1 block font-medium">Tipo</span>
            <select aria-label="Tipo" className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos</option>
              {LESSON_TYPE.map((t) => (
                <option key={t} value={t}>
                  {LABELS.lessonType[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-nav">
            <span className="mb-1 block font-medium">Proyecto</span>
            <select aria-label="Proyecto" className={inputClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Todos</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState>No hay lecciones que coincidan.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((l) => (
            <LessonCard key={l.id} lesson={l} showProject />
          ))}
        </div>
      )}
    </div>
  );
}
