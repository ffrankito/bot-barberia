import type { ConversationContext, HandlerResult } from "../types.js";
import { getAppointments } from "../../tools/get-appointments.js";

export async function handleViewAppointments(
  ctx: ConversationContext,
  _message: string
): Promise<HandlerResult> {
  if (!ctx.clientId) {
    return { response: "Error interno.", newState: "MAIN_MENU" };
  }

  const result = await getAppointments({ client_id: ctx.clientId });

  if (result.appointments.length === 0) {
    return {
      response:
        "No tenés turnos próximos.\n\n" +
        "1. Ver servicios y sacar turno\n" +
        "2. Ver mis turnos\n" +
        "3. Cancelar un turno\n" +
        "4. Salir",
      newState: "MAIN_MENU",
    };
  }

  const list = result.appointments
    .map((a, i) => {
      const statusLabel = a.status === "pending" ? "Pendiente" : "Confirmado";
      return `${i + 1}. *${a.service_name}*\n   ${a.starts_at} - ${a.ends_at}\n   Estado: ${statusLabel}`;
    })
    .join("\n\n");

  return {
    response:
      `Tus próximos turnos:\n\n${list}\n\n` +
      `1. Ver servicios y sacar turno\n` +
      `2. Ver mis turnos\n` +
      `3. Cancelar un turno\n` +
      `4. Salir`,
    newState: "MAIN_MENU",
  };
}
