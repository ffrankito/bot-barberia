import type { ConversationContext, HandlerResult } from "./types.js";
import { getSession, updateSession, clearSession } from "./session.js";
import { query, queryOne } from "../lib/db.js";

import { handleGreeting } from "./handlers/greeting.js";
import { handleIdentifyClient } from "./handlers/identify-client.js";
import { handleRegisterClient } from "./handlers/register-client.js";
import { handleMainMenu } from "./handlers/main-menu.js";
import { handleBrowseServices } from "./handlers/browse-services.js";
import { handleSelectService } from "./handlers/select-service.js";
import { handleCheckAvailability } from "./handlers/check-availability.js";
import { handleSelectSlot } from "./handlers/select-slot.js";
import { handleConfirmBooking } from "./handlers/confirm-booking.js";
import { handleSelectPaymentMethod } from "./handlers/select-payment-method.js";
import { handleViewAppointments } from "./handlers/view-appointments.js";
import { handleCancelAppointment } from "./handlers/cancel-appointment.js";
import { handleDone } from "./handlers/done.js";

import { parseIntent } from "../ai/intent-parser.js";
import { searchServices } from "../tools/search-services.js";
import { checkAvailability } from "../tools/check-availability.js";
import { dayNameES, getDayOfWeek, parseUserDate } from "../lib/date-utils.js";

export async function processMessage(phone: string, message: string): Promise<string> {
  const ctx = await getSession(phone);
  const normalizedMsg = message.trim().toLowerCase();
  let messageForFSM = message;

  // ── Universal keywords: volver / menu ────────────────────────────────────
  if (
    (normalizedMsg === "volver" || normalizedMsg === "menu" || normalizedMsg === "menú") &&
    ctx.state !== "GREETING" &&
    ctx.state !== "IDENTIFY_CLIENT" &&
    ctx.state !== "REGISTER_CLIENT" &&
    ctx.clientId
  ) {
    ctx.state = "MAIN_MENU";
    ctx.selectedServiceId = undefined;
    ctx.selectedServiceName = undefined;
    ctx.selectedServiceDuration = undefined;
    ctx.selectedDate = undefined;
    ctx.availableSlots = undefined;
    ctx.selectedSlot = undefined;
    ctx.cancellableAppointments = undefined;
    await updateSession(phone, ctx);
    return menuText();
  }

  // ── Intent carryover after GREETING → IDENTIFY_CLIENT auto-advance ────────
  if (!message.trim() && ctx.state === "MAIN_MENU" && ctx.lastIntent && !ctx.lastIntentApplied) {
    const intentRes = ctx.lastIntent;
    ctx.lastIntentApplied = true;
    try {
      const shortcut = await applyIntentShortcut(intentRes, ctx);
      if (shortcut !== null) {
        await updateSession(phone, ctx);
        return shortcut || await continueFlow(phone, ctx);
      }
    } catch (e) {
      console.error("Intent carryover failed:", e);
    }
  }

  // ── AI intent parsing ─────────────────────────────────────────────────────
  // Activo en TODOS los estados con mensaje real (no vacío)
  const STATES_SKIP_AI = new Set(["IDENTIFY_CLIENT", "REGISTER_CLIENT"]);
  const shouldParseAI = Boolean(message.trim()) && !STATES_SKIP_AI.has(ctx.state);

  let result: HandlerResult | undefined;

  if (shouldParseAI) {
    const intentRes = await parseIntent(message, ctx);
    ctx.lastIntent = intentRes;
    ctx.lastIntentApplied = false;

    if (intentRes.confidence > 0.5) {
      const prevState = ctx.state;
      const shortcut = await applyIntentShortcut(intentRes, ctx);
      if (shortcut !== null) {
        await updateSession(phone, ctx);
        return shortcut || await continueFlow(phone, ctx);
      }
      if (ctx.state !== prevState) {
        messageForFSM = "";
      }
    }
  }

  // ── FSM fallback ──────────────────────────────────────────────────────────
  if (!result) {
    try {
      result = await routeToHandler(ctx, messageForFSM);
    } catch (error) {
      console.error(`Error in state ${ctx.state}:`, error);
      return "Hubo un error procesando tu mensaje. Por favor intentá de nuevo.";
    }
  }

  if (result.newState) ctx.state = result.newState;
  await updateSession(phone, ctx);

  // ── Auto-advance states ───────────────────────────────────────────────────
  if (ctx.state === "IDENTIFY_CLIENT") {
    const nextResult = await processMessage(phone, "");
    return result.response ? `${result.response}\n\n${nextResult}` : nextResult;
  }
  if (ctx.state === "BROWSE_SERVICES" && result.newState === "BROWSE_SERVICES") {
    return processMessage(phone, "");
  }
  if (ctx.state === "VIEW_MY_APPOINTMENTS" && result.newState === "VIEW_MY_APPOINTMENTS") {
    return processMessage(phone, "");
  }
  if (ctx.state === "CANCEL_APPOINTMENT" && result.newState === "CANCEL_APPOINTMENT") {
    return processMessage(phone, "");
  }

  if (ctx.state === "DONE") {
    await clearSession(phone);
  }

  return result.response;
}

