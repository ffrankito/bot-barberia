import type { ConversationContext, HandlerResult } from "./types.js";
import { getSession, updateSession, clearSession } from "./session.js";

import { handleGreeting } from "./handlers/greeting.js";
import { handleIdentifyClient } from "./handlers/identify-client.js";
import { handleRegisterClient } from "./handlers/register-client.js";
import { handleMainMenu } from "./handlers/main-menu.js";
import { handleBrowseServices } from "./handlers/browse-services.js";
import { handleSelectService } from "./handlers/select-service.js";
import { handleCheckAvailability } from "./handlers/check-availability.js";
import { handleSelectSlot } from "./handlers/select-slot.js";
import { handleConfirmBooking } from "./handlers/confirm-booking.js";
import { handleViewAppointments } from "./handlers/view-appointments.js";
import { handleCancelAppointment } from "./handlers/cancel-appointment.js";
import { handleDone } from "./handlers/done.js";

import { parseIntent } from "../ai/intent-parser.js";
import { searchServices } from "../tools/search-services.js";

/**
 * Process an incoming message and return the bot's response.
 * This is the main entry point for the conversational state machine.
 */
export async function processMessage(phone: string, message: string): Promise<string> {
  const ctx = getSession(phone);
  const normalizedMsg = message.trim().toLowerCase();
  let messageForFSM = message;

  // Carry over last AI intent after the GREETING -> IDENTIFY_CLIENT auto-advance.
  // If the user sent a natural-language request in their first message, we store it in ctx.lastIntent
  // and apply the shortcut once we land in MAIN_MENU.
  if (!message.trim() && ctx.state === "MAIN_MENU" && ctx.lastIntent && !ctx.lastIntentApplied) {
    const intentRes = ctx.lastIntent;
    ctx.lastIntentApplied = true;
    try {
      const prevState = ctx.state;
      const shortcut = await applyIntentShortcut(intentRes, ctx);
      if (shortcut) {
        updateSession(phone, ctx);
        return shortcut;
      }
      if (ctx.state !== prevState) {
        // We jumped states due to intent; avoid feeding natural language into menu handlers.
        messageForFSM = "";
      }
    } catch (e) {
      console.error("Intent carryover shortcut failed:", e);
    }
  }

  // Universal keywords: "volver" or "menu" -> reset to MAIN_MENU (if identified)
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

    updateSession(phone, ctx);
    return (
      `¿En qué te puedo ayudar?\n\n` +
      `1. Ver servicios y sacar turno\n` +
      `2. Ver mis turnos\n` +
      `3. Cancelar un turno\n` +
      `4. Salir`
    );
  }

  let result: HandlerResult | undefined;

    // -----------------------------------------------------------------------
  // AI intent parsing (thin layer)
  // - Only runs on states where the user can write freely
  // - Always falls back to the existing menu-driven state machine
  // -----------------------------------------------------------------------
  const shouldParseAI =
    Boolean(message.trim()) &&
    (ctx.state === "GREETING" ||
      ctx.state === "MAIN_MENU" ||
      ctx.state === "CHECK_AVAILABILITY" ||
      ctx.state === "CONFIRM_BOOKING");

  if (shouldParseAI) {
    const intentRes = await parseIntent(message, ctx);
    ctx.lastIntent = intentRes;
    ctx.lastIntentApplied = false;

    if (intentRes.confidence > 0.5) {
      const prevState = ctx.state;
      const shortcut = await applyIntentShortcut(intentRes, ctx);
      if (shortcut) {
        updateSession(phone, ctx);
        return shortcut;
      }
      if (ctx.state !== prevState) {
        // We jumped states due to intent; avoid feeding natural language into menu handlers.
        messageForFSM = "";
      }
    }
  }

  // If AI didn't produce a shortcut, fall back to the state machine.
  if (!result) {
    try {
      result = await routeToHandler(ctx, messageForFSM);
    } catch (error) {
      console.error(`Error in state ${ctx.state}:`, error);
      return "Hubo un error procesando tu mensaje. Por favor intentá de nuevo.";
    }
  } else {
    // When we took an AI shortcut, we still need to set ctx.state consistently
    if (result.newState) ctx.state = result.newState;
  }

  // Update state if handler returned a new one
  if (result.newState) {
    ctx.state = result.newState;
  }

  updateSession(phone, ctx);

  // For auto-advancing states, chain the next handler immediately
  if (ctx.state === "IDENTIFY_CLIENT") {
    const nextResult = await processMessage(phone, "");
    return result.response ? `${result.response}\n\n${nextResult}` : nextResult;
  }

  if (ctx.state === "BROWSE_SERVICES" && result.newState === "BROWSE_SERVICES") {
    // Re-entered BROWSE_SERVICES -> auto-fetch
    return processMessage(phone, "");
  }

  if (ctx.state === "VIEW_MY_APPOINTMENTS" && result.newState === "VIEW_MY_APPOINTMENTS") {
    return processMessage(phone, "");
  }

  if (ctx.state === "CANCEL_APPOINTMENT" && result.newState === "CANCEL_APPOINTMENT") {
    return processMessage(phone, "");
  }

  // DONE -> clear session
  if (ctx.state === "DONE") {
    clearSession(phone);
  }

  return result.response;
}

