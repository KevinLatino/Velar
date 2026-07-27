-- ============================================================
-- VELAR: plataforma de notificaciones event-driven (issue #37)
-- ============================================================
-- Extiende de forma ADITIVA el sistema mínimo de notificaciones
-- (`20260608000000_notifications.sql`). Nunca reescribe tablas ni
-- policies existentes: solo ALTER TABLE + tablas/triggers nuevos.
--
-- Captura transaccional: triggers AFTER INSERT/UPDATE escriben
-- `outbox_events` en la misma transacción que el write de dominio.
-- El dispatcher NestJS (service_role) consume el outbox; RLS niega
-- a `authenticated` en tablas internas (mismo patrón que audit_events).
-- ============================================================

-- ── 1. outbox_events (particionado por mes) ───────────────────
-- VELAR: cola transaccional consumida por el dispatcher.
-- Mantenimiento: un job periódico DEBE provisionar particiones mensuales
-- futuras con anticipación (p. ej. al inicio de cada mes):
--   CREATE TABLE IF NOT EXISTS outbox_events_YYYY_MM
--     PARTITION OF outbox_events
--     FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-(MM+1)-01');
-- Ese cron NO se implementa aquí; el DEFAULT catch-all evita fallos
-- de insert si falta una partición. No hay infraestructura live
-- requerida para la suite de tests de este repo.

CREATE TABLE IF NOT EXISTS outbox_events (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL
                   CHECK (aggregate_type IN ('bond', 'transfer', 'report')),
  aggregate_id   uuid NOT NULL,
  event_type     text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  dedup_key      text NOT NULL,
  processed_at   timestamptz,
  attempts       int NOT NULL DEFAULT 0,
  last_error     text,
  -- Postgres exige la clave de partición en todo UNIQUE/PK de tablas particionadas.
  PRIMARY KEY (id, occurred_at),
  UNIQUE (dedup_key, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- Tres particiones mensuales a partir del mes actual + DEFAULT catch-all.
DO $$
DECLARE
  start_month date;
  i           int;
  part_name   text;
  from_ts     timestamptz;
  to_ts       timestamptz;
BEGIN
  start_month := date_trunc('month', now())::date;

  FOR i IN 0..2 LOOP
    from_ts   := (start_month + (i || ' months')::interval);
    to_ts     := (start_month + ((i + 1) || ' months')::interval);
    part_name := format('outbox_events_%s', to_char(from_ts, 'YYYY_MM'));

    IF to_regclass(format('public.%I', part_name)) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF outbox_events FOR VALUES FROM (%L) TO (%L)',
        part_name,
        from_ts,
        to_ts
      );
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS outbox_events_default
  PARTITION OF outbox_events DEFAULT;

CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed
  ON outbox_events (occurred_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_aggregate
  ON outbox_events (aggregate_type, aggregate_id);

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
-- Sin policy para `authenticated`: solo service_role (bypass RLS) y
-- funciones SECURITY DEFINER de los triggers escriben/leen esta tabla.

-- ── 2. Triggers de captura → outbox ───────────────────────────
-- VELAR: dos triggers por tabla (INSERT + UPDATE) evitan evaluar OLD
-- en el WHEN de un trigger combinado INSERT OR UPDATE.

-- Bonds
CREATE OR REPLACE FUNCTION fn_bonds_outbox_emit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'bond.created';
  ELSE
    -- bond_status es ENUM: castear a text al concatenar.
    v_event_type := 'bond.' || NEW.status::text;
  END IF;

  -- dedup_key: defensa best-effort. La garantía real de idempotencia
  -- está en el DedupStore de aplicación consumido por el dispatcher,
  -- no en esta clave (incluye now() y no es estrictamente determinística).
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, dedup_key
  ) VALUES (
    'bond',
    NEW.token_id,
    v_event_type,
    jsonb_build_object(
      'tokenId',       NEW.token_id,
      'currentOwner',  NEW.current_owner,
      'issuerPartyId', NEW.issuer_party_id,
      'previousStatus', CASE
                          WHEN TG_OP = 'UPDATE' THEN OLD.status::text
                          ELSE NULL
                        END,
      'newStatus',     NEW.status::text
    ),
    md5(
      TG_TABLE_NAME || '|' || NEW.token_id::text || '|' ||
      NEW.status::text || '|' || now()::text
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bonds_outbox_insert ON bonds;
CREATE TRIGGER trg_bonds_outbox_insert
  AFTER INSERT ON bonds
  FOR EACH ROW
  EXECUTE FUNCTION fn_bonds_outbox_emit();

DROP TRIGGER IF EXISTS trg_bonds_outbox_update ON bonds;
CREATE TRIGGER trg_bonds_outbox_update
  AFTER UPDATE ON bonds
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_bonds_outbox_emit();

-- Transfers
-- Este único par de triggers cubre también eventos de escrow:
-- ESCROW_BLOQUEADO / TOKEN_LIBERADO se manifiestan como transiciones
-- de transfers.status ('en_escrow', 'liberada'). No hay tabla de
-- dominio escrow separada que instrumentar.
CREATE OR REPLACE FUNCTION fn_transfers_outbox_emit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'transfer.requested';
  ELSE
    -- transfer_status es ENUM: castear a text al concatenar.
    v_event_type := 'transfer.' || NEW.status::text;
  END IF;

  -- dedup_key: defensa best-effort; la corrección real la da el
  -- DedupStore de aplicación del dispatcher.
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, dedup_key
  ) VALUES (
    'transfer',
    NEW.id,
    v_event_type,
    jsonb_build_object(
      'fromOwner',      NEW.from_owner,
      'toOwner',        NEW.to_owner,
      'bondTokenId',    NEW.bond_token_id,
      'previousStatus', CASE
                          WHEN TG_OP = 'UPDATE' THEN OLD.status::text
                          ELSE NULL
                        END,
      'newStatus',      NEW.status::text
    ),
    md5(
      TG_TABLE_NAME || '|' || NEW.id::text || '|' ||
      NEW.status::text || '|' || now()::text
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transfers_outbox_insert ON transfers;
CREATE TRIGGER trg_transfers_outbox_insert
  AFTER INSERT ON transfers
  FOR EACH ROW
  EXECUTE FUNCTION fn_transfers_outbox_emit();

DROP TRIGGER IF EXISTS trg_transfers_outbox_update ON transfers;
CREATE TRIGGER trg_transfers_outbox_update
  AFTER UPDATE ON transfers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_transfers_outbox_emit();

-- Reports (solo UPDATE de status; la creación no genera outbox)
-- Cubiertas transparentemente: reports.service.ts::review() y
-- report-lifecycle.service.ts::submit() — ambos escriben la misma
-- columna reports.status; no hace falta saber qué servicio escribió.
CREATE OR REPLACE FUNCTION fn_reports_outbox_emit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- reports.status es text (CHECK), no ENUM.
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, dedup_key
  ) VALUES (
    'report',
    NEW.id,
    'report.' || NEW.status,
    jsonb_build_object(
      'reportId',       NEW.id,
      'partyId',        NEW.party_id,
      'previousStatus', OLD.status,
      'newStatus',      NEW.status
    ),
    md5(
      TG_TABLE_NAME || '|' || NEW.id::text || '|' ||
      NEW.status || '|' || now()::text
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_outbox_update ON reports;
CREATE TRIGGER trg_reports_outbox_update
  AFTER UPDATE ON reports
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_reports_outbox_emit();

-- ── 3. notification_dedup ─────────────────────────────────────
-- VELAR: store de idempotencia de entrega (capa aplicación).

CREATE TABLE IF NOT EXISTS notification_dedup (
  idempotency_key text PRIMARY KEY,
  recipient_id    uuid NOT NULL,
  channel         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

ALTER TABLE notification_dedup ENABLE ROW LEVEL SECURITY;
-- Sin policy authenticated: backend-only (service_role).

-- ── 4. notification_preferences ───────────────────────────────
-- VELAR: opt-in/opt-out por categoría × canal.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category   text NOT NULL,
  channel    text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category, channel)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_owner ON notification_preferences;
CREATE POLICY notification_preferences_owner ON notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 5. notification_quiet_hours ───────────────────────────────
-- VELAR: ventanas do-not-disturb (DST-correct en la app vía luxon).
-- start_minute/end_minute: minutos desde medianoche (0–1439);
-- end puede cruzar medianoche. days: índices ISO weekday (0 = lunes).

CREATE TABLE IF NOT EXISTS notification_quiet_hours (
  user_id      uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  timezone     text NOT NULL DEFAULT 'America/Costa_Rica',
  start_minute int NOT NULL DEFAULT 1320,
  end_minute   int NOT NULL DEFAULT 420,
  days         smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'
);

ALTER TABLE notification_quiet_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_quiet_hours_owner ON notification_quiet_hours;
CREATE POLICY notification_quiet_hours_owner ON notification_quiet_hours
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 6. notification_digest_settings ───────────────────────────
-- VELAR: cadencia de digest por categoría (instant / daily / weekly).

CREATE TABLE IF NOT EXISTS notification_digest_settings (
  user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  cadence  text NOT NULL DEFAULT 'instant'
             CHECK (cadence IN ('instant', 'daily', 'weekly')),
  PRIMARY KEY (user_id, category)
);

ALTER TABLE notification_digest_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_digest_settings_owner ON notification_digest_settings;
CREATE POLICY notification_digest_settings_owner ON notification_digest_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 7. notification_receipts ──────────────────────────────────
-- VELAR: auditoría de entrega por canal (escrituras solo backend).

CREATE TABLE IF NOT EXISTS notification_receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel         text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  attempt_count   int NOT NULL DEFAULT 0,
  delivered_at    timestamptz,
  read_at         timestamptz,
  error           text
);

ALTER TABLE notification_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_receipts_owner_select ON notification_receipts;
CREATE POLICY notification_receipts_owner_select ON notification_receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.id = notification_id
        AND n.user_id = auth.uid()
    )
  );
-- Sin policy de escritura para authenticated: solo service_role.

-- ── 8. notification_dlq ───────────────────────────────────────
-- VELAR: dead-letter queue tras agotar reintentos.

CREATE TABLE IF NOT EXISTS notification_dlq (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_event_id uuid,
  recipient_id    uuid,
  channel         text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason  text,
  failed_at       timestamptz NOT NULL DEFAULT now(),
  retry_count     int NOT NULL DEFAULT 0
);

ALTER TABLE notification_dlq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_dlq_tse_admin_select ON notification_dlq;
CREATE POLICY notification_dlq_tse_admin_select ON notification_dlq
  FOR SELECT TO authenticated
  USING (public.auth_role() IN ('tse', 'admin'));
-- Sin policy de escritura para authenticated: solo service_role.

-- ── 9. Extender notifications (aditivo) ───────────────────────
-- VELAR: columnas nuevas sin tocar `read` ni `notifications_owner`.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app';

CREATE INDEX IF NOT EXISTS idx_notifications_archived
  ON notifications (archived_at)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_idempotency
  ON notifications (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 10. notifications_archive ─────────────────────────────────
-- VELAR: cold storage de notificaciones archivadas.
-- Estrategia de retención (job periódico, NO cron live en esta
-- migración; ventana configurable, default sugerido 90 días):
--   1. SELECT rows WHERE archived_at IS NOT NULL
--        AND archived_at < now() - interval '90 days'
--   2. INSERT INTO notifications_archive
--   3. DELETE FROM notifications (hot table)
-- Sin FK ni owner-RLS: es almacenamiento frío; solo tse/admin leen.

CREATE TABLE IF NOT EXISTS notifications_archive (
  id              uuid NOT NULL,
  user_id         uuid NOT NULL,
  type            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  read            boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL,
  category        text,
  severity        text NOT NULL DEFAULT 'info',
  read_at         timestamptz,
  archived_at     timestamptz,
  idempotency_key text,
  channel         text NOT NULL DEFAULT 'in_app'
);

ALTER TABLE notifications_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_archive_tse_admin_select ON notifications_archive;
CREATE POLICY notifications_archive_tse_admin_select ON notifications_archive
  FOR SELECT TO authenticated
  USING (public.auth_role() IN ('tse', 'admin'));
