-- Agregar columnas para pagos a appointments
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payment_id TEXT,
ADD COLUMN IF NOT EXISTS payment_url TEXT,
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Índice para consultas por estado de pago
CREATE INDEX IF NOT EXISTS idx_appointments_payment_status 
ON appointments(payment_status);

-- Comentarios
COMMENT ON COLUMN appointments.payment_status IS 'Estado del pago: pending, paid, failed, refunded';
COMMENT ON COLUMN appointments.payment_id IS 'ID de la preferencia de Mercado Pago';
COMMENT ON COLUMN appointments.payment_url IS 'Link de pago para enviar al cliente';
COMMENT ON COLUMN appointments.paid_amount IS 'Monto pagado en ARS';
COMMENT ON COLUMN appointments.paid_at IS 'Fecha y hora del pago confirmado';