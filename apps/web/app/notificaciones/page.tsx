'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Archive, ArchiveRestore, CheckCheck, RefreshCw, Search } from 'lucide-react';
import { NotificationType, type NotificationCategory } from '@velar/types';
import { AppShell } from '../../components/AppShell';
import { notify } from '../../components/Toast';
import { apiFetch, type Me } from '../../lib/api';
import { buildInboxQueryString } from '../../lib/notifications/inbox-query';
import { PollingLiveSource } from '../../lib/notifications/live-source';

type InboxRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
  category?: string | null;
  archived_at?: string | null;
};

type ReadFilter = 'all' | 'unread' | 'archived';

const CATEGORIES: NotificationCategory[] = [
  'bond',
  'transfer',
  'payment',
  'report',
  'escrow',
  'system',
];

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  bond: 'Bonos',
  transfer: 'Transferencias',
  payment: 'Pagos',
  report: 'Reportes',
  escrow: 'Custodia (escrow)',
  system: 'Sistema',
};

const TYPE_LABELS: Partial<Record<string, string>> = {
  [NotificationType.OFFER_RECEIVED]: 'Nueva oferta recibida',
  [NotificationType.OFFER_ACCEPTED]: 'Oferta aceptada',
  [NotificationType.OFFER_REJECTED]: 'Oferta rechazada',
  [NotificationType.COUNTER_OFFER_RECEIVED]: 'Contraoferta recibida',
  [NotificationType.PAYMENT_CONFIRMED]: 'Pago confirmado',
  [NotificationType.BOND_APPROVED]: 'Bono aprobado',
  [NotificationType.BOND_REJECTED]: 'Solicitud de bono rechazada',
  [NotificationType.REPORT_SUBMITTED]: 'Reporte enviado al TSE',
  [NotificationType.REPORT_OBSERVED]: 'Reporte observado por el TSE',
  [NotificationType.REPORT_APPROVED]: 'Reporte aprobado',
  [NotificationType.REPORT_RESUBMITTED]: 'Reporte reenviado',
  bond: 'Bonos',
  transfer: 'Transferencias',
  payment: 'Pagos',
  report: 'Reportes',
  escrow: 'Custodia (escrow)',
  system: 'Sistema',
};

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v) return v;
  return undefined;
}

function titleFor(n: InboxRow): string {
  return str(n.payload.subject) ?? TYPE_LABELS[n.type] ?? 'Notificación';
}

