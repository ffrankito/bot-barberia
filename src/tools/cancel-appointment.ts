import { supabase } from "../lib/supabase.js";
import { formatAR } from "../lib/date-utils.js";

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
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", input.appointment_id)
    .eq("client_id", input.client_id)
    .neq("status", "cancelled")
    .select("id, starts_at, status")
    .maybeSingle();

  if (error) {
    return { success: false, error: `Error cancelando turno: ${error.message}` };
  }

  if (!data) {
    return { success: false, error: "No se encontró el turno o ya está cancelado." };
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
