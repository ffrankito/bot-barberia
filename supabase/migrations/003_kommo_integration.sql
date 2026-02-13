-- 003_kommo_integration.sql
-- Add Kommo contact id reference to appointments for traceability

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS kommo_contact_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_appointments_kommo_contact
  ON appointments (kommo_contact_id);