async function continueFlow(phone: string, ctx: ConversationContext): Promise<string> {
  const result = await routeToHandler(ctx, "");
  if (result.newState) ctx.state = result.newState;
  await updateSession(phone, ctx);
  return result.response;
}

async function applyIntentShortcut(intentRes: any, ctx: ConversationContext): Promise<string | null> {
  const { intent, entities } = intentRes;

  if (intent === "MENU") {
    ctx.state = "MAIN_MENU";
    resetBookingCtx(ctx);
    return menuText();
  }

  if (intent === "GREETING") {
    ctx.state = "GREETING";
    return null;
  }

  if (intent === "GOODBYE") {
    ctx.state = "DONE";
    return `¡Gracias! Cuando quieras, escribime de nuevo 🙂`;
  }

  if (intent === "VIEW_APPOINTMENTS") {
    ctx.state = "VIEW_MY_APPOINTMENTS";
    return "";
  }

  if (intent === "QUERY_AVAILABILITY") {
    return handleQueryAvailability(entities, ctx);
  }

  if (intent === "CONFIRM_YES") {
    if (ctx.state === "CONFIRM_BOOKING") return null;
    if (ctx.state === "SELECT_PAYMENT_METHOD") return null;

    if (ctx.clientId) {
      try {
        const nextAppointment = await queryOne<{ id: string }>(
          `SELECT id FROM appointments
           WHERE client_id = $1 AND status = 'confirmed' AND starts_at >= $2
           ORDER BY starts_at ASC LIMIT 1`,
          [ctx.clientId, new Date().toISOString()]
        );

        if (nextAppointment) {
          await query(
            `UPDATE appointments SET attendance_confirmed = true WHERE id = $1`,
            [nextAppointment.id]
          );
          return "✅ ¡Perfecto! Tu asistencia está confirmada. Te esperamos 😊";
        }
      } catch {}
    }
    return null;
  }

  if (intent === "CONFIRM_NO") {
    if (ctx.state === "CONFIRM_BOOKING") return null;
    ctx.state = "CANCEL_APPOINTMENT";
    return "";
  }

  if (intent === "CANCEL_APPOINTMENT") {
    if (!ctx.clientId) return null;

    const ref = entities?.appointmentReference;
    const dateEntity = entities?.date;
    const rawDate = intentRes.rawDateText;

    if (ref || dateEntity || rawDate) {
      const directResult = await tryCancelByReference(
        ctx,
        ref,
        dateEntity,
        rawDate,
        entities?.serviceName
      );
      if (directResult) return directResult;
    }

    ctx.state = "CANCEL_APPOINTMENT";
    return "";
  }

  if (intent === "PAY_NOW" || intent === "PAY_LATER") {
    if (ctx.state === "SELECT_PAYMENT_METHOD") return null;
  }

  if (intent === "BOOK_APPOINTMENT") {
    if (entities?.serviceName) {
      try {
        const { services } = await searchServices({ query: entities.serviceName });
        const best = services[0];
        if (best) {
          ctx.selectedServiceId = best.id;
          ctx.selectedServiceName = best.name;
          ctx.selectedServiceDuration = best.duration_minutes;
          ctx.selectedServicePrice = best.price;
        }
      } catch {}
    }

    if (entities?.date) ctx.selectedDate = entities.date;
    if (entities?.time) ctx.selectedSlot = entities.time;

    if (ctx.selectedServiceId && ctx.selectedDate && ctx.selectedSlot) {
      try {
        const availability = await checkAvailability({
          service_id: ctx.selectedServiceId,
          date: ctx.selectedDate,
        });

        const isAvailable = availability.available_slots.includes(ctx.selectedSlot);
        ctx.availableSlots = availability.available_slots;

        if (isAvailable) {
          if (ctx.clientId) {
            ctx.state = "CONFIRM_BOOKING";
            const priceText = ctx.selectedServicePrice ? `- Precio: $${ctx.selectedServicePrice}\n` : "";
            return (
              `Confirmación de turno:\n\n` +
              `- Servicio: ${ctx.selectedServiceName}\n` +
              `- Fecha: ${ctx.selectedDate}\n` +
              `- Hora: ${ctx.selectedSlot}\n` +
              priceText +
              `\nRespondé *si* para confirmar o *no* para cancelar.`
            );
          } else {
            ctx.state = "GREETING";
            return null;
          }
        } else {
          const requestedSlot = ctx.selectedSlot;
          ctx.selectedSlot = undefined;
          ctx.state = "SELECT_SLOT";
          const slotList = availability.available_slots.map((s, i) => `${i + 1}. ${s}`).join("\n");
          const dayName = dayNameES(getDayOfWeek(ctx.selectedDate));
          return (
            `El horario ${requestedSlot} no está disponible 😔\n\n` +
            `Horarios disponibles el *${dayName} ${ctx.selectedDate}*:\n\n` +
            `${slotList}\n\n` +
            `Escribí el número del horario que preferís, o *volver* para ir al menú.`
          );
        }
      } catch {}
    }

    if (ctx.selectedServiceId && ctx.selectedDate) {
      ctx.state = "CHECK_AVAILABILITY";
      return "";
    }

    if (ctx.selectedServiceId) {
      ctx.state = "CHECK_AVAILABILITY";
      return "";
    }

    ctx.state = "BROWSE_SERVICES";
    return "";
  }

  return null;
}

