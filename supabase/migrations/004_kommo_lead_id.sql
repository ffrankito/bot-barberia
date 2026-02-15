-- 004_kommo_lead_id.sql
-- Store Kommo lead id on appointments so we can sync cancellations/updates back to Kommo.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS kommo_lead_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_appointments_kommo_lead
  ON appointments (kommo_lead_id);
