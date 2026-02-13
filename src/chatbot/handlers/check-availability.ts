import type { ConversationContext, HandlerResult } from "../types.js";
import { checkAvailability } from "../../tools/check-availability.js";
import { parseUserDate, dayNameES } from "../../lib/date-utils.js";

export async function handleCheckAvailability(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  const date = parseUserDate(message);

  if (!date) {
    return {
      response:
        "No pude entender la fecha. Probá con:\n" +
        "- *hoy* o *mañana*\n" +
        "- Un día: *lunes*, *martes*, etc.\n" +
        "- Una fecha: *15/03* o *15/03/2026*\n\n" +
        "O escribí *volver* para ir al menú.",
    };
  }

  if (!ctx.selectedServiceId) {
    return { response: "Error interno. Volvé a intentar.", newState: "BROWSE_SERVICES" };
  }

  const result = await checkAvailability({
    service_id: ctx.selectedServiceId,
    date,
  });

  if (!result.is_business_day) {
    return {
      response:
        `El ${result.day_name} no atendemos. Elegí otra fecha, o escribí *volver*.`,
    };
  }

  if (result.available_slots.length === 0) {
    return {
      response:
        `No hay horarios disponibles el ${result.day_name} ${date}. Probá con otra fecha, o escribí *volver*.`,
    };
  }

  ctx.selectedDate = date;
  ctx.availableSlots = result.available_slots;

  const slotList = result.available_slots
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

  return {
    response:
      `Horarios disponibles el *${result.day_name} ${date}*:\n\n` +
      `${slotList}\n\n` +
      `Escribí el número del horario que preferís, o *volver* para ir al menú.`,
    newState: "SELECT_SLOT",
  };
}
