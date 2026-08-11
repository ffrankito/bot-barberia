-- 009_prevent_overlaps.sql
-- Agrega constraint a nivel DB para prevenir reservas solapadas (race condition fix)

ALTER TABLE appointments
  ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING GIST (tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status != 'cancelled');

COMMENT ON CONSTRAINT no_overlapping_appointments ON appointments
  IS 'Previene doble reserva del mismo horario a nivel base de datos';