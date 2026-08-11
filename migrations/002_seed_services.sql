-- 002_seed_services.sql
-- Sample services - customize for your business

INSERT INTO services (name, description, duration_minutes, price) VALUES
  (
    'Corte de pelo',
    'Corte de pelo clásico con lavado y secado',
    30,
    5000.00
  ),
  (
    'Coloración',
    'Coloración completa con productos profesionales',
    90,
    15000.00
  ),
  (
    'Manicura',
    'Manicura completa con esmaltado',
    45,
    3500.00
  ),
  (
    'Consulta inicial',
    'Primera consulta para evaluar necesidades del cliente',
    60,
    0.00
  );
