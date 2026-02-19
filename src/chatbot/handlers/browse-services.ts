import type { ConversationContext, HandlerResult } from "../types.js";
import { searchServices } from "../../tools/search-services.js";

export async function handleBrowseServices(
  ctx: ConversationContext,
  _message: string
): Promise<HandlerResult> {
  const result = await searchServices({});

  if (result.services.length === 0) {
    return {
      response: "No hay servicios disponibles en este momento.\n\nEscribí *menu* para volver.",
      newState: "MAIN_MENU",
    };
  }

  // Store services in context for selection
  const serviceList = result.services
    .map((s, i) => {
      const price = s.price === 0 ? "Gratis" : `$${s.price.toLocaleString("es-AR")}`;
      return `${i + 1}. *${s.name}* - ${s.duration_minutes} min - ${price}\n   ${s.description}`;
    })
    .join("\n\n");

  // Store the service list for next state
  (ctx as any)._servicesList = result.services;

  return {
    response:
      `Estos son nuestros servicios:\n\n${serviceList}\n\n` +
      `Escribí el número del servicio que querés, o *volver* para ir al menú.`,
    newState: "SELECT_SERVICE",
  };
}
