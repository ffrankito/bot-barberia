import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import { formatAR } from "../lib/date-utils.js";
import { updateLeadStage } from "../kommo/leads.js";

// Schema de validación
const CancelAppointmentSchema = z.object({
  appointment_id: z.string().uuid("appointment_id debe ser un UUID válido"),
  client_id: z.string().uuid("client_id debe ser un UUID válido"),
});

export interface CancelAppointmentInput {
  appointment_id: string;
  client_id: string; // ownership check
}

export interface CancelAppointmentOutput {
  success: boolean;
  appointment?: {
    id: string;
    starts_at: string;
    status: string;
  };
  error?: string;
}

export async function cancelAppointment(input: CancelAppointmentInput): Promise<CancelAppointmentOutput> {
  // Validar input con Zod
  const validation = CancelAppointmentSchema.safeParse(input);
  
  if (!validation.success) {
    const errors = validation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
    console.error('❌ Validación fallida:', errors);
    return { 
      success: false, 
      error: `Datos inválidos: ${errors}` 
    };
  }

  // 1. Primero obtenemos el appointment con el kommo_lead_id
  const { data: appointmentData, error: fetchError } = await supabase
    .from("appointments")
    .select("id, starts_at, status, kommo_lead_id")
    .eq("id", input.appointment_id)
    .eq("client_id", input.client_id)
    .neq("status", "cancelled")
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: `Error cancelando turno: ${fetchError.message}` };
  }

  if (!appointmentData) {
    return { success: false, error: "No se encontró el turno o ya está cancelado." };
  }

  // 2. Actualizar en Supabase
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", input.appointment_id)
    .eq("client_id", input.client_id)
    .neq("status", "cancelled")
    .select("id, starts_at, status, kommo_lead_id")
    .maybeSingle();

  if (error) {
    return { success: false, error: `Error cancelando turno: ${error.message}` };
  }

  if (!data) {
    return { success: false, error: "No se encontró el turno o ya está cancelado." };
  }

  // 3. Actualizar el Lead en Kommo si existe
  if (data.kommo_lead_id) {
    try {
      const cancelledStageId = Number(process.env.KOMMO_CANCELLED_STAGE_ID);
      
      if (!Number.isFinite(cancelledStageId)) {
        console.error('⚠️  KOMMO_CANCELLED_STAGE_ID no está configurado. El lead no se moverá en Kommo.');
      } else {
        console.log(`🔄 Moviendo lead ${data.kommo_lead_id} al estado CANCELADO (${cancelledStageId})...`);
        await updateLeadStage(data.kommo_lead_id, cancelledStageId);
        console.log(`✅ Lead ${data.kommo_lead_id} movido a CANCELADO en Kommo`);
      }
    } catch (kommoError) {
      console.error('❌ Error actualizando lead en Kommo:', kommoError);
      // No fallamos la cancelación si Kommo falla, solo logueamos el error
    }
  } else {
    console.log('ℹ️  No hay kommo_lead_id para este turno, se omite actualización en Kommo');
  }

  return {
    success: true,
    appointment: {
      id: data.id,
      starts_at: formatAR(new Date(data.starts_at)),
      status: data.status,
    },
  };
}