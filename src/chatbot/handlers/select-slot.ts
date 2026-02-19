import type { ConversationContext, HandlerResult } from "../types.js";
import { dayNameES, getDayOfWeek } from "../../lib/date-utils.js";

export async function handleSelectSlot(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  const slots = ctx.availableSlots;

  if (!slots || slots.length === 0) {
    return { response: "Error interno. Volvé a intentar.", newState: "BROWSE_SERVICES" };
  }

  const choice = parseInt(message.trim(), 10);

  if (isNaN(choice) || choice < 1 || choice > slots.length) {
    return {
      response: `Por favor escribí un número del 1 al ${slots.length}, o *volver* para ir al menú.`,
    };
  }

  ctx.selectedSlot = slots[choice - 1]!;

  const dayName = ctx.selectedDate ? dayNameES(getDayOfWeek(ctx.selectedDate)) : "";

  return {
    response:
      `Resumen de tu turno:\n\n` +
      `- Servicio: *${ctx.selectedServiceName}*\n` +
      `- Fecha: *${dayName} ${ctx.selectedDate}*\n` +
      `- Horario: *${ctx.selectedSlot}*\n\n` +
      `¿Confirmás? Escribí *si* o *no*.`,
    newState: "CONFIRM_BOOKING",
  };
}
