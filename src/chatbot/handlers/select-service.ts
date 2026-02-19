import type { ConversationContext, HandlerResult } from "../types.js";

export async function handleSelectService(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  const services = (ctx as any)._servicesList as Array<{
    id: string;
    name: string;
    duration_minutes: number;
    price: number;
  }> | undefined;

  if (!services || services.length === 0) {
    return {
      response: "Hubo un error. Volvé a intentar.",
      newState: "BROWSE_SERVICES",
    };
  }

  const choice = parseInt(message.trim(), 10);

  if (isNaN(choice) || choice < 1 || choice > services.length) {
    return {
      response:
        `Por favor escribí un número del 1 al ${services.length}, o *volver* para ir al menú.`,
    };
  }

  const selected = services[choice - 1]!;
  ctx.selectedServiceId = selected.id;
  ctx.selectedServiceName = selected.name;
  ctx.selectedServiceDuration = selected.duration_minutes;
  ctx.selectedServicePrice = selected.price; // ✅ AGREGADO

  return {
    response:
      `Elegiste *${selected.name}* (${selected.duration_minutes} min - $${selected.price}).\n\n` + // ✅ AGREGADO PRECIO
      `¿Para qué fecha querés el turno?\n` +
      `Podés escribir: *hoy*, *mañana*, un día de la semana (ej: *lunes*), o una fecha (ej: *15/03*).`,
    newState: "CHECK_AVAILABILITY",
  };
}