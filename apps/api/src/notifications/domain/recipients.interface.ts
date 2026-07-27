import type { DomainEvent, NotificationCategory } from '@velar/types';

export interface RecipientCandidate {
  userId: string;
  category: NotificationCategory;
}

export interface RecipientDirectory {
  resolveForEvent(event: DomainEvent): Promise<RecipientCandidate[]>;
}

/**
 * Maps outbox event_type strings (from trigger functions in
 * supabase/migrations/20260702000000_notification_platform.sql) to
 * notification categories. Transfer triggers emit `transfer.` + status
 * enum text (e.g. `transfer.en_escrow`, `transfer.pago_registrado`).
 */
export function categoryForEvent(event: DomainEvent): NotificationCategory {
  const t = event.eventType;
  if (t.startsWith('bond.')) return 'bond';
  if (t.startsWith('transfer.')) {
    if (t.endsWith('en_escrow')) return 'escrow';
    if (t.endsWith('pago_registrado') || t.endsWith('pago_validado')) return 'payment';
    return 'transfer';
  }
  if (t.startsWith('report.')) return 'report';
  return 'system';
}