async function applyIntentShortcut(intentRes: any, ctx: ConversationContext): Promise<string | null> {
  // Menu intent
  if (intentRes.intent === "MENU") {
    ctx.state = "MAIN_MENU";
    return (
      `¿En qué te puedo ayudar?\n\n` +
      `1. Ver servicios y sacar turno\n` +
      `2. Ver mis turnos\n` +
      `3. Cancelar un turno\n` +
      `4. Salir`
    );
  }

  // Greeting intent -> restart flow
  if (intentRes.intent === "GREETING") {
    ctx.state = "GREETING";
    return null; // let FSM handle GREETING
  }

  // Goodbye intent -> exit
  if (intentRes.intent === "GOODBYE") {
    ctx.state = "DONE";
    return "¡Gracias! Cuando quieras, escribime de nuevo 🙂";
  }

  // View appointments
  if (intentRes.intent === "VIEW_APPOINTMENTS") {
    ctx.state = "VIEW_MY_APPOINTMENTS";
    return ""; // FSM auto-fetches in handler.ts
  }

  // Cancel appointment
  if (intentRes.intent === "CANCEL_APPOINTMENT") {
    ctx.state = "CANCEL_APPOINTMENT";
    return "";
  }

  // Book appointment
  if (intentRes.intent === "BOOK_APPOINTMENT") {
    // 1) Resolve service (best effort)
    if (intentRes.entities?.serviceName) {
      try {
        const { services } = await searchServices({ query: intentRes.entities.serviceName });
        const best = services[0];
        if (best) {
          ctx.selectedServiceId = best.id;
          ctx.selectedServiceName = best.name;
          ctx.selectedServiceDuration = best.duration_minutes;
        }
      } catch (e) {
        console.error("Service lookup failed:", e);
      }
    }

    // 2) Date/time prefill
    if (intentRes.entities?.date) ctx.selectedDate = intentRes.entities.date;
    if (intentRes.entities?.time) ctx.selectedSlot = intentRes.entities.time;

    // 3) Jump logic
    if (ctx.selectedServiceId && ctx.selectedDate && ctx.selectedSlot) {
      ctx.state = "CONFIRM_BOOKING";
      return (
        `Confirmación de turno:\n\n` +
        `- Servicio: ${ctx.selectedServiceName}\n` +
        `- Fecha: ${ctx.selectedDate}\n` +
        `- Hora: ${ctx.selectedSlot}\n\n` +
        `Respondé *si* para confirmar o *no* para cancelar.`
      );
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


async function routeToHandler(ctx: ConversationContext, message: string): Promise<HandlerResult> {
  switch (ctx.state) {
    case "GREETING":
      return handleGreeting(ctx, message);
    case "IDENTIFY_CLIENT":
      return handleIdentifyClient(ctx, message);
    case "REGISTER_CLIENT":
      return handleRegisterClient(ctx, message);
    case "MAIN_MENU":
      return handleMainMenu(ctx, message);
    case "BROWSE_SERVICES":
      return handleBrowseServices(ctx, message);
    case "SELECT_SERVICE":
      return handleSelectService(ctx, message);
    case "CHECK_AVAILABILITY":
      return handleCheckAvailability(ctx, message);
    case "SELECT_SLOT":
      return handleSelectSlot(ctx, message);
    case "CONFIRM_BOOKING":
      return handleConfirmBooking(ctx, message);
    case "VIEW_MY_APPOINTMENTS":
      return handleViewAppointments(ctx, message);
    case "CANCEL_APPOINTMENT":
      return handleCancelAppointment(ctx, message);
    case "DONE":
      return handleDone(ctx, message);
    default:
      return { response: "Error desconocido. Escribí *menu* para volver al menú.", newState: "MAIN_MENU" };
  }
}
