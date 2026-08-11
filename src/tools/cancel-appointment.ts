import { z } from "zod";
import { queryOne } from "../lib/db.js";
import { formatAR } from "../lib/date-utils.js";

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

  try {
    const data = await queryOne<{ id: string; starts_at: string; status: string }>(
      `UPDATE appointments SET status = 'cancelled'
       WHERE id = $1 AND client_id = $2 AND status != 'cancelled'
       RETURNING id, starts_at, status`,
      [input.appointment_id, input.client_id]
    );

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
  } catch (error: any) {
    return { success: false, error: `Error cancelando turno: ${error.message}` };
  }
}
