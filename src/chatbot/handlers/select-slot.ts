import type { ConversationContext, HandlerResult } from "../types.js";
import { dayNameES, getDayOfWeek } from "../../lib/date-utils.js";

// Parsea "15:00", "15", "3", "3 de la tarde", "a las 3" → "HH:mm" o null
function parseTimeText(input: string): string | null {
  const t = input.trim().toLowerCase();

  // Formato exacto HH:mm
  const exact = t.match(/^(\d{1,2}):(\d{2})$/);
  if (exact) {
    const h = parseInt(exact[1], 10);
    const m = parseInt(exact[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // "a las X" / "las X"
  const verboseMatch = t.match(/(?:a\s+las?|las?)\s+(\d{1,2})(?::(\d{2}))?(?:\s+(?:de\s+la\s+)?(tarde|mañana|noche))?/);
  if (verboseMatch) {
    let h = parseInt(verboseMatch[1], 10);
    const m = verboseMatch[2] ? parseInt(verboseMatch[2], 10) : 0;
    const period = verboseMatch[3];
    if (period === "tarde" || period === "noche") {
      if (h < 12) h += 12;
    } else if (period === "mañana") {
      if (h === 12) h = 0;
    } else if (h <= 7) {
      // Heurística: números pequeños (1-7) son PM si no hay aclaración
      h += 12;
    }
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // Número solo: "15", "9", "14"
  const numOnly = t.match(/^(\d{1,2})$/);
  if (numOnly) {
    const h = parseInt(numOnly[1], 10);
    if (h >= 8 && h <= 22) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  return null;
}

export async function handleSelectSlot(
  ctx: ConversationContext,
  message: string
): Promise<HandlerResult> {
  const slots = ctx.availableSlots;

  if (!slots || slots.length === 0) {
    return { response: "Error interno. Volvé a intentar.", newState: "BROWSE_SERVICES" };
  }

  const trimmed = message.trim();

  // 1. Intentar por número de lista
  const choice = parseInt(trimmed, 10);
  if (!isNaN(choice) && choice >= 1 && choice <= slots.length) {
    return confirmSlot(ctx, slots[choice - 1]);
  }

  // 2. Intentar matchear hora escrita en texto ("a las 15", "15:00", "las 3")
  const parsedTime = parseTimeText(trimmed);
  if (parsedTime) {
    const exactMatch = slots.find((s) => s === parsedTime);
    if (exactMatch) return confirmSlot(ctx, exactMatch);

    // Buscar el más cercano (dentro de 30 min)
    const inputMin = toMinutes(parsedTime);
    const closest = slots
      .map((s) => ({ slot: s, diff: Math.abs(toMinutes(s) - inputMin) }))
      .sort((a, b) => a.diff - b.diff)[0];

    if (closest && closest.diff <= 30) {
      return confirmSlot(ctx, closest.slot);
    }

    return {
      response:
        `No hay un horario disponible a las ${parsedTime} 😔\n\n` +
        `Horarios disponibles:\n\n` +
        slots.map((s, i) => `${i + 1}. ${s}`).join("\n") +
        `\n\nEscribí el número o la hora que preferís.`,
    };
  }

  return {
    response:
      `No entendí. Escribí el número del horario o la hora directamente (ej: *15* o *15:00*).\n\n` +
      slots.map((s, i) => `${i + 1}. ${s}`).join("\n"),
  };
}

function confirmSlot(ctx: ConversationContext, slot: string): HandlerResult {
  ctx.selectedSlot = slot;
  const dayName = ctx.selectedDate ? dayNameES(getDayOfWeek(ctx.selectedDate)) : "";
  const priceText = ctx.selectedServicePrice ? `- Precio: $${ctx.selectedServicePrice}\n` : "";

  return {
    response:
      `Resumen de tu turno:\n\n` +
      `- Servicio: *${ctx.selectedServiceName}*\n` +
      `- Fecha: *${dayName} ${ctx.selectedDate}*\n` +
      `- Horario: *${slot}*\n` +
      priceText +
      `\n¿Confirmás? Respondé *si* o *no*.\n(También "dale", "ok", "perfecto")`,
    newState: "CONFIRM_BOOKING",
  };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}