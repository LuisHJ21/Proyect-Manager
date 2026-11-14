import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Notification, NotificationPage } from '../api/types';
import { describeNotification, notificationLink, relativeTime } from '../lib/notifications';
import { Button } from './ui';

const KEY = ['notifications'] as const;

function NotificationList({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pages = useInfiniteQuery({
    queryKey: [...KEY, 'list'],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api<NotificationPage>(`/api/notifications${pageParam ? `?before=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const now = new Date();
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const open = async (n: Notification) => {
    if (!n.readAt) await api(`/api/notifications/${n.id}/read`, { method: 'POST', body: {} }).catch(() => undefined);
    void refresh();
    onClose();
    navigate(notificationLink(n));
  };
  const readAll = async () => {
    await api('/api/notifications/read-all', { method: 'POST', body: {} });
    void refresh();
  };

  return (
    <div role="dialog" aria-label="Avisos" className="fixed top-16 right-4 z-50 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-xl border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Avisos</h2>
        <button type="button" onClick={() => void readAll()} className="cursor-pointer text-xs font-medium text-link hover:underline">
          Marcar todo como leído
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pages.isPending ? (
          <p className="px-4 py-6 text-sm text-ink-soft">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">No tienes avisos</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => void open(n)} className="flex w-full cursor-pointer gap-2.5 px-4 py-3 text-left hover:bg-raised">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? '' : 'bg-primary'}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className={`block text-sm text-ink ${n.readAt ? '' : 'font-semibold'}`}>{describeNotification(n)}</span>
                    <span className="block text-xs text-ink-soft">{`${n.projectName} · ${relativeTime(n.createdAt, now)}`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {pages.hasNextPage && (
          <div className="px-4 py-3">
            <Button variant="secondary" onClick={() => pages.fetchNextPage()} disabled={pages.isFetchingNextPage}>
              Ver más
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Campana con los avisos sin leer; abre la lista de avisos. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const count = useQuery({
    queryKey: [...KEY, 'count'],
    queryFn: () => api<{ count: number }>('/api/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const unread = count.data?.count ?? 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : 'Avisos'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-ink-nav hover:bg-raised"
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Cerrar avisos" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <NotificationList onClose={() => setOpen(false)} />
        </>
      )}
    </>
  );
}
