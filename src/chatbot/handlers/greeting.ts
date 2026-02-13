import type { ConversationContext, HandlerResult } from "../types.js";

export async function handleGreeting(
  _ctx: ConversationContext,
  _message: string
): Promise<HandlerResult> {
  return {
    response:
      "¡Hola! Bienvenido/a a nuestro sistema de turnos. " +
      "Voy a verificar tus datos...",
    newState: "IDENTIFY_CLIENT",
  };
}
