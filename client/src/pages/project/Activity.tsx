import { LABELS, localToday } from '@pm/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, isBlockingError, errorMessage } from '../../api/client';
import type { ActivityFilters, ActivityLog, ActivityPage } from '../../api/types';
import { ErrorState, Loading } from '../../components/ErrorState';
import { Button, Card, EmptyState, inputClass } from '../../components/ui';
import { describeActivity, describeChanges } from '../../lib/activity';
import { shortDate } from '../../lib/display';
import { useProject } from './ProjectLayout';

const activityKey = (projectId: string) => ['activity', projectId] as const;

const time = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Registros agrupados por día local, en el orden en que llegan (del más reciente al más antiguo). */
function byDay(items: ActivityLog[]): { day: string; items: ActivityLog[] }[] {
  const groups: { day: string; items: ActivityLog[] }[] = [];
  for (const item of items) {
    const day = localToday(new Date(item.createdAt));
    const group = groups.at(-1);
    if (group?.day === day) group.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/** Bitácora del proyecto: quién hizo qué y cuándo. Solo la ve el PM. */
export function ActivityPage() {
  const { project } = useProject();
  const [userId, setUserId] = useState('');
  const [entity, setEntity] = useState('');
  const filters = useQuery({
    queryKey: [...activityKey(project.id), 'filters'],
    queryFn: () => api<ActivityFilters>(`/api/projects/${project.id}/activity/filters`),
  });
  const pages = useInfiniteQuery({
    queryKey: [...activityKey(project.id), { userId, entity }],
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      if (userId) query.set('userId', userId);
      if (entity) query.set('entity', entity);
      if (pageParam) query.set('before', pageParam);
      const qs = query.toString();
      return api<ActivityPage>(`/api/projects/${project.id}/activity${qs ? `?${qs}` : ''}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const today = localToday(new Date());

  return (
    <Card title="Actividad">
      <div className="mb-4 flex flex-wrap gap-4">
        <label className="text-sm text-ink-nav">
          <span className="mb-1 block font-medium">Persona</span>
          <select className={inputClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Todas</option>
            {filters.data?.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-nav">
          <span className="mb-1 block font-medium">Tipo</span>
          <select className={inputClass} value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Todos</option>
            {filters.data?.entities.map((e) => (
              <option key={e} value={e}>
                {LABELS.activityEntity[e]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pages.isPending ? (
        <Loading />
      ) : isBlockingError(pages) ? (
        <ErrorState message={errorMessage(pages.error)} onRetry={() => pages.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState>Aún no hay actividad registrada.</EmptyState>
      ) : (
        <>
          {byDay(items).map((group) => (
            <section key={group.day} className="mb-5">
              <h2 className="mb-2 text-[13px] font-semibold text-ink-soft">{group.day === today ? 'Hoy' : shortDate(group.day)}</h2>
              <ul className="divide-y divide-line">
                {group.items.map((item) => {
                  const sentence = describeActivity(item);
                  const { valued, others } = describeChanges(item, project.currency ?? 'USD');
                  return (
                    <li key={item.id} aria-label={`${item.user.name} ${sentence}`} className="flex gap-3 py-2 text-sm">
                      <span className="w-12 shrink-0 tabular-nums text-ink-soft">{time(item.createdAt)}</span>
                      <div className="min-w-0">
                        <p className="text-ink">
                          <span className="font-medium">{item.user.name}</span> <span>{sentence}</span>
                          {others.length > 0 && <span className="text-ink-soft"> {`(también cambió: ${others.join(', ')})`}</span>}
                        </p>
                        {valued.length > 0 && <p className="text-[13px] text-ink-soft">{valued.join(' · ')}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {pages.hasNextPage && (
            <Button variant="secondary" onClick={() => pages.fetchNextPage()} disabled={pages.isFetchingNextPage}>
              Ver más
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
