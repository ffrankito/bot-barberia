import type { ConversationContext, HandlerResult } from "../types.js";
import { getAppointments } from "../../tools/get-appointments.js";
import { cancelAppointment } from "../../tools/cancel-appointment.js";

export async function handleCancelAppointment(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  if (!ctx.clientId) {
    return { response: "Error interno.", newState: "MAIN_MENU" };
  }

  // Primera llamada: cargar y mostrar los turnos cancelables
  if (!ctx.cancellableAppointments) {
    const result = await getAppointments({ client_id: ctx.clientId });
    const cancellable = result.appointments.filter((a) => a.status !== "cancelled");

    if (cancellable.length === 0) {
      return {
        response:
          "No tenés turnos para cancelar.\n\n" +
          "¿En qué te puedo ayudar?\n\n" +
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

    // Si solo hay uno, mostrar y pedir confirmación directamente
    if (cancellable.length === 1) {
      const único = cancellable[0];
      return {
        response:
          `Encontré tu turno:\n\n` +
          `*${único.service_name}* — ${único.starts_at}\n\n` +
          `¿Lo cancelamos? Respondé *si* o *no*.`,
      };
    }

    const list = cancellable
      .map((a, i) => `${i + 1}. *${a.service_name}* — ${a.starts_at}`)
      .join("\n");

    return {
      response:
        `¿Cuál turno querés cancelar?\n\n${list}\n\n` +
        `Escribí el número o describí el turno (ej: "el del viernes", "el de corte").`,
    };
  }

  // Segunda llamada: procesar la selección
  const appointments = ctx.cancellableAppointments;
  const trimmed = message.trim().toLowerCase();

  // Si es "si" y hay un solo turno → cancelar ese
  if ((trimmed === "si" || trimmed === "sí") && appointments.length === 1) {
    return performCancellation(ctx, appointments[0]);
  }

  // Intentar por número
  const choice = parseInt(message.trim(), 10);
  if (!isNaN(choice) && choice >= 1 && choice <= appointments.length) {
    return performCancellation(ctx, appointments[choice - 1]);
  }

  // Intentar matchear por texto (servicio, fecha, día)
  const matched = matchAppointmentByText(appointments, trimmed);
  if (matched) {
    return performCancellation(ctx, matched);
  }

  return {
    response: `No entendí. Escribí el número del turno (1-${appointments.length}) o describilo mejor.\nO escribí *volver* para ir al menú.`,
  };
}

function matchAppointmentByText(
  appointments: Array<{ id: string; service_name: string; starts_at: string }>,
  text: string
): (typeof appointments)[0] | null {
  // Matchear por nombre de servicio
  const byService = appointments.find((a) =>
    a.service_name.toLowerCase().includes(text) ||
    text.includes(a.service_name.toLowerCase().split(" ")[0])
  );
  if (byService) return byService;

  // Matchear por número de día (ej: "el 26")
  const dayMatch = text.match(/\b(\d{1,2})\b/);
  if (dayMatch) {
    const targetDay = parseInt(dayMatch[1], 10);
    const byDay = appointments.find((a) => {
      const d = new Date(a.starts_at);
      return d.getDate() === targetDay;
    });
    if (byDay) return byDay;
  }

  // Matchear por día de semana
  const daysMap: Record<string, number> = {
    lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 0,
  };
  for (const [dayName, dayNum] of Object.entries(daysMap)) {
    if (text.includes(dayName)) {
      const byWeekday = appointments.find((a) => new Date(a.starts_at).getDay() === dayNum);
      if (byWeekday) return byWeekday;
    }
  }

  return null;
}

async function performCancellation(
  ctx: ConversationContext,
  selected: { id: string; service_name: string; starts_at: string }
): Promise<HandlerResult> {
  const result = await cancelAppointment({
    appointment_id: selected.id,
    client_id: ctx.clientId!,
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

  return {
    response:
      `✅ Turno de *${selected.service_name}* del ${selected.starts_at} cancelado.\n\n` +
      `¿Necesitás algo más?\n\n` +
      `1. Ver servicios y sacar turno\n` +
      `2. Ver mis turnos\n` +
      `3. Cancelar un turno\n` +
      `4. Salir`,
    newState: "MAIN_MENU",
  };
}