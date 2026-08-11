import type { ConversationContext } from "./types.js";
import { query, queryOne } from "../lib/db.js";

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Mantenemos un caché local para reducir consultas a la DB
const localCache = new Map<string, { ctx: ConversationContext; expiry: number }>();
const CACHE_TTL = 60000; // 1 minuto en caché

export async function getSession(phone: string): Promise<ConversationContext> {
  // 1. Revisar caché local primero
  const cached = localCache.get(phone);
  if (cached && Date.now() < cached.expiry) {
    cached.ctx.lastActivity = Date.now();
    return cached.ctx;
  }

  // 2. Buscar en la DB
  const row = await queryOne<{ context: string; last_activity: string }>(
    `SELECT context, last_activity FROM sessions WHERE phone = $1`,
    [phone]
  );

  if (row) {
    const elapsed = Date.now() - new Date(row.last_activity).getTime();

    if (elapsed < SESSION_TIMEOUT_MS) {
      // Sesión válida, parsear el contexto
      const ctx = JSON.parse(row.context) as ConversationContext;
      ctx.lastActivity = Date.now();

      // Actualizar caché local
      localCache.set(phone, {
        ctx,
        expiry: Date.now() + CACHE_TTL
      });

      return ctx;
    } else {
      // Sesión expirada, eliminarla
      await query(`DELETE FROM sessions WHERE phone = $1`, [phone]);
      localCache.delete(phone);
    }
  }

  // 3. Crear nueva sesión
  const ctx: ConversationContext = {
    state: "GREETING",
    phone,
    lastActivity: Date.now(),
  };

  // Guardar en la DB
  await query(
    `INSERT INTO sessions (phone, context, last_activity) VALUES ($1, $2, $3)
     ON CONFLICT (phone) DO UPDATE SET context = $2, last_activity = $3`,
    [phone, JSON.stringify(ctx), new Date().toISOString()]
  );

  // Guardar en caché local
  localCache.set(phone, {
    ctx,
    expiry: Date.now() + CACHE_TTL
  });

  return ctx;
}

export async function updateSession(phone: string, ctx: ConversationContext): Promise<void> {
  ctx.lastActivity = Date.now();

  // Actualizar caché local
  localCache.set(phone, {
    ctx,
    expiry: Date.now() + CACHE_TTL
  });

  // Actualizar en la DB
  await query(
    `INSERT INTO sessions (phone, context, last_activity) VALUES ($1, $2, $3)
     ON CONFLICT (phone) DO UPDATE SET context = $2, last_activity = $3`,
    [phone, JSON.stringify(ctx), new Date().toISOString()]
  );
}

export async function clearSession(phone: string): Promise<void> {
  // Limpiar caché local
  localCache.delete(phone);

  // Eliminar de la DB
  await query(`DELETE FROM sessions WHERE phone = $1`, [phone]);
}

// Función auxiliar para limpiar sesiones viejas (llamar periódicamente)
export async function cleanupOldSessions(): Promise<void> {
  try {
    await query(`DELETE FROM sessions WHERE last_activity < NOW() - INTERVAL '1 day'`);
    console.log("✅ Sesiones viejas limpiadas");
  } catch (error) {
    console.error("Error limpiando sesiones viejas:", error);
  }
}
