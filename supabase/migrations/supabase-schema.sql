-- =============================================
-- Chatbot Prueba — Supabase Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Clients
create table IF NOT EXISTS clients (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text not null,
  notes text default '',
  created_at timestamptz default now()
);

-- 2. Services
create table IF NOT EXISTS services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  duration_minutes int not null,
  price numeric(10,2) not null default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 3. Availability (weekly schedule)
-- day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
create table IF NOT EXISTS availability (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean default true
);

-- 4. Appointments
create table IF NOT EXISTS appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  service_id uuid not null references services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed',
  notes text default '',
  created_at timestamptz default now()
);

-- =============================================
-- Sample data (so you can test immediately)
-- =============================================

-- A test service
insert into services (name, description, duration_minutes, price) values
  ('Corte de pelo', 'Corte clásico de pelo', 30, 5000),
  ('Corte + Barba', 'Corte de pelo con arreglo de barba', 45, 7500),
  ('Tintura', 'Tintura completa', 60, 12000);

-- Weekly availability: Mon-Fri 9:00–13:00, 14:00–18:00
insert into availability (day_of_week, start_time, end_time) values
  (1, '09:00', '13:00'), (1, '14:00', '18:00'),  -- Lunes
  (2, '09:00', '13:00'), (2, '14:00', '18:00'),  -- Martes
  (3, '09:00', '13:00'), (3, '14:00', '18:00'),  -- Miércoles
  (4, '09:00', '13:00'), (4, '14:00', '18:00'),  -- Jueves
  (5, '09:00', '13:00'), (5, '14:00', '18:00'),  -- Viernes
  (6, '09:00', '13:00');                           -- Sábado (solo mañana)
