import type { ConversationContext, HandlerResult } from "../types.js";
import { getAppointments } from "../../tools/get-appointments.js";
import { cancelAppointment } from "../../tools/cancel-appointment.js";
import { supabase } from "../../lib/supabase.js";

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

  // Cancel lead in Kommo
  try {
    const { data: appointment } = await supabase
      .from('appointments')
      .select('kommo_lead_id')
      .eq('id', selected.id)
      .single();

    if (appointment?.kommo_lead_id) {
      console.log('🔍 Cancelando lead en Kommo, ID:', appointment.kommo_lead_id);
      
      const { updateLeadStage } = await import("../../kommo/leads.js");
      await updateLeadStage(appointment.kommo_lead_id, 143); // 143 = "Venta Perdido"
      
      console.log('✅ Lead cancelado en Kommo');
    } else {
      console.log('⚠️ No hay lead_id para cancelar en Kommo');
    }
  } catch (e) {
    console.error('⚠️ Error cancelando lead en Kommo:', e);
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