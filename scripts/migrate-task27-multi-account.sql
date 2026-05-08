-- =============================================================================
-- Task #27 production migration: Starlink + Leo Bridge → multi-account
-- =============================================================================
-- Üretimde `pnpm db push` çalıştırmayın — drizzle-kit NOT NULL kolonları tek
-- atışta eklemeye çalıştığı için patlıyor (mevcut satırlar credential_id
-- alamadan SET NOT NULL hatası).
--
-- Bu betik sıralı, idempotent ve güvenli:
--   1. Yeni credential tablolarını yaratır (yoksa).
--   2. Singleton *_settings'ten 1 satır seed eder (varsa, yoksa default seed).
--   3. credential_id kolonlarını NULLABLE ekler, mevcut satırları backfill
--      eder, sonra NOT NULL + FK uygular.
--   4. PK'leri kompozit (credential_id, kit_serial_number)'a çevirir.
--   5. Yeni unique index'leri yaratır, eskileri düşürür.
--   6. *_sync_logs tablolarını yaratır.
--   7. Legacy *_settings tablolarını CASCADE ile düşürür.
--
-- Çalıştırma:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrate-task27-multi-account.sql
--
-- Ardından `pnpm db push` ÇALIŞTIRMAYIN — şema zaten senkron olur.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) STARLINK
-- ---------------------------------------------------------------------------

-- 1a) starlink_credentials
CREATE TABLE IF NOT EXISTS starlink_credentials (
  id                    SERIAL PRIMARY KEY,
  label                 TEXT,
  api_base_url          TEXT NOT NULL DEFAULT 'https://starlink.tototheo.com',
  encrypted_token       TEXT NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 30,
  last_success_sync_at  TIMESTAMP,
  last_error_message    TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 1b) Eski singleton'dan 1 satır seed (yalnız credential tablosu boşsa).
DO $$
DECLARE
  has_old   BOOLEAN;
  has_token BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM starlink_credentials) INTO has_token;
  IF has_token THEN
    RAISE NOTICE 'starlink_credentials zaten dolu, seed atlanıyor.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'starlink_settings'
  ) INTO has_old;

  IF has_old THEN
    INSERT INTO starlink_credentials
      (label, api_base_url, encrypted_token, is_active,
       last_success_sync_at, last_error_message, created_at, updated_at)
    SELECT
      'Varsayılan Hesap',
      COALESCE(api_base_url, 'https://starlink.tototheo.com'),
      COALESCE(token_encrypted, ''),
      COALESCE(enabled, FALSE),
      last_sync_at,
      last_error_message,
      COALESCE(updated_at, NOW()),
      NOW()
    FROM starlink_settings
    LIMIT 1;
    RAISE NOTICE 'starlink_credentials: starlink_settings''ten 1 satır seed edildi.';
  ELSE
    RAISE NOTICE 'starlink_settings yok — boş başlatılıyor.';
  END IF;
END $$;

-- 1c) starlink_terminals
ALTER TABLE starlink_terminals
  ADD COLUMN IF NOT EXISTS credential_id INTEGER;

UPDATE starlink_terminals
SET credential_id = (SELECT MIN(id) FROM starlink_credentials)
WHERE credential_id IS NULL;

-- Eski PK'yi düşür (kit_serial_number tek başınaydı), kompoziti uygula.
DO $$
DECLARE
  pk_name TEXT;
BEGIN
  SELECT conname INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'starlink_terminals'::regclass AND contype = 'p';
  IF pk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE starlink_terminals DROP CONSTRAINT ' || quote_ident(pk_name);
  END IF;
END $$;

ALTER TABLE starlink_terminals
  ALTER COLUMN credential_id SET NOT NULL;

ALTER TABLE starlink_terminals
  ADD CONSTRAINT starlink_terminals_pkey
  PRIMARY KEY (credential_id, kit_serial_number);

ALTER TABLE starlink_terminals
  DROP CONSTRAINT IF EXISTS starlink_terminals_credential_id_fkey;
