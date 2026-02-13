import type { ConversationContext, HandlerResult } from "../types.js";
import { createAppointment } from "../../tools/create-appointment.js";
import { checkAvailability } from "../../tools/check-availability.js";
import { createLead } from "../../kommo/leads.js";

export async function handleConfirmBooking(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  const answer = message.trim().toLowerCase();

  if (answer === "no") {
    return {
      response:
        "Turno cancelado. Volvemos al menú.\n\n" +
        "1. Ver servicios y sacar turno\n" +
        "2. Ver mis turnos\n" +
        "3. Cancelar un turno\n" +
        "4. Salir",
      newState: "MAIN_MENU",
    };
  }

  if (answer !== "si" && answer !== "sí") {
    // AI shortcut entry: if we arrived here with all booking data, show summary.
    if (ctx.selectedServiceName && ctx.selectedDate && ctx.selectedSlot) {
      return {
        response:
          `Confirmación de turno:\n\n` +
          `- Servicio: ${ctx.selectedServiceName}\n` +
          `- Fecha: ${ctx.selectedDate}\n` +
          `- Hora: ${ctx.selectedSlot}\n\n` +
          `Respondé *si* para confirmar o *no* para cancelar.`,
      };
    }

    return { response: "Por favor escribí *si* para confirmar o *no* para cancelar." };
  }

  if (!ctx.clientId || !ctx.selectedServiceId || !ctx.selectedDate || !ctx.selectedSlot) {
    return { response: "Error interno. Volvé a intentar.", newState: "MAIN_MENU" };
  }

  const result = await createAppointment({
    client_id: ctx.clientId,
    kommo_contact_id: ctx.kommoContactId,
    service_id: ctx.selectedServiceId,
    date: ctx.selectedDate,
    time: ctx.selectedSlot,
  });

  if (!result.success) {
    // Race condition: slot was taken
    if (result.error?.includes("no está disponible")) {
      // Re-check availability
      const availability = await checkAvailability({
        service_id: ctx.selectedServiceId,
        date: ctx.selectedDate,
      });

      if (availability.available_slots.length > 0) {
        ctx.availableSlots = availability.available_slots;
        const slotList = availability.available_slots
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n");

        return {
          response:
            `${result.error}\n\nEstos horarios siguen disponibles:\n\n${slotList}\n\n` +
            `Elegí otro número, o escribí *volver*.`,
          newState: "SELECT_SLOT",
        };
      }

      return {
        response:
          `${result.error} No quedan horarios para esa fecha. Probá con otra fecha.`,
        newState: "CHECK_AVAILABILITY",
      };
    }

    return {
      response: `${result.error}\n\nVolvemos al menú.`,
      newState: "MAIN_MENU",
    };
  }

  // Non-fatal: create Kommo lead
  if (ctx.kommoContactId && ctx.selectedServiceName) {
    try {
      await createLead({
        contactId: ctx.kommoContactId,
        serviceName: ctx.selectedServiceName,
        appointmentDate: `${ctx.selectedDate} ${ctx.selectedSlot}`,
      });
    } catch (e) {
      console.error("Kommo lead creation failed:", e);
    }
  }

  // Clear booking context
  ctx.selectedServiceId = undefined;
  ctx.selectedServiceName = undefined;
  ctx.selectedServiceDuration = undefined;
  ctx.selectedDate = undefined;
  ctx.availableSlots = undefined;
  ctx.selectedSlot = undefined;

  return {
    response:
      `¡Turno confirmado!\n\n` +
      `- Inicio: ${result.appointment!.starts_at}\n` +
      `- Fin: ${result.appointment!.ends_at}\n` +
      `- Estado: pendiente\n\n` +
      `¿Necesitás algo más?\n\n` +
      `1. Ver servicios y sacar turno\n` +
      `2. Ver mis turnos\n` +
      `3. Cancelar un turno\n` +
      `4. Salir`,
    newState: "MAIN_MENU",
  };
}
