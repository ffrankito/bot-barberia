import type { ConversationContext, HandlerResult } from "../types.js";
import { getClient } from "../../tools/get-client.js";

export async function handleIdentifyClient(
  ctx: ConversationContext,
  _message: string
): Promise<HandlerResult> {
  const result = await getClient({ phone: ctx.phone });

  if (result.found && result.client) {
    ctx.clientId = result.client.id;
    ctx.clientName = result.client.name;
    return {
      response:
        `¡Hola ${result.client.name}! ¿En qué te puedo ayudar?\n\n` +
        `1. Ver servicios y sacar turno\n` +
        `2. Ver mis turnos\n` +
        `3. Cancelar un turno\n` +
        `4. Salir`,
      newState: "MAIN_MENU",
    };
  }

  return {
    response:
      "No encontré tu número registrado. " +
      "¿Cómo te llamás? (Escribí tu nombre)",
    newState: "REGISTER_CLIENT",
  };
}
