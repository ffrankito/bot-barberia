import type { ConversationContext, HandlerResult } from "../types.js";
import { checkAvailability } from "../../tools/check-availability.js";
import { parseUserDate, dayNameES, getDayOfWeek } from "../../lib/date-utils.js";

export async function handleCheckAvailability(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  let date = ctx.selectedDate;

  // Intentar parsear del mensaje si no hay fecha en contexto
  if (!date && message.trim()) {
    const parsed = parseUserDate(message);
    date = parsed || undefined;

    if (!date) {
      return {
        response:
          "No pude entender la fecha. Probá con:\n" +
          "- *hoy* o *mañana*\n" +
          "- Un día: *lunes*, *martes*, *jueves*...\n" +
          "- Una fecha: *15/03* o *15 de marzo*\n\n" +
          "O escribí *volver* para ir al menú.",
      };
    }
  }

  if (!date) {
    return {
      response:
        `¿Para qué fecha querés el turno?\n\n` +
        `Podés escribir: *hoy*, *mañana*, un día (*lunes*, *viernes*) o una fecha (*15/03*).`,
    };
  }

  if (!ctx.selectedServiceId) {
    return { response: "Error interno. Volvé a intentar.", newState: "BROWSE_SERVICES" };
  }

  const result = await checkAvailability({
    service_id: ctx.selectedServiceId,
    date,
  });

  const dayName = dayNameES(getDayOfWeek(date));

  if (!result.is_business_day) {
    return {
      response: `El *${dayName}* no atendemos 😔\n\nElegí otro día, o escribí *volver* para ir al menú.`,
    };
  }

  if (result.available_slots.length === 0) {
    return {
      response:
        `No hay horarios disponibles el *${dayName} ${date}* 😔\n\n` +
        `Probá con otra fecha, o escribí *volver* para ir al menú.`,
    };
  }

  ctx.selectedDate = date;
  ctx.availableSlots = result.available_slots;

  const slotList = result.available_slots.map((s, i) => `${i + 1}. ${s}`).join("\n");

  return {
    response:
      `Horarios disponibles el *${dayName} ${date}*:\n\n` +
      `${slotList}\n\n` +
      `Escribí el número del horario que preferís.\n` +
      `O decime directamente la hora, ej: *"a las 15"*\n\n` +
      `Escribí *volver* para ir al menú.`,
    newState: "SELECT_SLOT",
  };
}