ALTER TABLE starlink_terminals
  ADD CONSTRAINT starlink_terminals_credential_id_fkey
  FOREIGN KEY (credential_id) REFERENCES starlink_credentials(id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS starlink_terminals_kit_idx
  ON starlink_terminals (kit_serial_number);

-- 1d) starlink_terminal_daily
ALTER TABLE starlink_terminal_daily
  ADD COLUMN IF NOT EXISTS credential_id INTEGER;

UPDATE starlink_terminal_daily
SET credential_id = (SELECT MIN(id) FROM starlink_credentials)
WHERE credential_id IS NULL;

ALTER TABLE starlink_terminal_daily
  ALTER COLUMN credential_id SET NOT NULL;

ALTER TABLE starlink_terminal_daily
  DROP CONSTRAINT IF EXISTS starlink_terminal_daily_credential_id_fkey;
ALTER TABLE starlink_terminal_daily
  ADD CONSTRAINT starlink_terminal_daily_credential_id_fkey
  FOREIGN KEY (credential_id) REFERENCES starlink_credentials(id)
  ON DELETE CASCADE;

-- Eski FK'yi (kit_serial_number → starlink_terminals.kit_serial_number) düşür;
-- composite PK varlığı bunu artık desteklemiyor.
ALTER TABLE starlink_terminal_daily
  DROP CONSTRAINT IF EXISTS starlink_terminal_daily_kit_serial_number_starlink_terminals;
ALTER TABLE starlink_terminal_daily
  DROP CONSTRAINT IF EXISTS starlink_terminal_daily_kit_serial_number_fkey;

-- Eski unique index'i düşür (varsa) ve yenisini yarat.
DROP INDEX IF EXISTS uq_starlink_daily;
CREATE UNIQUE INDEX uq_starlink_daily
  ON starlink_terminal_daily (credential_id, kit_serial_number, day_date);
DROP INDEX IF EXISTS starlink_daily_lookup_idx;
CREATE INDEX starlink_daily_lookup_idx
  ON starlink_terminal_daily (credential_id, kit_serial_number, day_date);

-- 1e) starlink_terminal_period_total
ALTER TABLE starlink_terminal_period_total
  ADD COLUMN IF NOT EXISTS credential_id INTEGER;

UPDATE starlink_terminal_period_total
SET credential_id = (SELECT MIN(id) FROM starlink_credentials)
WHERE credential_id IS NULL;

ALTER TABLE starlink_terminal_period_total
  ALTER COLUMN credential_id SET NOT NULL;

ALTER TABLE starlink_terminal_period_total
  DROP CONSTRAINT IF EXISTS starlink_terminal_period_total_credential_id_fkey;
ALTER TABLE starlink_terminal_period_total
  ADD CONSTRAINT starlink_terminal_period_total_credential_id_fkey
  FOREIGN KEY (credential_id) REFERENCES starlink_credentials(id)
  ON DELETE CASCADE;

ALTER TABLE starlink_terminal_period_total
  DROP CONSTRAINT IF EXISTS starlink_terminal_period_total_kit_serial_number_starlink_t;
ALTER TABLE starlink_terminal_period_total
  DROP CONSTRAINT IF EXISTS starlink_terminal_period_total_kit_serial_number_fkey;

DROP INDEX IF EXISTS uq_starlink_period_total;
CREATE UNIQUE INDEX uq_starlink_period_total
  ON starlink_terminal_period_total (credential_id, kit_serial_number, period);
DROP INDEX IF EXISTS starlink_period_total_period_idx;
CREATE INDEX starlink_period_total_period_idx
  ON starlink_terminal_period_total (period);

-- 1f) starlink_sync_logs
CREATE TABLE IF NOT EXISTS starlink_sync_logs (
  id                SERIAL PRIMARY KEY,
  credential_id     INTEGER REFERENCES starlink_credentials(id) ON DELETE SET NULL,
  status            TEXT NOT NULL,
  message           TEXT,
  records_found     INTEGER,
  records_inserted  INTEGER,
  records_updated   INTEGER,
  started_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS starlink_sync_logs_started_at_idx
  ON starlink_sync_logs (started_at);
CREATE INDEX IF NOT EXISTS starlink_sync_logs_credential_idx
  ON starlink_sync_logs (credential_id);

-- 1g) Legacy singleton tabloyu düşür.
DROP TABLE IF EXISTS starlink_settings CASCADE;

