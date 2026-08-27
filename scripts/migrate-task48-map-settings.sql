-- =============================================================================
-- Task #48 migration: CARTO harita ayarları tablosu
-- =============================================================================
-- CARTO Basemaps API anahtarını veritabanında şifreli saklamak için
-- singleton map_settings tablosu. Anahtar AES-256-GCM ile şifrelenir;
-- tile proxy (GET /api/map/tiles/:z/:x/:y) CARTO'ya iletir — tarayıcıya
-- asla döndürülmez.
--
-- Bu betik idempotent (CREATE TABLE IF NOT EXISTS) — defalarca çalıştırılabilir.
--
-- Çalıştırma:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrate-task48-map-settings.sql
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS map_settings (
  id                  INTEGER PRIMARY KEY,
  api_key_encrypted   TEXT,
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMIT;
