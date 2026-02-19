-- 001_create_tables.sql
-- Appointment Booking Chatbot - Core schema

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Enum for appointment status
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- ============================================================
-- TABLES
-- ============================================================

-- Clients (WhatsApp users)
CREATE TABLE clients (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone      TEXT UNIQUE NOT NULL,          -- E.164 format (+5491155551234)
  name       TEXT NOT NULL,
  notes      TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Services offered by the business
CREATE TABLE services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  description      TEXT DEFAULT '',
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price            NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner's recurring weekly availability (multiple blocks per day allowed)
CREATE TABLE availability (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT chk_time_range CHECK (end_time > start_time)
);

-- Booked appointments
CREATE TABLE appointments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  status     appointment_status NOT NULL DEFAULT 'pending',
  notes      TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_appointment_range CHECK (ends_at > starts_at)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_clients_phone ON clients (phone);
CREATE INDEX idx_appointments_client ON appointments (client_id);
CREATE INDEX idx_appointments_starts_at ON appointments (starts_at);

-- GiST index for efficient overlap detection
CREATE INDEX idx_appointments_overlap ON appointments
  USING GIST (tstzrange(starts_at, ends_at));

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEED: Default availability (Mon-Fri 09-18, Sat 09-13)
-- ============================================================

-- Monday (1) through Friday (5): 09:00 - 18:00
INSERT INTO availability (day_of_week, start_time, end_time) VALUES
  (1, '09:00', '18:00'),
  (2, '09:00', '18:00'),
  (3, '09:00', '18:00'),
  (4, '09:00', '18:00'),
  (5, '09:00', '18:00');

-- Saturday (6): 09:00 - 13:00
INSERT INTO availability (day_of_week, start_time, end_time) VALUES
  (6, '09:00', '13:00');

-- Sunday (0): no availability (not inserted)