-- ---------------------------------------------------------------------------
-- 2) LEO BRIDGE
-- ---------------------------------------------------------------------------

-- 2a) leobridge_credentials
CREATE TABLE IF NOT EXISTS leobridge_credentials (
  id                    SERIAL PRIMARY KEY,
  label                 TEXT,
  portal_url            TEXT NOT NULL DEFAULT 'https://leobridge.spacenorway.com',
  username              TEXT NOT NULL,
  encrypted_password    TEXT NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 30,
  last_success_sync_at  TIMESTAMP,
  last_error_message    TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2b) Eski singleton'dan seed.
DO $$
DECLARE
  has_old   BOOLEAN;
  has_creds BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM leobridge_credentials) INTO has_creds;
  IF has_creds THEN
    RAISE NOTICE 'leobridge_credentials zaten dolu, seed atlanıyor.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'leobridge_settings'
  ) INTO has_old;

  IF has_old THEN
    INSERT INTO leobridge_credentials
      (label, portal_url, username, encrypted_password, is_active,
       last_success_sync_at, last_error_message, created_at, updated_at)
    SELECT
      'Varsayılan Hesap',
      COALESCE(portal_url, 'https://leobridge.spacenorway.com'),
      COALESCE(username, ''),
      COALESCE(encrypted_password, ''),
      COALESCE(enabled, FALSE),
      last_sync_at,
      last_error_message,
      COALESCE(updated_at, NOW()),
      NOW()
    FROM leobridge_settings
    WHERE username IS NOT NULL AND encrypted_password IS NOT NULL
    LIMIT 1;
    IF FOUND THEN
      RAISE NOTICE 'leobridge_credentials: leobridge_settings''ten 1 satır seed edildi.';
    ELSE
      RAISE NOTICE 'leobridge_settings boş ya da username/şifre eksik — seed atlanıyor.';
    END IF;
  ELSE
    RAISE NOTICE 'leobridge_settings yok — boş başlatılıyor.';
  END IF;
END $$;

-- 2c) leobridge_terminals — eski tablo varsa migrate et, yoksa aşağıda yarat.
DO $$
DECLARE
  has_table BOOLEAN;
  has_creds BOOLEAN;
  pk_name   TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'leobridge_terminals'
  ) INTO has_table;

  IF NOT has_table THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM leobridge_credentials) INTO has_creds;

  IF NOT has_creds THEN
    -- Credential seed edilmedi: eski tabloları temizle, aşağıda boş yaratılsın.
    EXECUTE 'DROP TABLE IF EXISTS leobridge_terminal_daily CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS leobridge_terminal_period_total CASCADE';
    EXECUTE 'DROP TABLE leobridge_terminals CASCADE';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE leobridge_terminals ADD COLUMN IF NOT EXISTS credential_id INTEGER';

  UPDATE leobridge_terminals
  SET credential_id = (SELECT MIN(id) FROM leobridge_credentials)
  WHERE credential_id IS NULL;

  DELETE FROM leobridge_terminals WHERE credential_id IS NULL;

  SELECT conname INTO pk_name FROM pg_constraint
  WHERE conrelid = 'leobridge_terminals'::regclass AND contype = 'p';
  IF pk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE leobridge_terminals DROP CONSTRAINT ' || quote_ident(pk_name);
  END IF;

  EXECUTE 'ALTER TABLE leobridge_terminals ALTER COLUMN credential_id SET NOT NULL';
  EXECUTE 'ALTER TABLE leobridge_terminals
           ADD CONSTRAINT leobridge_terminals_pkey
           PRIMARY KEY (credential_id, kit_serial_number)';
  EXECUTE 'ALTER TABLE leobridge_terminals
           DROP CONSTRAINT IF EXISTS leobridge_terminals_credential_id_fkey';
  EXECUTE 'ALTER TABLE leobridge_terminals
           ADD CONSTRAINT leobridge_terminals_credential_id_fkey
           FOREIGN KEY (credential_id) REFERENCES leobridge_credentials(id)
           ON DELETE CASCADE';
