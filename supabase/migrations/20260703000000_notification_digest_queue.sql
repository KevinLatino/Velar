-- ============================================================
-- VELAR: cola de ítems de digest para la plataforma de
-- notificaciones (issue #37, aditivo a 20260702000000).
-- ============================================================
-- Tabla interna consumida por el digest compiler NestJS
-- (service_role). No hay policy para `authenticated`: mismo
-- patrón que outbox_events / notification_dedup.
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_digest_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id     uuid NOT NULL,
  category         text NOT NULL,
  window_key       text NOT NULL,
  window_ends_at   timestamptz NOT NULL,
  rendered_subject text NOT NULL,
  rendered_body    text NOT NULL,
  channel          text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  compiled_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_digest_queue_pending
  ON notification_digest_queue (window_ends_at)
  WHERE compiled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_digest_queue_recipient
  ON notification_digest_queue (recipient_id, category, window_key);

ALTER TABLE notification_digest_queue ENABLE ROW LEVEL SECURITY;
-- Sin policy para `authenticated`: solo service_role (bypass RLS).
