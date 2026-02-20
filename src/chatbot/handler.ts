import type { ConversationContext, HandlerResult } from "./types.js";
import { getSession, updateSession, clearSession } from "./session.js";
import { supabase } from "../lib/supabase.js";

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

/**
 * Process an incoming message and return the bot's response.
 * This is the main entry point for the conversational state machine.
 */
export async function processMessage(phone: string, message: string): Promise<string> {
  console.log('\n' + '🟢'.repeat(40));
  console.log('🟢 PROCESS_MESSAGE - Inicio');
  console.log('🟢 Phone:', phone);
  console.log('🟢 Message:', message);
  console.log('🟢'.repeat(40) + '\n');

  const ctx = await getSession(phone);
  
  console.log('📊 Contexto actual:');
  console.log('   - state:', ctx.state);
  console.log('   - clientId:', ctx.clientId);
  console.log('   - kommoContactId:', ctx.kommoContactId);
  console.log('   - selectedServiceId:', ctx.selectedServiceId);
  console.log('   - selectedServiceName:', ctx.selectedServiceName);
  console.log('   - selectedDate:', ctx.selectedDate);
  console.log('   - selectedSlot:', ctx.selectedSlot);
  console.log();

  const normalizedMsg = message.trim().toLowerCase();
  let messageForFSM = message;

  // Carry over last AI intent after the GREETING -> IDENTIFY_CLIENT auto-advance.
  // If the user sent a natural-language request in their first message, we store it in ctx.lastIntent
  // and apply the shortcut once we land in MAIN_MENU.
  if (!message.trim() && ctx.state === "MAIN_MENU" && ctx.lastIntent && !ctx.lastIntentApplied) {
    console.log('🔄 Aplicando intent carryover...');
    const intentRes = ctx.lastIntent;
    ctx.lastIntentApplied = true;
    try {
      const prevState = ctx.state;
      const shortcut = await applyIntentShortcut(intentRes, ctx);
      if (shortcut) {
        await updateSession(phone, ctx);
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
    console.log('🔙 Volviendo al menú principal');
    ctx.state = "MAIN_MENU";
    ctx.selectedServiceId = undefined;
    ctx.selectedServiceName = undefined;
    ctx.selectedServiceDuration = undefined;
    ctx.selectedDate = undefined;
    ctx.availableSlots = undefined;
    ctx.selectedSlot = undefined;
    ctx.cancellableAppointments = undefined;

    await updateSession(phone, ctx);
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
      ctx.state === "CONFIRM_BOOKING" ||
      ctx.state === "SELECT_PAYMENT_METHOD");

  if (shouldParseAI) {
    console.log('🤖 Parseando intent con AI...');
    const intentRes = await parseIntent(message, ctx);
    console.log('🤖 Intent detectado:', intentRes.intent);
    console.log('🤖 Confidence:', intentRes.confidence);
    console.log('🤖 Entities:', JSON.stringify(intentRes.entities, null, 2));
    
    ctx.lastIntent = intentRes;
    ctx.lastIntentApplied = false;

    if (intentRes.confidence > 0.5) {
      console.log('✅ Confidence > 0.5, intentando shortcut...');
      const prevState = ctx.state;
      const shortcut = await applyIntentShortcut(intentRes, ctx);
      if (shortcut) {
        console.log('✅ Shortcut aplicado exitosamente');
        console.log('   Estado anterior:', prevState);
        console.log('   Estado nuevo:', ctx.state);
        await updateSession(phone, ctx);
        return shortcut;
      }
      if (ctx.state !== prevState) {
        console.log('🔄 Estado cambió sin shortcut, evitando FSM');
        // We jumped states due to intent; avoid feeding natural language into menu handlers.
        messageForFSM = "";
      }
    } else {
      console.log('⚠️ Confidence baja, usando FSM normal');
    }
  }

  // If AI didn't produce a shortcut, fall back to the state machine.
  if (!result) {
    try {
      console.log('🎯 Ruteando al handler para state:', ctx.state);
      result = await routeToHandler(ctx, messageForFSM);
      console.log('✅ Handler completado');
    } catch (error) {
      console.error(`❌ Error in state ${ctx.state}:`, error);
      return "Hubo un error procesando tu mensaje. Por favor intentá de nuevo.";
    }
  } else {
    // When we took an AI shortcut, we still need to set ctx.state consistently
    if (result.newState) ctx.state = result.newState;
  }

  // Update state if handler returned a new one
  if (result.newState) {
    console.log('🔄 Actualizando estado:', ctx.state, '→', result.newState);
    ctx.state = result.newState;
  }

  await updateSession(phone, ctx);

  // For auto-advancing states, chain the next handler immediately
  if (ctx.state === "IDENTIFY_CLIENT") {
    console.log('🔄 Auto-advancing: IDENTIFY_CLIENT');
    const nextResult = await processMessage(phone, "");
    return result.response ? `${result.response}\n\n${nextResult}` : nextResult;
  }

  if (ctx.state === "BROWSE_SERVICES" && result.newState === "BROWSE_SERVICES") {
    console.log('🔄 Auto-advancing: BROWSE_SERVICES');
    // Re-entered BROWSE_SERVICES -> auto-fetch
    return processMessage(phone, "");
  }

  if (ctx.state === "VIEW_MY_APPOINTMENTS" && result.newState === "VIEW_MY_APPOINTMENTS") {
    console.log('🔄 Auto-advancing: VIEW_MY_APPOINTMENTS');
    return processMessage(phone, "");
  }

  if (ctx.state === "CANCEL_APPOINTMENT" && result.newState === "CANCEL_APPOINTMENT") {
    console.log('🔄 Auto-advancing: CANCEL_APPOINTMENT');
    return processMessage(phone, "");
  }

  // DONE -> clear session
  if (ctx.state === "DONE") {
    console.log('👋 Limpiando sesión - DONE');
    await clearSession(phone);
  }

  console.log('🟢 PROCESS_MESSAGE - Fin\n');
  return result.response;
}

async function applyIntentShortcut(intentRes: any, ctx: ConversationContext): Promise<string | null> {
  console.log('\n' + '🚀'.repeat(40));
  console.log('🚀 APPLY_INTENT_SHORTCUT');
  console.log('🚀 Intent:', intentRes.intent);
  console.log('🚀 Entities:', JSON.stringify(intentRes.entities, null, 2));
  console.log('🚀'.repeat(40) + '\n');

  // Menu intent
  if (intentRes.intent === "MENU") {
    console.log('📋 Intent: MENU');
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
    console.log('👋 Intent: GREETING');
    ctx.state = "GREETING";
    return null; // let FSM handle GREETING
  }

  // Goodbye intent -> exit
  if (intentRes.intent === "GOODBYE") {
    console.log('👋 Intent: GOODBYE');
    ctx.state = "DONE";
    return "¡Gracias! Cuando quieras, escribime de nuevo 🙂";
  }

  // View appointments
  if (intentRes.intent === "VIEW_APPOINTMENTS") {
    console.log('👁️ Intent: VIEW_APPOINTMENTS');
    ctx.state = "VIEW_MY_APPOINTMENTS";
    return ""; // FSM auto-fetches in handler.ts
  }

  // Cancel appointment
  if (intentRes.intent === "CANCEL_APPOINTMENT") {
    console.log('❌ Intent: CANCEL_APPOINTMENT');
    ctx.state = "CANCEL_APPOINTMENT";
    return "";
  }

  // Confirm attendance (respuesta a recordatorio)
  if (intentRes.intent === "CONFIRM_YES") {
    console.log('✅ Intent: CONFIRM_YES (confirmación de asistencia)');
    
    // Buscar el próximo turno del cliente
    if (ctx.clientId) {
      try {
        const { data: nextAppointment } = await supabase
          .from('appointments')
          .select('id, starts_at, services(name)')
          .eq('client_id', ctx.clientId)
          .eq('status', 'confirmed')
          .gte('starts_at', new Date().toISOString())
          .order('starts_at', { ascending: true })
          .limit(1)
          .single();
        
        if (nextAppointment) {
          // Marcar como confirmado
          await supabase
            .from('appointments')
            .update({ attendance_confirmed: true })
            .eq('id', nextAppointment.id);
          
          return "✅ Perfecto! Tu asistencia está confirmada. Te esperamos! 😊";
        }
      } catch (e) {
        console.error('Error confirmando asistencia:', e);
      }
    }
    
    return "✅ Recibido! Cualquier cosa escribime.";
  }

  // Deny attendance (respuesta negativa a recordatorio)
  if (intentRes.intent === "CONFIRM_NO") {
    console.log('❌ Intent: CONFIRM_NO (cancelación desde recordatorio)');
    ctx.state = "CANCEL_APPOINTMENT";
    return ""; // Let FSM handle cancellation
  }

  // Book appointment
  if (intentRes.intent === "BOOK_APPOINTMENT") {
    console.log('📅 Intent: BOOK_APPOINTMENT');
    
    // 1) Resolve service (best effort)
    if (intentRes.entities?.serviceName) {
      try {
        console.log('🔍 Buscando servicio:', intentRes.entities.serviceName);
        const { services } = await searchServices({ query: intentRes.entities.serviceName });
        const best = services[0];
        if (best) {
          console.log('✅ Servicio encontrado:', best.name, '(ID:', best.id, 'Precio:', best.price, ')');
          ctx.selectedServiceId = best.id;
          ctx.selectedServiceName = best.name;
          ctx.selectedServiceDuration = best.duration_minutes;
          ctx.selectedServicePrice = best.price;
        } else {
          console.log('⚠️ No se encontró servicio');
        }
      } catch (e) {
        console.error("❌ Service lookup failed:", e);
      }
    }

    // 2) Date/time prefill
    if (intentRes.entities?.date) {
      console.log('📅 Fecha detectada:', intentRes.entities.date);
      ctx.selectedDate = intentRes.entities.date;
    }
    if (intentRes.entities?.time) {
      console.log('🕐 Hora detectada:', intentRes.entities.time);
      ctx.selectedSlot = intentRes.entities.time;
    }

    // 3) Verificar disponibilidad si tiene servicio + fecha + hora
    if (ctx.selectedServiceId && ctx.selectedDate && ctx.selectedSlot) {
      console.log('🔍 Verificando disponibilidad del horario solicitado...');
      
      try {
        const { checkAvailability } = await import("../tools/check-availability.js");
        const availability = await checkAvailability({
          service_id: ctx.selectedServiceId,
          date: ctx.selectedDate,
        });

        const requestedSlot = ctx.selectedSlot;
        const isSlotAvailable = availability.available_slots.includes(requestedSlot);

        if (isSlotAvailable) {
          console.log('✅ Horario disponible!');
          // Guardar slots disponibles por si necesita cambiar
          ctx.availableSlots = availability.available_slots;
          
          // Si ya tiene clientId, ir directo a confirmación
          if (ctx.clientId) {
            console.log('✅ Usuario identificado → CONFIRM_BOOKING');
            ctx.state = "CONFIRM_BOOKING";
            
            const priceText = ctx.selectedServicePrice ? `- Precio: $${ctx.selectedServicePrice}\n` : '';
            
            return (
              `Confirmación de turno:\n\n` +
              `- Servicio: ${ctx.selectedServiceName}\n` +
              `- Fecha: ${ctx.selectedDate}\n` +
              `- Hora: ${ctx.selectedSlot}\n` +
              priceText +
              `\nRespondé *si* para confirmar o *no* para cancelar.`
            );
          } else {
            // No tiene clientId, necesita identificarse primero
            console.log('⚠️ Usuario no identificado → GREETING');
            ctx.state = "GREETING";
            return null; // Let FSM handle identification
          }
        } else {
          console.log('❌ Horario NO disponible, mostrando alternativas');
          // El horario solicitado no está disponible, mostrar alternativas
          ctx.availableSlots = availability.available_slots;
          ctx.selectedSlot = undefined; // Limpiar el slot no disponible
          
          const slotList = availability.available_slots
            .map((s, i) => `${i + 1}. ${s}`)
            .join("\n");

          ctx.state = "SELECT_SLOT";
          return (
            `El horario ${requestedSlot} no está disponible 😔\n\n` +
            `Horarios disponibles el *${availability.day_name} ${ctx.selectedDate}*:\n\n` +
            `${slotList}\n\n` +
            `Escribí el número del horario que preferís, o *volver* para ir al menú.`
          );
        }
      } catch (e) {
        console.error('❌ Error verificando disponibilidad:', e);
        // Si falla, continuar con el flujo normal
      }
    }

    // 4) Jump logic normal (cuando no tiene hora específica)
    console.log('\n📊 Evaluando salto de estado:');
    console.log('   - clientId:', ctx.clientId, ctx.clientId ? '✅' : '❌');
    console.log('   - selectedServiceId:', ctx.selectedServiceId, ctx.selectedServiceId ? '✅' : '❌');
    console.log('   - selectedServicePrice:', ctx.selectedServicePrice, ctx.selectedServicePrice ? '✅' : '❌');
    console.log('   - selectedDate:', ctx.selectedDate, ctx.selectedDate ? '✅' : '❌');
    console.log('   - selectedSlot:', ctx.selectedSlot, ctx.selectedSlot ? '✅' : '❌');

    if (ctx.selectedServiceId) {
      console.log('✅ Servicio seleccionado → CHECK_AVAILABILITY');
      ctx.state = "CHECK_AVAILABILITY";
      return "";
    }

    console.log('⚠️ Faltan datos → BROWSE_SERVICES');
    ctx.state = "BROWSE_SERVICES";
    return "";
  }

  console.log('⚠️ No se aplicó ningún shortcut');
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
    case "SELECT_PAYMENT_METHOD":
      return handleSelectPaymentMethod(ctx, message);
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