END $$;

CREATE TABLE IF NOT EXISTS leobridge_terminals (
  credential_id        INTEGER NOT NULL REFERENCES leobridge_credentials(id) ON DELETE CASCADE,
  kit_serial_number    TEXT NOT NULL,
  service_line_number  TEXT,
  nickname             TEXT,
  address_label        TEXT,
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,
  is_online            BOOLEAN,
  last_seen_at         TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (credential_id, kit_serial_number)
);
CREATE INDEX IF NOT EXISTS leobridge_terminals_kit_idx
  ON leobridge_terminals (kit_serial_number);

-- 2d) leobridge_terminal_daily
CREATE TABLE IF NOT EXISTS leobridge_terminal_daily (
  credential_id     INTEGER NOT NULL REFERENCES leobridge_credentials(id) ON DELETE CASCADE,
  kit_serial_number TEXT NOT NULL,
  day_date          DATE NOT NULL,
  priority_gb       DOUBLE PRECISION,
  standard_gb       DOUBLE PRECISION,
  total_gb          DOUBLE PRECISION,
  last_reading_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
DROP INDEX IF EXISTS uq_leobridge_daily;
CREATE UNIQUE INDEX uq_leobridge_daily
  ON leobridge_terminal_daily (credential_id, kit_serial_number, day_date);
DROP INDEX IF EXISTS leobridge_daily_lookup_idx;
CREATE INDEX leobridge_daily_lookup_idx
  ON leobridge_terminal_daily (credential_id, kit_serial_number, day_date);

-- 2e) leobridge_terminal_period_total
CREATE TABLE IF NOT EXISTS leobridge_terminal_period_total (
  credential_id     INTEGER NOT NULL REFERENCES leobridge_credentials(id) ON DELETE CASCADE,
  kit_serial_number TEXT NOT NULL,
  period            TEXT NOT NULL,
  priority_gb       DOUBLE PRECISION,
  standard_gb       DOUBLE PRECISION,
  total_gb          DOUBLE PRECISION,
  scraped_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
DROP INDEX IF EXISTS uq_leobridge_period_total;
CREATE UNIQUE INDEX uq_leobridge_period_total
  ON leobridge_terminal_period_total (credential_id, kit_serial_number, period);
DROP INDEX IF EXISTS leobridge_period_total_period_idx;
CREATE INDEX leobridge_period_total_period_idx
  ON leobridge_terminal_period_total (period);

-- 2f) leobridge_sync_logs
CREATE TABLE IF NOT EXISTS leobridge_sync_logs (
  id                SERIAL PRIMARY KEY,
  credential_id     INTEGER REFERENCES leobridge_credentials(id) ON DELETE SET NULL,
  status            TEXT NOT NULL,
  message           TEXT,
  records_found     INTEGER,
  records_inserted  INTEGER,
  records_updated   INTEGER,
  started_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS leobridge_sync_logs_started_at_idx
  ON leobridge_sync_logs (started_at);
CREATE INDEX IF NOT EXISTS leobridge_sync_logs_credential_idx
  ON leobridge_sync_logs (credential_id);

-- 2g) Legacy singleton tabloyu düşür.
DROP TABLE IF EXISTS leobridge_settings CASCADE;

-- ---------------------------------------------------------------------------
-- 3) Doğrulama
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  c1 INTEGER;
  c2 INTEGER;
BEGIN
  SELECT COUNT(*) INTO c1 FROM starlink_credentials;
  SELECT COUNT(*) INTO c2 FROM leobridge_credentials;
  RAISE NOTICE 'starlink_credentials: % satır, leobridge_credentials: % satır', c1, c2;
END $$;

COMMIT;