async function handleQueryAvailability(entities: any, ctx: ConversationContext): Promise<string> {
  const dateText = entities?.date;
  const serviceName = entities?.serviceName;

  if (!dateText) {
    return (
      `Atendemos:\n\n` +
      `📅 Lunes a Viernes: 9:00 a 18:00\n` +
      `📅 Sábados: 9:00 a 13:00\n` +
      `❌ Domingos: cerrado\n\n` +
      `¿Querés ver horarios disponibles para una fecha específica?\n` +
      `Escribí el día, por ejemplo: *el jueves* o *mañana*`
    );
  }

  let serviceId = ctx.selectedServiceId;
  let displayServiceName = ctx.selectedServiceName;

  if (!serviceId) {
    if (serviceName) {
      try {
        const { services } = await searchServices({ query: serviceName });
        if (services[0]) {
          serviceId = services[0].id;
          displayServiceName = services[0].name;
        }
      } catch {}
    }
    if (!serviceId) {
      try {
        const { services } = await searchServices({});
        if (services[0]) {
          serviceId = services[0].id;
          displayServiceName = undefined;
        }
      } catch {}
    }
  }

  if (!serviceId) {
    return "No encontré servicios disponibles. Escribí *menu* para ver las opciones.";
  }

  try {
    const availability = await checkAvailability({ service_id: serviceId, date: dateText });
    const dayName = dayNameES(getDayOfWeek(dateText));

    if (!availability.is_business_day) {
      return `El *${dayName}* no atendemos. ¿Querés consultar otro día?`;
    }

    if (availability.available_slots.length === 0) {
      return (
        `No hay horarios disponibles el *${dayName} ${dateText}* 😔\n\n` +
        `¿Querés consultar otro día? Escribí la fecha o día.`
      );
    }

    const serviceLabel = displayServiceName ? ` (para ${displayServiceName})` : "";
    const slotList = availability.available_slots.map((s, i) => `${i + 1}. ${s}`).join("\n");

    return (
      `Horarios disponibles el *${dayName} ${dateText}*${serviceLabel}:\n\n` +
      `${slotList}\n\n` +
      `¿Querés reservar uno? Escribí el número o decime el servicio y hora que preferís.\n` +
      `(Ej: "quiero el 3" o "quiero corte a las 15:00")`
    );
  } catch {
    return "Hubo un error consultando la disponibilidad. Intentá de nuevo.";
  }
}