function bodyFor(n: InboxRow): string {
  return str(n.payload.body) ?? '';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'hace un momento';
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export default function NotificacionesInboxPage() {
  return <AppShell>{({ token, me }) => <Content token={token} me={me} />}</AppShell>;
}

function Content({ token }: { token: string; me: Me }) {
  const [items, setItems] = useState<InboxRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<NotificationCategory | null>(null);
  const [grouped, setGrouped] = useState<Record<string, number>>({});
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [baselineLatestId, setBaselineLatestId] = useState<string | null>(null);
  const [liveLatestId, setLiveLatestId] = useState<string | null>(null);
  const [liveUnread, setLiveUnread] = useState(0);
  const [newCountHint, setNewCountHint] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // Debounce search ~300ms
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const filterParams = useCallback(() => {
    const read =
      readFilter === 'unread' ? ('false' as const) : undefined;
    const archived =
      readFilter === 'archived' ? ('true' as const) : ('false' as const);
    return {
      category: category ?? undefined,
      search: search || undefined,
      read,
      archived,
      limit: 20,
    };
  }, [category, search, readFilter]);

  const loadGrouped = useCallback(async () => {
    try {
      const data = (await apiFetch(token, 'GET', '/notifications/grouped')) as Record<
        string,
        number
      >;
      setGrouped(data ?? {});
    } catch {
      // Non-fatal: chips still work without counts.
    }
  }, [token]);

  const fetchPage = useCallback(
    async (cursor?: string) => {
      const qs = buildInboxQueryString({ ...filterParams(), cursor });
      const path = qs ? `/notifications/inbox?${qs}` : '/notifications/inbox';
      return (await apiFetch(token, 'GET', path)) as {
        notifications: InboxRow[];
        nextCursor: string | null;
      };
    },
    [token, filterParams],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelected(new Set());
    try {
      const [page] = await Promise.all([fetchPage(), loadGrouped()]);
      const rows = page.notifications ?? [];
      setItems(rows);
      setNextCursor(page.nextCursor);
      const firstId = rows[0]?.id ?? null;
      setBaselineLatestId(firstId);
      setLiveLatestId(firstId);
      setNewCountHint(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la bandeja');
      setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, loadGrouped]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextCursor);
      setItems((prev) => [...prev, ...(page.notifications ?? [])]);
      setNextCursor(page.nextCursor);
    } catch (e: unknown) {
      notify.err(e instanceof Error ? e.message : 'No se pudo cargar más');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, fetchPage]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  // Live badge via PollingLiveSource (same abstraction as the bell)
  useEffect(() => {
    const source = new PollingLiveSource(async () => {
      const data = (await apiFetch(token, 'GET', '/notifications')) as {
        notifications: InboxRow[];
        unreadCount: number;
      };
      return {
        unreadCount: data.unreadCount ?? 0,
        latestId: data.notifications?.[0]?.id ?? null,
      };
    });
    return source.subscribe((event) => {
      setLiveUnread(event.unreadCount);
      setLiveLatestId(event.latestId);
      if (event.latestId && baselineLatestId && event.latestId !== baselineLatestId) {
        setNewCountHint(Math.max(1, event.unreadCount));
      }
    });
  }, [token, baselineLatestId]);

  const hasNew =
    liveLatestId != null &&
    baselineLatestId != null &&
    liveLatestId !== baselineLatestId;

  async function bulkMarkRead() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      await apiFetch(token, 'PATCH', '/notifications/bulk-read', { ids });
      setItems((prev) =>
        prev.map((n) => (selected.has(n.id) ? { ...n, read: true } : n)),
      );
      setSelected(new Set());
      void loadGrouped();
      notify.ok('Marcadas como leídas');
    } catch (e: unknown) {
      notify.err(e instanceof Error ? e.message : 'No se pudieron marcar como leídas');
    }
  }

  async function toggleArchive(n: InboxRow) {
    const isArchived = Boolean(n.archived_at);
    try {
      await apiFetch(
        token,
        'PATCH',
        isArchived ? `/notifications/${n.id}/unarchive` : `/notifications/${n.id}/archive`,
      );
      setItems((prev) => prev.filter((row) => row.id !== n.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      void loadGrouped();
    } catch (e: unknown) {
      notify.err(e instanceof Error ? e.message : 'No se pudo actualizar el archivo');
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setSelected(new Set(items.map((n) => n.id)));
    } else {
      setSelected(new Set());
    }
  }

  const allVisibleSelected = items.length > 0 && items.every((n) => selected.has(n.id));
  const totalGrouped = Object.values(grouped).reduce((a, b) => a + b, 0);

  const liveAnnounce =
    hasNew
      ? `${newCountHint || liveUnread || 1} notificaciones nuevas disponibles`
      : '';

  return (
    <>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="mb-1 text-3xl font-bold tracking-tight md:text-4xl"
            style={{ fontFamily: 'Geist' }}
          >
            Notificaciones
          </h1>
          <p className="text-on-surface-variant">Tu bandeja completa, con filtros y archivo.</p>
        </div>
        <a
          href="/configuracion/notificaciones"
          className="text-sm font-medium text-primary-container hover:underline"
        >
          Preferencias
        </a>
      </div>

      {/* Visually-hidden live region for new-notification announcements */}
      <span className="sr-only" aria-live="polite">
        {liveAnnounce}
      </span>

      {hasNew && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary-container/30 bg-primary-container/5 px-4 py-3">
          <span className="rounded-full bg-primary-container px-2.5 py-0.5 text-xs font-semibold text-white">
            {newCountHint || liveUnread || 1} nuevas
          </span>
          <p className="text-sm text-on-surface">Hay notificaciones nuevas desde que abriste esta página.</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-sm font-medium text-primary-container transition hover:bg-primary-container/10"
          >
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip
          active={category === null}
          label={`Todas${totalGrouped ? ` (${totalGrouped})` : ''}`}
          onClick={() => setCategory(null)}
        />
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c}
            active={category === c}
            label={`${CATEGORY_LABELS[c]}${grouped[c] ? ` (${grouped[c]})` : ''}`}
            onClick={() => setCategory(c)}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          />
          <label htmlFor="inbox-search" className="sr-only">
            Buscar notificaciones
          </label>
          <input
            id="inbox-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar…"
            className="velar-input w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none"
          />
        </div>
        <div
          role="group"
          aria-label="Filtro de lectura"
          className="flex shrink-0 overflow-hidden rounded-xl border border-outline-variant/30"
        >
          {(
            [
              ['all', 'Todas'],
              ['unread', 'No leídas'],
              ['archived', 'Archivadas'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setReadFilter(value)}
              className={`px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                readFilter === value
                  ? 'bg-primary-container text-white'
                  : 'bg-surface text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low/50 px-4 py-2.5">
          <span className="text-sm text-on-surface-variant">{selected.size} seleccionadas</span>
          <button
            type="button"
            onClick={() => void bulkMarkRead()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-container px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <CheckCheck size={14} /> Marcar como leídas
          </button>
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-3 px-4 py-16 text-on-surface-variant">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary-container border-t-transparent" />
            Cargando bandeja…
          </div>
        ) : error ? (
          <div className="px-4 py-12 text-center">
            <p className="mb-3 text-sm text-error">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="text-sm font-semibold text-primary-container hover:underline"
            >
              Reintentar
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-on-surface-variant">
            No hay notificaciones con estos filtros.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-outline-variant/20 px-4 py-3">
              <input
                id="select-all-visible"
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-outline-variant text-primary-container focus:ring-primary-container"
              />
              <label htmlFor="select-all-visible" className="text-sm text-on-surface-variant">
                Seleccionar todas las visibles
              </label>
            </div>

            <ul role="feed" aria-busy={loadingMore} className="divide-y divide-outline-variant/15">
              {items.map((n) => {
                const checkId = `notif-check-${n.id}`;
                const isArchived = Boolean(n.archived_at);
                return (
                  <li
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 ${!n.read ? 'bg-primary-container/5' : ''}`}
                  >
                    <input
                      id={checkId}
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-outline-variant text-primary-container focus:ring-primary-container"
                    />
                    <label htmlFor={checkId} className="min-w-0 flex-1 cursor-pointer">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-on-surface">{titleFor(n)}</span>
                        {!n.read && (
                          <span className="h-2 w-2 rounded-full bg-primary" aria-label="No leída" />
                        )}
                        {n.category && CATEGORY_LABELS[n.category as NotificationCategory] && (
                          <span className="rounded-full bg-surface-container-low px-2 py-0.5 text-[11px] text-on-surface-variant">
                            {CATEGORY_LABELS[n.category as NotificationCategory]}
                          </span>
                        )}
                      </span>
                      {bodyFor(n) && (
                        <span className="mt-0.5 block text-xs text-on-surface-variant line-clamp-2">
                          {bodyFor(n)}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-outline">
                        {timeAgo(n.created_at)}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => void toggleArchive(n)}
                      aria-label={isArchived ? 'Desarchivar' : 'Archivar'}
                      className="shrink-0 rounded-full p-2 text-on-surface-variant transition hover:bg-surface-container-low hover:text-primary-container"
                    >
                      {isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div ref={sentinelRef} className="h-8" aria-hidden />
            {loadingMore && (
              <p className="px-4 py-3 text-center text-xs text-on-surface-variant">
                Cargando más…
              </p>
            )}
            {!nextCursor && items.length > 0 && (
              <p className="px-4 py-3 text-center text-xs text-outline">Fin de la lista</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
        active
          ? 'border-primary-container bg-primary-container text-white'
          : 'border-outline-variant/40 bg-surface text-on-surface-variant hover:border-primary-container/50 hover:text-primary-container'
      }`}
    >
      {label}
    </button>
  );
}
