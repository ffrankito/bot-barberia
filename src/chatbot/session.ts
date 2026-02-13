import type { ConversationContext } from "./types.js";

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

const sessions = new Map<string, ConversationContext>();

export function getSession(phone: string): ConversationContext {
  const existing = sessions.get(phone);

  if (existing) {
    const elapsed = Date.now() - existing.lastActivity;
    if (elapsed < SESSION_TIMEOUT_MS) {
      existing.lastActivity = Date.now();
      return existing;
    }
    // Expired, remove it
    sessions.delete(phone);
  }

  // New session
  const ctx: ConversationContext = {
    state: "GREETING",
    phone,
    lastActivity: Date.now(),
  };
  sessions.set(phone, ctx);
  return ctx;
}

export function updateSession(phone: string, ctx: ConversationContext): void {
  ctx.lastActivity = Date.now();
  sessions.set(phone, ctx);
}

export function clearSession(phone: string): void {
  sessions.delete(phone);
}
