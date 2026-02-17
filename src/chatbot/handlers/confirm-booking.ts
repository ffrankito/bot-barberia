import type { ConversationContext, HandlerResult } from "../types.js";
import { createAppointment } from "../../tools/create-appointment.js";
import { checkAvailability } from "../../tools/check-availability.js";
import { createLead } from "../../kommo/leads.js";
import { createPayment } from "../../payments/create-payment.js";
import { supabase } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";

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
      const priceText = ctx.selectedServicePrice ? `- Precio: $${ctx.selectedServicePrice}\n` : '';
      
      return {
        response:
          `Confirmación de turno:\n\n` +
          `- Servicio: ${ctx.selectedServiceName}\n` +
          `- Fecha: ${ctx.selectedDate}\n` +
          `- Hora: ${ctx.selectedSlot}\n` +
          priceText +
          `\nRespondé *si* para confirmar o *no* para cancelar.`,
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

  // Create Kommo lead and save lead_id
  if (ctx.kommoContactId && ctx.selectedServiceName) {
    try {
      logger.debug('🔍 Creando lead en Kommo...');
      
      const leadId = await createLead({
        contactId: ctx.kommoContactId,
        serviceName: ctx.selectedServiceName,
        appointmentDate: `${ctx.selectedDate} ${ctx.selectedSlot}`,
        price: ctx.selectedServicePrice,
      });
      
      logger.info({ leadId }, '✅ Lead creado en Kommo');

      // Save lead_id to appointment
      if (result.appointment?.id && leadId) {
        await supabase
          .from('appointments')
          .update({ kommo_lead_id: leadId })
          .eq('id', result.appointment.id);
        
        logger.debug('✅ Lead ID guardado en appointment');
      }
    } catch (e) {
      logger.error({ error: e }, '❌ Error creando lead en Kommo');
    }
  }

  // 💳 Generar link de pago con Mercado Pago
  let paymentMessage = '';
  
  if (ctx.selectedServicePrice && ctx.selectedServicePrice > 0 && result.appointment?.id) {
    try {
      logger.debug({ appointmentId: result.appointment.id }, '💳 Generando link de pago...');
      
      const paymentResult = await createPayment({
        appointment_id: result.appointment.id,
        amount: ctx.selectedServicePrice,
        description: `Turno: ${ctx.selectedServiceName} - ${ctx.selectedDate} ${ctx.selectedSlot}`,
      });

      if (paymentResult.success && paymentResult.payment_url) {
        logger.info({ 
          appointmentId: result.appointment.id,
          paymentUrl: paymentResult.payment_url 
        }, '✅ Link de pago generado');

        paymentMessage = 
          `\n💳 *Para confirmar tu turno, completá el pago:*\n` +
          `${paymentResult.payment_url}\n\n` +
          `💰 Monto: $${ctx.selectedServicePrice}\n` +
          `⏰ El link expira en 15 minutos.\n\n`;
      } else {
        logger.error({ error: paymentResult.error }, '❌ Error generando pago');
        paymentMessage = 
          `\n⚠️ Hubo un problema generando el link de pago.\n` +
          `Por favor contactanos para completar la reserva.\n\n`;
      }
    } catch (e) {
      logger.error({ error: e }, '❌ Error en proceso de pago');
    }
  }

  // Clear booking context
  ctx.selectedServiceId = undefined;
  ctx.selectedServiceName = undefined;
  ctx.selectedServiceDuration = undefined;
  ctx.selectedServicePrice = undefined;
  ctx.selectedDate = undefined;
  ctx.availableSlots = undefined;
  ctx.selectedSlot = undefined;

  return {
    response:
      `✅ *¡Turno reservado!*\n\n` +
      `📅 Inicio: ${result.appointment!.starts_at}\n` +
      `🕐 Fin: ${result.appointment!.ends_at}\n` +
      `📋 Estado: Pendiente de pago\n` +
      paymentMessage +
      `¿Necesitás algo más?\n\n` +
      `1. Ver servicios y sacar turno\n` +
      `2. Ver mis turnos\n` +
      `3. Cancelar un turno\n` +
      `4. Salir`,
    newState: "MAIN_MENU",
  };
}