async function tryCancelByReference(
  ctx: ConversationContext,
  reference: string | undefined,
  dateISO: string | undefined,
  rawDateText: string | undefined,
  serviceName: string | undefined
): Promise<string | null> {
  if (!ctx.clientId) return null;

  try {
    const appointments = await query<any>(
      `SELECT a.id, a.starts_at, a.ends_at, a.status, s.name AS service_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       WHERE a.client_id = $1 AND a.status != 'cancelled' AND a.starts_at >= $2
       ORDER BY a.starts_at ASC`,
      [ctx.clientId, new Date().toISOString()]
    );

    if (!appointments || appointments.length === 0) {
      return "No tenés turnos activos para cancelar.";
    }

    let matched: any = null;

    if (dateISO) {
      matched = appointments.find((a: any) => a.starts_at.startsWith(dateISO));
    }

    if (!matched && rawDateText) {
      const dayMatch = rawDateText.match(/^(\d{1,2})$/);
      if (dayMatch) {
        const targetDay = parseInt(dayMatch[1], 10);
        matched = appointments.find((a: any) => {
          const d = new Date(a.starts_at);
          return d.getDate() === targetDay;
        });
      }
    }

    if (!matched && serviceName) {
      const lower = serviceName.toLowerCase();
      matched = appointments.find((a: any) =>
        a.services?.name?.toLowerCase().includes(lower)
      );
    }

    if (!matched && appointments.length === 1) {
      matched = appointments[0];
    }

    if (!matched) {
      ctx.state = "CANCEL_APPOINTMENT";
      return null;
    }

    ctx.cancellableAppointments = appointments.map((a: any) => ({
      id: a.id,
      service_name: a.services?.name ?? "Servicio",
      starts_at: a.starts_at,
    }));

    const serviceLabel = matched.services?.name ?? "turno";
    const dateLabel = new Date(matched.starts_at).toLocaleDateString("es-AR", {
      weekday: "long", day: "numeric", month: "long",
    });
    const timeLabel = new Date(matched.starts_at).toLocaleTimeString("es-AR", {
      hour: "2-digit", minute: "2-digit",
    });

    const { cancelAppointment } = await import("../tools/cancel-appointment.js");
    const result = await cancelAppointment({
      appointment_id: matched.id,
      client_id: ctx.clientId,
    });

    ctx.cancellableAppointments = undefined;

    if (!result.success) {
      return `${result.error}\n\n¿Querés algo más? Escribí *menu* para volver.`;
    }

    return (
      `✅ Turno cancelado:\n\n` +
      `*${serviceLabel}*\n` +
      `📅 ${dateLabel} a las ${timeLabel}\n\n` +
      `¿Necesitás algo más?\n\n` +
      menuText()
    );
  } catch (e) {
    console.error("Error en tryCancelByReference:", e);
    return null;
  }
}

function menuText(): string {
  return (
    `¿En qué te puedo ayudar?\n\n` +
    `1. Ver servicios y sacar turno\n` +
    `2. Ver mis turnos\n` +
    `3. Cancelar un turno\n` +
    `4. Salir`
  );
}

function resetBookingCtx(ctx: ConversationContext): void {
  ctx.selectedServiceId = undefined;
  ctx.selectedServiceName = undefined;
  ctx.selectedServiceDuration = undefined;
  ctx.selectedDate = undefined;
  ctx.availableSlots = undefined;
  ctx.selectedSlot = undefined;
  ctx.cancellableAppointments = undefined;
}

async function routeToHandler(ctx: ConversationContext, message: string): Promise<HandlerResult> {
  switch (ctx.state) {
    case "GREETING":            return handleGreeting(ctx, message);
    case "IDENTIFY_CLIENT":     return handleIdentifyClient(ctx, message);
    case "REGISTER_CLIENT":     return handleRegisterClient(ctx, message);
    case "MAIN_MENU":           return handleMainMenu(ctx, message);
    case "BROWSE_SERVICES":     return handleBrowseServices(ctx, message);
    case "SELECT_SERVICE":      return handleSelectService(ctx, message);
    case "CHECK_AVAILABILITY":  return handleCheckAvailability(ctx, message);
    case "SELECT_SLOT":         return handleSelectSlot(ctx, message);
    case "CONFIRM_BOOKING":     return handleConfirmBooking(ctx, message);
    case "SELECT_PAYMENT_METHOD": return handleSelectPaymentMethod(ctx, message);
    case "VIEW_MY_APPOINTMENTS":  return handleViewAppointments(ctx, message);
    case "CANCEL_APPOINTMENT":    return handleCancelAppointment(ctx, message);
    case "DONE":                  return handleDone(ctx, message);
    default:
      return { response: "Error desconocido. Escribí *menu* para volver al menú.", newState: "MAIN_MENU" };
  }
}