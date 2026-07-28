import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { NotificationType, type RenderedNotification } from '@velar/types';

export type InboxFilters = {
  category?: string;
  severity?: string;
  read?: boolean;
  archived?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
};

type InboxCursor = { created_at: string; id: string };

function encodeInboxCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ created_at: createdAt, id }), 'utf8').toString('base64url');
}

function decodeInboxCursor(cursor: string): InboxCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<InboxCursor>;
    if (typeof parsed?.created_at === 'string' && typeof parsed?.id === 'string') {
      return { created_at: parsed.created_at, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/** Escape characters that break PostgREST `or=()` / `ilike` filter parsing. */
function escapeOrFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, ' ')
    .replace(/[()]/g, '');
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private supabase: SupabaseService) {}

  /**
   * Crea una notificación para un usuario. NUNCA lanza: si falla, solo loguea,
   * para no romper el flujo de negocio que la dispara (igual que AuditService.emit).
   */
  async emit(userId: string, type: NotificationType, payload: Record<string, unknown> = {}) {
    if (!userId) return;
    try {
      await this.supabase.admin.from('notifications').insert({
        user_id: userId,
        type,
        payload,
      });
    } catch (e) {
      this.logger.warn(`emit notification falló: ${(e as Error).message}`);
    }
  }

  /** Últimas notificaciones del usuario + conteo de no leídas. */
  async list(userId: string, limit = 20) {
    const [{ data }, { count }] = await Promise.all([
      this.supabase.admin
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),
      this.supabase.admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false),
    ]);
    return { notifications: data ?? [], unreadCount: count ?? 0 };
  }

  /** Marca una notificación como leída (solo si pertenece al usuario). */
  async markRead(id: string, userId: string) {
    await this.supabase.admin
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', userId);
    return { ok: true };
  }

  /** Marca todas las notificaciones del usuario como leídas. */
  async markAllRead(userId: string) {
    await this.supabase.admin
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    return { ok: true };
  }

  /**
   * Persists a dispatcher-rendered notification (in-app channel path).
   * `type` stores `rendered.category` as a schema-safe placeholder — richer
   * mapping onto NotificationType enum values (offer_received, etc.) happens
   * when domain events get wired to real recipients in a later phase.
   */
  async insertRendered(rendered: RenderedNotification): Promise<void> {
    await this.supabase.admin.from('notifications').insert({
      user_id: rendered.recipientId,
      type: rendered.category,
      payload: {
        subject: rendered.subject,
        body: rendered.body,
        notificationId: rendered.notificationId,
      },
      category: rendered.category,
      severity: rendered.severity,
      channel: rendered.channel,
      idempotency_key: rendered.idempotencyKey,
    });
  }

  /**
   * Richer inbox listing with filters, free-text search, and created_at+id
   * keyset pagination (infinite scroll). Default excludes archived rows.
   */
  async inbox(userId: string, filters: InboxFilters = {}) {
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const archived = filters.archived ?? false;

    let query = this.supabase.admin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (archived) {
      query = query.not('archived_at', 'is', null);
    } else {
      query = query.is('archived_at', null);
    }

    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (typeof filters.read === 'boolean') {
      query = query.eq('read', filters.read);
    }

    const cursor = filters.cursor ? decodeInboxCursor(filters.cursor) : null;
    const search = filters.search?.trim();
    const searchEscaped = search ? escapeOrFilterValue(search) : '';

    if (searchEscaped && cursor) {
      // Single `.or()` call: nested and/or so search + keyset don't overwrite each other.
      query = query.or(
        `and(or(payload->>subject.ilike.%${searchEscaped}%,payload->>body.ilike.%${searchEscaped}%),or(created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt."${cursor.id}")))`,
      );
    } else if (searchEscaped) {
      query = query.or(
        `payload->>subject.ilike.%${searchEscaped}%,payload->>body.ilike.%${searchEscaped}%`,
      );
    } else if (cursor) {
      query = query.or(
        `created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt."${cursor.id}")`,
      );
    }

    const { data, error } = await query;
    if (error) {
      this.logger.warn(`inbox query falló: ${error.message}`);
      return { notifications: [], nextCursor: null };
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const notifications = hasMore ? rows.slice(0, limit) : rows;
    const last = notifications[notifications.length - 1] as
      | { created_at?: string; id?: string }
      | undefined;
    const nextCursor =
      hasMore && last?.created_at && last?.id
        ? encodeInboxCursor(last.created_at, last.id)
        : null;

    return { notifications, nextCursor };
  }

  /** Marks the given ids as read (owner-scoped); sets both `read` and `read_at`. */
  async bulkMarkRead(userId: string, ids: string[]) {
    if (!ids.length) return { ok: true as const };
    await this.supabase.admin
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', ids);
    return { ok: true as const };
  }

  async archive(id: string, userId: string) {
    await this.supabase.admin
      .from('notifications')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    return { ok: true as const };
  }

  async unarchive(id: string, userId: string) {
    await this.supabase.admin
      .from('notifications')
      .update({ archived_at: null })
      .eq('id', id)
      .eq('user_id', userId);
    return { ok: true as const };
  }

  /** Active (non-archived) notification counts keyed by category. */
  async groupedCounts(userId: string): Promise<Record<string, number>> {
    const { data, error } = await this.supabase.admin
      .from('notifications')
      .select('category')
      .eq('user_id', userId)
      .is('archived_at', null);

    if (error) {
      this.logger.warn(`groupedCounts falló: ${error.message}`);
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const category = (row as { category?: string | null }).category ?? 'system';
      counts[category] = (counts[category] ?? 0) + 1;
    }
    return counts;
  }
}
