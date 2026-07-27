import type { NotificationSeverity } from '@velar/types';

/**
 * Maps outbox `event.eventType` strings (from
 * supabase/migrations/20260702000000_notification_platform.sql) to
 * registered template IDs. Unmapped events fall back to notification.generic
 * so the pipeline never crashes on an unknown event_type.
 */
const TEMPLATE_IDS = new Set([
  'bond.created',
  'bond.congelado',
  'bond.activo',
  'bond.en_venta',
  'bond.aprobado',
  'bond.rechazado',
  'transfer.requested',
  'transfer.aceptada',
  'transfer.rechazada',
  'transfer.en_escrow',
  'transfer.pago_registrado',
  'transfer.pago_validado',
  'transfer.liberada',
  'transfer.cancelada',
  'report.enviado',
  'report.revisado',
  'report.observado',
  'report.aprobado',
]);

export function templateIdForEvent(eventType: string): string {
  if (TEMPLATE_IDS.has(eventType)) return eventType;
  return 'notification.generic';
}

export function severityForEvent(eventType: string): NotificationSeverity {
  if (
    eventType === 'bond.rechazado' ||
    eventType === 'transfer.rechazada' ||
    eventType === 'transfer.cancelada'
  ) {
    return 'critical';
  }
  if (eventType === 'report.observado') {
    return 'warning';
  }
  return 'info';
}
