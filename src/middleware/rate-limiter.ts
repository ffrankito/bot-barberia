interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const MAX_MESSAGES_PER_MINUTE = 10;
const WINDOW_MS = 60000; // 1 minuto

export function checkRateLimit(phone: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(phone);

  // Si no existe o ya pasó la ventana, resetear
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(phone, {
      count: 1,
      resetAt: now + WINDOW_MS
    });
    return true; // Permitir
  }

  // Si ya llegó al límite
  if (entry.count >= MAX_MESSAGES_PER_MINUTE) {
    console.warn(`⚠️ Rate limit exceeded for ${phone}: ${entry.count} messages`);
    return false; // Bloquear
  }

  // Incrementar contador
  entry.count++;
  return true; // Permitir
}

// Función para limpiar entradas viejas periódicamente
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [phone, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(phone);
    }
  }
}

// Ejecutar limpieza cada 5 minutos
setInterval(cleanupRateLimits, 5 * 60 * 1000);