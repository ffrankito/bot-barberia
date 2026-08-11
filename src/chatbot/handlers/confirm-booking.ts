import type { ConversationContext, HandlerResult } from "../types.js";
import { createAppointment } from "../../tools/create-appointment.js";
import { checkAvailability } from "../../tools/check-availability.js";

export async function handleConfirmBooking(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  const answer = message.trim().toLowerCase();

  // Detectar intent de confirmación desde la IA
  const confirmIntent = ctx.lastIntent?.intent;

  // Confirmación negativa (NO)
  const isNo = 
    answer === "no" ||
    confirmIntent === "CONFIRM_NO" ||
    answer.includes("nah") ||
    answer.includes("mejor no") ||
    answer.includes("dejá") ||
    answer.includes("cancelar");

  if (isNo) {
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

  // Confirmación positiva (SI)
  const isYes =
    answer === "si" ||
    answer === "sí" ||
    confirmIntent === "CONFIRM_YES" ||
    answer.includes("dale") ||
    answer.includes("ok") ||
    answer.includes("perfecto") ||
    answer.includes("confirmo") ||
    answer.includes("va bien") ||
    answer.includes("está bien");

  if (!isYes) {
    // AI shortcut entry: if we arrived here with all booking data, show summary.
    if (ctx.selectedServiceName && ctx.selectedDate && ctx.selectedSlot) {
      const priceText = ctx.selectedServicePrice ? `- Precio: $${ctx.selectedServicePrice}\n` : '';
      
      return {
        response:
          `Confirmación de turno:\n\n` +
          `- Servicio: ${ctx.selectedServiceName}\n` +
          `- Fecha: ${ctx.selectedDate}\n` +
          `- Hora: ${ctx.selectedSlot}\n` +
          priceText +
          `\nRespondé *si* para confirmar o *no* para cancelar.\n` +
          `(También podés decir "dale", "ok", "perfecto")`,
      };
    }

    return { 
      response: "Por favor confirmá con *si* o *no*.\n(También podés decir 'dale', 'ok', 'perfecto')" 
    };
  }

  if (!ctx.clientId || !ctx.selectedServiceId || !ctx.selectedDate || !ctx.selectedSlot) {
    return { response: "Error interno. Volvé a intentar.", newState: "MAIN_MENU" };
  }

  const result = await createAppointment({
    client_id: ctx.clientId,
    service_id: ctx.selectedServiceId,
    date: ctx.selectedDate,
    time: ctx.selectedSlot,
  });

  if (!result.success) {
    if (result.error?.includes("no está disponible")) {
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

  // Guardar el appointment ID en el contexto para el siguiente paso
  ctx.lastAppointmentId = result.appointment?.id;

  // En lugar de generar el pago automáticamente, preguntar método de pago
  const priceText = ctx.selectedServicePrice ? `💰 Precio: $${ctx.selectedServicePrice}\n\n` : '';

  return {
    response:
      `✅ *¡Turno reservado!*\n\n` +
      `📅 ${ctx.selectedServiceName}\n` +
      `🕐 ${ctx.selectedDate} - ${ctx.selectedSlot}\n` +
      priceText +
      `¿Cómo preferís pagar?\n\n` +
      `1. 💳 Pagar ahora (Mercado Pago)\n` +
      `2. 💵 Pagar en el local\n\n` +
      `(O escribí "mercado pago" / "efectivo")`,
    newState: "SELECT_PAYMENT_METHOD",
  };
}