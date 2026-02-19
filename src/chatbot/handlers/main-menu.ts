import type { ConversationContext, HandlerResult } from "../types.js";

const MENU_TEXT =
  `¿En qué te puedo ayudar?\n\n` +
  `1. Ver servicios y sacar turno\n` +
  `2. Ver mis turnos\n` +
  `3. Cancelar un turno\n` +
  `4. Salir`;

export async function handleMainMenu(
  _ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  const option = message.trim();

  switch (option) {
    case "1":
      return { response: "Buscando servicios disponibles...", newState: "BROWSE_SERVICES" };
    case "2":
      return { response: "Buscando tus turnos...", newState: "VIEW_MY_APPOINTMENTS" };
    case "3":
      return { response: "Buscando turnos para cancelar...", newState: "CANCEL_APPOINTMENT" };
    case "4":
      return { response: "", newState: "DONE" };
    default:
      return {
        response:
          `No entendí tu elección. Escribí un número del 1 al 4.\n\n${MENU_TEXT}`,
      };
  }
}
