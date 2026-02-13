import type { ConversationContext, HandlerResult } from "../types.js";
import { getAppointments } from "../../tools/get-appointments.js";
import { cancelAppointment } from "../../tools/cancel-appointment.js";

export async function handleCancelAppointment(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  if (!ctx.clientId) {
    return { response: "Error interno.", newState: "MAIN_MENU" };
  }

  // First call: show cancellable appointments
  if (!ctx.cancellableAppointments) {
    const result = await getAppointments({ client_id: ctx.clientId });
    const cancellable = result.appointments.filter((a) => a.status !== "cancelled");

    if (cancellable.length === 0) {
      return {
        response:
          "No tenés turnos para cancelar.\n\n" +
          "1. Ver servicios y sacar turno\n" +
          "2. Ver mis turnos\n" +
          "3. Cancelar un turno\n" +
          "4. Salir",
        newState: "MAIN_MENU",
      };
    }

    ctx.cancellableAppointments = cancellable.map((a) => ({
      id: a.id,
      service_name: a.service_name,
      starts_at: a.starts_at,
    }));

    const list = cancellable
      .map((a, i) => `${i + 1}. *${a.service_name}* - ${a.starts_at}`)
      .join("\n");

    return {
      response:
        `¿Cuál turno querés cancelar?\n\n${list}\n\n` +
        `Escribí el número, o *volver* para ir al menú.`,
    };
  }

  // Second call: process selection
  const choice = parseInt(message.trim(), 10);
  const appointments = ctx.cancellableAppointments;

  if (isNaN(choice) || choice < 1 || choice > appointments.length) {
    return {
      response: `Escribí un número del 1 al ${appointments.length}, o *volver*.`,
    };
  }

  const selected = appointments[choice - 1]!;
  const result = await cancelAppointment({
    appointment_id: selected.id,
    client_id: ctx.clientId,
  });

  ctx.cancellableAppointments = undefined;

  if (!result.success) {
    return {
      response:
        `${result.error}\n\n` +
        "1. Ver servicios y sacar turno\n" +
        "2. Ver mis turnos\n" +
        "3. Cancelar un turno\n" +
        "4. Salir",
      newState: "MAIN_MENU",
    };
  }

  return {
    response:
      `Turno de *${selected.service_name}* del ${selected.starts_at} cancelado.\n\n` +
      `¿Necesitás algo más?\n\n` +
      "1. Ver servicios y sacar turno\n" +
      "2. Ver mis turnos\n" +
      "3. Cancelar un turno\n" +
      "4. Salir",
    newState: "MAIN_MENU",
  };
}
