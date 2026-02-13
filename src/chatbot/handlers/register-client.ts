import type { ConversationContext, HandlerResult } from "../types.js";
import { registerClientKommo } from "../../tools/register-client-kommo.js";

export async function handleRegisterClient(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  const name = message.trim();

  if (name.length < 2) {
    return {
      response: "Por favor escribí tu nombre (al menos 2 caracteres).",
    };
  }

  const result = await registerClientKommo({ phone: ctx.phone, name });
  ctx.clientId = result.client.id;
  ctx.clientName = name;
  ctx.kommoContactId = result.client.kommoContactId;

  return {
    response:
      `¡Perfecto, ${name}! Ya quedaste registrado/a.\n\n` +
      `¿En qué te puedo ayudar?\n\n` +
      `1. Ver servicios y sacar turno\n` +
      `2. Ver mis turnos\n` +
      `3. Cancelar un turno\n` +
      `4. Salir`,
    newState: "MAIN_MENU",
  };
}
