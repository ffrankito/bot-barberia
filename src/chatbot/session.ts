import type { ConversationContext } from "./types.js";
import { supabase } from "../lib/supabase.js";

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Mantenemos un caché local para reducir consultas a Supabase
const localCache = new Map<string, { ctx: ConversationContext; expiry: number }>();
const CACHE_TTL = 60000; // 1 minuto en caché

export async function getSession(phone: string): Promise<ConversationContext> {
  // 1. Revisar caché local primero
  const cached = localCache.get(phone);
  if (cached && Date.now() < cached.expiry) {
    cached.ctx.lastActivity = Date.now();
    return cached.ctx;
  }

  // 2. Buscar en Supabase
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (!error && data) {
    const elapsed = Date.now() - new Date(data.last_activity).getTime();
    
    if (elapsed < SESSION_TIMEOUT_MS) {
      // Sesión válida, parsear el contexto
      const ctx = JSON.parse(data.context) as ConversationContext;
      ctx.lastActivity = Date.now();
      
      // Actualizar caché local
      localCache.set(phone, {
        ctx,
        expiry: Date.now() + CACHE_TTL
      });
      
      return ctx;
    } else {
      // Sesión expirada, eliminarla
      await supabase.from("sessions").delete().eq("phone", phone);
      localCache.delete(phone);
    }
  }

  // 3. Crear nueva sesión
  const ctx: ConversationContext = {
    state: "GREETING",
    phone,
    lastActivity: Date.now(),
  };

  // Guardar en Supabase
  await supabase.from("sessions").upsert({
    phone,
    context: JSON.stringify(ctx),
    last_activity: new Date().toISOString(),
  });

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

  // Actualizar en Supabase
  await supabase.from("sessions").upsert({
    phone,
    context: JSON.stringify(ctx),
    last_activity: new Date().toISOString(),
  });
}

export async function clearSession(phone: string): Promise<void> {
  // Limpiar caché local
  localCache.delete(phone);
  
  // Eliminar de Supabase
  await supabase.from("sessions").delete().eq("phone", phone);
}

// Función auxiliar para limpiar sesiones viejas (llamar periódicamente)
export async function cleanupOldSessions(): Promise<void> {
  const { error } = await supabase.rpc("cleanup_old_sessions");
  
  if (error) {
    console.error("Error limpiando sesiones viejas:", error);
  } else {
    console.log("✅ Sesiones viejas limpiadas");
  }
}