-- Tabla para persistir sesiones del chatbot
CREATE TABLE IF NOT EXISTS sessions (
  phone TEXT PRIMARY KEY,
  context JSONB NOT NULL,
  last_activity TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consultas por última actividad
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);

-- Función para limpiar sesiones viejas (más de 1 día)
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions 
  WHERE last_activity < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;