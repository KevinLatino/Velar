-- Custodial wallet reconciliation: bounded retry metadata on profiles and parties.
-- Adds stellar_wallet_retry_count and stellar_wallet_last_retry_at.
-- Does not change existing stellar_wallet / status / error / network / created_at.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stellar_wallet_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stellar_wallet_last_retry_at timestamptz;

ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS stellar_wallet_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stellar_wallet_last_retry_at timestamptz;

-- Reconciliation jobs scan failed wallets ordered by last retry (backoff).
CREATE INDEX IF NOT EXISTS idx_profiles_stellar_wallet_failed
  ON profiles (stellar_wallet_last_retry_at, stellar_wallet_retry_count)
  WHERE stellar_wallet_status = 'failed';

CREATE INDEX IF NOT EXISTS idx_parties_stellar_wallet_failed
  ON parties (stellar_wallet_last_retry_at, stellar_wallet_retry_count)
  WHERE stellar_wallet_status = 'failed';
