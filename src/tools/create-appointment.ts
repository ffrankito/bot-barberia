import { z } from "zod";
import { query, queryOne } from "../lib/db.js";
import { arDateTimeToUTC, formatAR } from "../lib/date-utils.js";

// Schema de validación
const CreateAppointmentSchema = z.object({
  client_id: z.string().uuid("client_id debe ser un UUID válido"),
  service_id: z.string().uuid("service_id debe ser un UUID válido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe tener formato YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "time debe tener formato HH:mm"),
  notes: z.string().optional(),
});

export interface CreateAppointmentInput {
  client_id: string;
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
  // Validar input con Zod
  const validation = CreateAppointmentSchema.safeParse(input);

  if (!validation.success) {
    const errors = validation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
    console.error('❌ Validación fallida:', errors);
    return {
      success: false,
      error: `Datos inválidos: ${errors}`
    };
  }

  // 1. Get service duration
  const service = await queryOne<{ duration_minutes: number }>(
    `SELECT duration_minutes FROM services WHERE id = $1`,
    [input.service_id]
  );

  if (!service) {
    return { success: false, error: "Servicio no encontrado." };
  }

  // 2. Compute starts_at and ends_at
  const startsAt = arDateTimeToUTC(input.date, input.time);
  const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60 * 1000);

  // 3. Check for overlapping appointments (atomic check)
  const overlapping = await query<{ id: string }>(
    `SELECT id FROM appointments
     WHERE status != 'cancelled' AND starts_at < $1 AND ends_at > $2
     LIMIT 1`,
    [endsAt.toISOString(), startsAt.toISOString()]
  );

  if (overlapping && overlapping.length > 0) {
    return { success: false, error: "El horario ya no está disponible. Por favor elegí otro." };
  }

  // 4. Insert appointment
  try {
    const appointment = await queryOne<{ id: string; starts_at: string; ends_at: string; status: string }>(
      `INSERT INTO appointments (client_id, service_id, starts_at, ends_at, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, starts_at, ends_at, status`,
      [input.client_id, input.service_id, startsAt.toISOString(), endsAt.toISOString(), input.notes ?? ""]
    );

    if (!appointment) {
      return { success: false, error: "Error creando turno." };
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
  } catch (insertErr: any) {
    // El constraint EXCLUDE de Postgres lanza error 23P01 cuando hay overlap
    if (insertErr.code === '23P01') {
      return { success: false, error: "El horario ya no está disponible. Por favor elegí otro." };
    }
    return { success: false, error: `Error creando turno: ${insertErr.message}` };
  }
}
