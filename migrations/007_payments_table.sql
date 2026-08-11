-- 007_payments_table.sql
-- Tabla de pagos (Mercado Pago)

CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id   UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  mp_preference_id TEXT,
  mp_payment_id    TEXT,
  payment_url      TEXT,
  payment_method   TEXT,
  amount           NUMERIC(10,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments (appointment_id);
