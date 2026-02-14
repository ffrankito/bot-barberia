import Anthropic from "@anthropic-ai/sdk";
import type { ConversationContext, IntentParseResult, ParsedEntities, UserIntent } from "../chatbot/types.js";
import { parseUserDate } from "../lib/date-utils.js";
import { searchServices } from "../tools/search-services.js";
import { buildIntentSystemPrompt } from "./prompts.js";

const MODEL = "claude-haiku-4-5-20251001";

function toUserIntent(x: unknown): UserIntent {
  const v = String(x ?? "UNKNOWN").toUpperCase();
  const allowed: UserIntent[] = [
    "BOOK_APPOINTMENT",
    "VIEW_APPOINTMENTS",
    "CANCEL_APPOINTMENT",
    "GREETING",
    "MENU",
    "GOODBYE",
    "UNKNOWN",
  ];
  return (allowed as string[]).includes(v) ? (v as UserIntent) : "UNKNOWN";
}

function safeNumber(x: unknown, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeEntities(raw: any): { entities: ParsedEntities; rawDateText?: string } {
  const serviceName = raw?.service_name ? String(raw.service_name).trim() : undefined;
  const dateText = raw?.date_text ? String(raw.date_text).trim() : undefined;
  const time = raw?.time_text ? String(raw.time_text).trim() : undefined;
  const clientName = raw?.client_name ? String(raw.client_name).trim() : undefined;

  const parsedDate = dateText ? parseUserDate(dateText) : null;

  return {
    entities: {
      serviceName: serviceName || undefined,
      date: parsedDate || undefined,
      time: time || undefined,
      clientName: clientName || undefined,
    },
    rawDateText: dateText || undefined,
  };
}

// 5 min cache for system prompt
let cachedPrompt: { at: number; value: string } | null = null;
async function getSystemPrompt(): Promise<string> {
  const now = Date.now();
  if (cachedPrompt && now - cachedPrompt.at < 5 * 60 * 1000) return cachedPrompt.value;
  const { services } = await searchServices({});
  const prompt = buildIntentSystemPrompt({ services });
  cachedPrompt = { at: now, value: prompt };
  return prompt;
}

function quickBypass(message: string): IntentParseResult | null {
  const t = message.trim().toLowerCase();
  if (!t) return null;

  // Single digit/number -> menu-driven flow should handle
  if (/^\d{1,2}$/.test(t)) {
    return { intent: "UNKNOWN", entities: {}, confidence: 0 };
  }

  if (t === "menu" || t === "menú" || t === "volver") {
    return { intent: "MENU", entities: {}, confidence: 1 };
  }

  // Confirmations should be handled by the FSM (skip AI)
  if (t === "si" || t === "sí" || t === "no") {
    return { intent: "UNKNOWN", entities: {}, confidence: 0 };
  }


  if (t === "hola" || t === "buenas" || t === "buenos días" || t === "buenas tardes") {
    return { intent: "GREETING", entities: {}, confidence: 0.9 };
  }

  if (t === "chau" || t === "chao" || t === "gracias" || t === "salir") {
    return { intent: "GOODBYE", entities: {}, confidence: 0.8 };
  }

  return null;
}

export async function parseIntent(message: string, ctx: ConversationContext): Promise<IntentParseResult> {
  const bypass = quickBypass(message);
  if (bypass) return bypass;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { intent: "UNKNOWN", entities: {}, confidence: 0 };

  try {
    const client = new Anthropic({ apiKey });
    const system = await getSystemPrompt();

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      temperature: 0,
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Mensaje del usuario: ${message}\n` +
                `Contexto: state=${ctx.state}, tieneCliente=${Boolean(ctx.clientId)}\n` +
                "Devolvé JSON.",
            },
          ],
        },
      ],
    });

    const blocks = (res.content ?? []) as any[];
    const text = blocks.find((c: any) => c.type === "text")?.text ?? "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    const json = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
    const parsed = JSON.parse(json);

    const intent = toUserIntent(parsed?.intent);
    const confidence = safeNumber(parsed?.confidence, 0);
    const norm = normalizeEntities(parsed?.entities);

    return {
      intent,
      entities: norm.entities,
      confidence,
      rawDateText: norm.rawDateText,
    };
  } catch (err) {
    console.error("Claude parseIntent error:", err);
    return { intent: "UNKNOWN", entities: {}, confidence: 0 };
  }
}
