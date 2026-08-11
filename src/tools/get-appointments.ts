import { query } from "../lib/db.js";
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
  const conditions = ["a.client_id = $1"];
  const params: any[] = [input.client_id];

  if (!input.include_past) {
    params.push(new Date().toISOString());
    conditions.push(`a.starts_at >= $${params.length}`);
  }

  if (!input.include_cancelled) {
    conditions.push(`a.status != 'cancelled'`);
  }

  const rows = await query<any>(
    `SELECT a.id, a.starts_at, a.ends_at, a.status, s.name AS service_name
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.starts_at ASC`,
    params
  );

  return {
    appointments: rows.map((a) => ({
      id: a.id,
      service_name: a.service_name ?? "Servicio desconocido",
      starts_at: formatAR(new Date(a.starts_at)),
      ends_at: formatAR(new Date(a.ends_at)),
      status: a.status,
    })),
  };
}
