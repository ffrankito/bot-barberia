import { supabase } from "../lib/supabase.js";
import { arDateTimeToUTC, formatAR } from "../lib/date-utils.js";

export interface CreateAppointmentInput {
  client_id: string;
  kommo_contact_id?: number;
  service_id: string;
  date: string;  // YYYY-MM-DD
  time: string;  // HH:mm
  notes?: string;
}

export interface CreateAppointmentOutput {
  success: boolean;
  appointment?: {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
  };
  error?: string;
}

export async function createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentOutput> {
  // 1. Get service duration
  const { data: service, error: serviceErr } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", input.service_id)
    .single();

  if (serviceErr || !service) {
    return { success: false, error: "Servicio no encontrado." };
  }

  // 2. Compute starts_at and ends_at
  const startsAt = arDateTimeToUTC(input.date, input.time);
  const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60 * 1000);

  // 3. Check for overlapping appointments (atomic check)
  const { data: overlapping, error: overlapErr } = await supabase
    .from("appointments")
    .select("id")
    .neq("status", "cancelled")
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1);

  if (overlapErr) {
    return { success: false, error: "Error verificando disponibilidad." };
  }

  if (overlapping && overlapping.length > 0) {
    return { success: false, error: "El horario ya no está disponible. Por favor elegí otro." };
  }

  // 4. Insert appointment
  const { data: appointment, error: insertErr } = await supabase
    .from("appointments")
    .insert({
      client_id: input.client_id,
      kommo_contact_id: input.kommo_contact_id ?? null,
      service_id: input.service_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      notes: input.notes ?? "",
    })
    .select("id, starts_at, ends_at, status")
    .single();

  if (insertErr) {
    return { success: false, error: `Error creando turno: ${insertErr.message}` };
  }

  return {
    success: true,
    appointment: {
      id: appointment.id,
      starts_at: formatAR(new Date(appointment.starts_at)),
      ends_at: formatAR(new Date(appointment.ends_at)),
      status: appointment.status,
    },
  };
}
