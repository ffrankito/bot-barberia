import "dotenv/config";
import express from "express";
import { processMessage } from "../chatbot/handler.js";
import { sendWhatsAppMessage } from "./sender.js";
import { normalizePhone } from "../lib/phone-utils.js";
import { supabase } from "../lib/supabase.js";
import { checkRateLimit } from "../middleware/rate-limiter.js";
import { logger, logMessage, logError } from "../lib/logger.js";
import { handleMercadoPagoWebhook } from "../payments/webhook-handler.js";
import { startScheduler } from "../jobs/scheduler.js";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";

logger.info({
  port: PORT,
  verifyToken: VERIFY_TOKEN ? '✅ Configurado' : '❌ Falta',
  supabaseUrl: process.env.SUPABASE_URL ? '✅ Configurado' : '❌ Falta',
  whatsappToken: process.env.WHATSAPP_ACCESS_TOKEN ? '✅ Configurado' : '❌ Falta',
}, '🔧 Configuración cargada');

// Webhook verification (GET) - Meta sends this to verify your endpoint
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logger.debug({
    mode,
    tokenMatch: token === VERIFY_TOKEN,
  }, '📞 Webhook verification request');

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logger.info('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn({
      modeMatch: mode === "subscribe",
      tokenMatch: token === VERIFY_TOKEN,
    }, '⚠️ Webhook verification failed');
    res.sendStatus(403);
  }
});

// Webhook handler (POST) - receives incoming messages
app.post("/webhook", async (req, res) => {
  // Always respond 200 quickly to avoid retries
  res.sendStatus(200);

  try {
    const body = req.body;

    logger.debug({ body }, '📩 Webhook recibido');

    const entries = body?.entry;
    if (!Array.isArray(entries)) {
      logger.debug('⚠️ No entries array');
      return;
    }

    for (const entry of entries) {
      const changes = entry?.changes;
      if (!Array.isArray(changes)) {
        logger.debug('⚠️ No changes array');
        continue;
      }

      for (const change of changes) {
        const value = change?.value;
        if (!value || value.messaging_product !== "whatsapp") {
          logger.debug('⚠️ Not a WhatsApp message');
          continue;
        }

        const messages = value.messages;
        if (!Array.isArray(messages)) {
          logger.debug('⚠️ No messages array');
          continue;
        }

        for (const msg of messages) {
          // Only handle text messages
          if (msg.type !== "text") {
            logger.debug({ type: msg.type }, '⚠️ Not a text message');
            continue;
          }

          const from = normalizePhone(msg.from);
          const text: string = msg.text?.body ?? "";

          logger.debug({
            originalPhone: msg.from,
            normalizedPhone: from,
          }, '🔍 Procesando mensaje');

          logMessage(from, text, 'incoming');

          // 🛡️ RATE LIMITING
          if (!checkRateLimit(from)) {
            logger.warn({ phone: from }, '⚠️ Rate limit exceeded');
            await sendWhatsAppMessage(from, "⚠️ Demasiados mensajes. Por favor esperá un minuto.");
            continue;
          }

          logger.debug({ phone: from }, '⏳ Procesando con chatbot handler');
          const reply = await processMessage(from, text);
          logger.debug({ phone: from }, '✅ Handler completado');

          if (reply) {
            logMessage(from, reply, 'outgoing');
            await sendWhatsAppMessage(from, reply);
          } else {
            logger.debug({ phone: from }, '⚠️ No hay respuesta para enviar');
          }

          logger.info({ phone: from }, '✅ Mensaje procesado completamente');
        }
      }
    }
  } catch (error) {
    logError(error, 'webhook processing');
  }
});

// Health check
app.get("/health", async (_req, res) => {
  logger.debug('🏥 Health check request');
  let supabaseOk = true;
  try {
    const { error } = await supabase.from("services").select("id").limit(1);
    if (error) {
      logger.error({ error }, '❌ Supabase error');
      supabaseOk = false;
    } else {
      logger.debug('✅ Supabase OK');
    }
  } catch (e) {
    logger.error({ error: e }, '❌ Supabase catch');
    supabaseOk = false;
  }
  const checks = { server: true, supabase: supabaseOk };
  const status = supabaseOk ? "ok" : "degraded";
  logger.debug({ status, checks }, '🏥 Health response');
  res.json({ status, checks });
});

app.post("/api/webhooks/mercadopago", handleMercadoPagoWebhook);

// Capturar errores no manejados
process.on('uncaughtException', (error) => {
  logError(error, 'uncaughtException');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(reason, 'unhandledRejection');
});

// Error handler middleware
app.use((err: any, req: any, res: any, next: any) => {
  logError(err, 'express');
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, '🚀 Chatbot server running');
});

// Iniciar scheduler de jobs (recordatorios, etc)
startScheduler(60); // Ejecuta cada 60 minutos