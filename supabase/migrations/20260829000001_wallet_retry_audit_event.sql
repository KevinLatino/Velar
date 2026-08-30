-- Audit event for admin/manual custodial wallet retry (ADD VALUE only; do not use in this transaction).

ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'wallet_retry_requested';
