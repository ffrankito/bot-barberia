import { supabase } from "../lib/supabase.js";
import { formatAR } from "../lib/date-utils.js";

export interface GetAppointmentsInput {
  client_id: string;
  include_past?: boolean;
  include_cancelled?: boolean;
}

export interface AppointmentItem {
  id: string;
  service_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

export interface GetAppointmentsOutput {
  appointments: AppointmentItem[];
}

export async function getAppointments(input: GetAppointmentsInput): Promise<GetAppointmentsOutput> {
  let query = supabase
    .from("appointments")
    .select(`
      id,
      starts_at,
      ends_at,
      status,
      services ( name )
    `)
    .eq("client_id", input.client_id)
    .order("starts_at", { ascending: true });

  if (!input.include_past) {
    query = query.gte("starts_at", new Date().toISOString());
  }

  if (!input.include_cancelled) {
    query = query.neq("status", "cancelled");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error fetching appointments: ${error.message}`);
  }

  return {
    appointments: (data ?? []).map((a: any) => ({
      id: a.id,
      service_name: a.services?.name ?? "Servicio desconocido",
      starts_at: formatAR(new Date(a.starts_at)),
      ends_at: formatAR(new Date(a.ends_at)),
      status: a.status,
    })),
  };
}
