-- Agregar columnas para sistema de recordatorios
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS attendance_confirmed BOOLEAN DEFAULT FALSE;

-- Índice para consultas de recordatorios
CREATE INDEX IF NOT EXISTS idx_appointments_reminder 
ON appointments(reminder_sent, starts_at) 
WHERE status != 'cancelled';

-- Comentarios
COMMENT ON COLUMN appointments.reminder_sent IS 'Si ya se envió el recordatorio 24hs antes';
COMMENT ON COLUMN appointments.reminder_sent_at IS 'Cuándo se envió el recordatorio';
COMMENT ON COLUMN appointments.attendance_confirmed IS 'Si el cliente confirmó asistencia';