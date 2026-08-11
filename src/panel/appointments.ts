import { query } from "../lib/db.js";
import { formatDateAR, formatTimeAR } from "../lib/date-utils.js";

export interface PanelAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  date: string;
  time: string;
  status: string;
  payment_status: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  price: number;
  notes: string;
}

export interface GetPanelAppointmentsInput {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  status?: string; // "all" | "confirmed" | "cancelled" | "pending"
}

export async function getPanelAppointments(
  input: GetPanelAppointmentsInput
): Promise<PanelAppointment[]> {
  const fromISO = `${input.from}T00:00:00`;
  const toISO = `${input.to}T23:59:59`;

  const params: any[] = [fromISO, toISO];
  let statusFilter = "";
  if (input.status && input.status !== "all") {
    params.push(input.status);
    statusFilter = `AND a.status = $${params.length}`;
  }

  const rows = await query<any>(
    `SELECT a.id, a.starts_at, a.ends_at, a.status, a.payment_status, a.notes,
            c.name AS client_name, c.phone AS client_phone,
            s.name AS service_name, s.price AS price
     FROM appointments a
     JOIN clients c ON c.id = a.client_id
     JOIN services s ON s.id = a.service_id
     WHERE a.starts_at >= $1 AND a.starts_at <= $2 ${statusFilter}
     ORDER BY a.starts_at ASC`,
    params
  );

  return rows.map((a) => {
    const starts = new Date(a.starts_at);
    return {
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      date: formatDateAR(starts),
      time: formatTimeAR(starts),
      status: a.status,
      payment_status: a.payment_status ?? "pending",
      client_name: a.client_name ?? "Cliente",
      client_phone: a.client_phone ?? "",
      service_name: a.service_name ?? "Servicio",
      price: Number(a.price ?? 0),
      notes: a.notes ?? "",
    };
  });
}
