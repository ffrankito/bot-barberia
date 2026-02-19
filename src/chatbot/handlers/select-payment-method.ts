import type { ConversationContext, HandlerResult } from "../types.js";
import { createPayment } from "../../payments/create-payment.js";
import { logger } from "../../lib/logger.js";

export async function handleSelectPaymentMethod(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  const choice = message.trim();

  // Validar que tengamos los datos necesarios
  if (!ctx.selectedServicePrice || !ctx.selectedServiceName || !ctx.selectedDate || !ctx.selectedSlot) {
    return {
      response: "Error: datos del turno incompletos. Volvé a intentar.",
      newState: "MAIN_MENU",
    };
  }

  // Opción 1: Pagar ahora con Mercado Pago
  if (choice === "1") {
    // Aquí debería estar el appointment_id guardado en el contexto
    if (!ctx.lastAppointmentId) {
      return {
        response: "Error: no se encontró el turno. Por favor contactanos.",
        newState: "MAIN_MENU",
      };
    }

    logger.info({
      appointmentId: ctx.lastAppointmentId,
      amount: ctx.selectedServicePrice,
    }, "💳 Generando link de pago...");

    try {
      const paymentResult = await createPayment({
        appointment_id: ctx.lastAppointmentId,
        amount: ctx.selectedServicePrice,
        description: `Turno: ${ctx.selectedServiceName} - ${ctx.selectedDate} ${ctx.selectedSlot}`,
      });

      if (paymentResult.success && paymentResult.payment_url) {
        logger.info({ paymentUrl: paymentResult.payment_url }, "✅ Link generado");

        // Limpiar contexto
        ctx.selectedServiceId = undefined;
        ctx.selectedServiceName = undefined;
        ctx.selectedServiceDuration = undefined;
        ctx.selectedServicePrice = undefined;
        ctx.selectedDate = undefined;
        ctx.availableSlots = undefined;
        ctx.selectedSlot = undefined;
        ctx.lastAppointmentId = undefined;

        return {
          response:
            `💳 *Link de pago generado*\n\n` +
            `${paymentResult.payment_url}\n\n` +
            `💰 Monto: $${ctx.selectedServicePrice}\n` +
            `⏰ Completá el pago para confirmar tu turno.\n\n` +
            `¿Necesitás algo más?\n\n` +
            `1. Ver servicios y sacar turno\n` +
            `2. Ver mis turnos\n` +
            `3. Cancelar un turno\n` +
            `4. Salir`,
          newState: "MAIN_MENU",
        };
      } else {
        logger.error({ error: paymentResult.error }, "❌ Error generando pago");
        return {
          response:
            `⚠️ Hubo un problema generando el link de pago.\n\n` +
            `Por favor contactanos para completar tu reserva.\n\n` +
            `¿Necesitás algo más?\n\n` +
            `1. Ver servicios y sacar turno\n` +
            `2. Ver mis turnos\n` +
            `3. Cancelar un turno\n` +
            `4. Salir`,
          newState: "MAIN_MENU",
        };
      }
    } catch (error: any) {
      logger.error({ error: error.message }, "❌ Excepción generando pago");
      return {
        response:
          `⚠️ Error técnico. Por favor contactanos.\n\n` +
          `¿Necesitás algo más?\n\n` +
          `1. Ver servicios y sacar turno\n` +
          `2. Ver mis turnos\n` +
          `3. Cancelar un turno\n` +
          `4. Salir`,
        newState: "MAIN_MENU",
      };
    }
  }

  // Opción 2: Pagar en el local
  if (choice === "2") {
    // Limpiar contexto
    ctx.selectedServiceId = undefined;
    ctx.selectedServiceName = undefined;
    ctx.selectedServiceDuration = undefined;
    ctx.selectedServicePrice = undefined;
    ctx.selectedDate = undefined;
    ctx.availableSlots = undefined;
    ctx.selectedSlot = undefined;
    ctx.lastAppointmentId = undefined;

    return {
      response:
        `✅ *¡Perfecto!*\n\n` +
        `Tu turno está reservado.\n` +
        `💵 Podés pagar en el local en efectivo o con tarjeta.\n\n` +
        `¡Te esperamos!\n\n` +
        `¿Necesitás algo más?\n\n` +
        `1. Ver servicios y sacar turno\n` +
        `2. Ver mis turnos\n` +
        `3. Cancelar un turno\n` +
        `4. Salir`,
      newState: "MAIN_MENU",
    };
  }

  // Opción inválida
  return {
    response:
      `Por favor elegí una opción válida:\n\n` +
      `1. 💳 Pagar ahora (Mercado Pago)\n` +
      `2. 💵 Pagar en el local`,
  };
}