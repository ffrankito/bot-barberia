import "dotenv/config";
import express from "express";
import path from "node:path";
import { createHmac } from "crypto";
import { processMessage } from "../chatbot/handler.js";
import { sendWhatsAppMessage } from "./sender.js";
import { normalizePhone } from "../lib/phone-utils.js";
import { query } from "../lib/db.js";
import { checkRateLimit } from "../middleware/rate-limiter.js";
import { logger, logMessage, logError } from "../lib/logger.js";
import { handleMercadoPagoWebhook } from "../payments/webhook-handler.js";
import { startScheduler } from "../jobs/scheduler.js";
import { getPanelAppointments } from "../panel/appointments.js";
import { formatDateAR } from "../lib/date-utils.js";

const app = express();
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
function verifyMetaSignature(req: any): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.warn("⚠️ WHATSAPP_APP_SECRET no configurado, omitiendo verificación de firma");
    return true;
  }

  const signature = req.headers["x-hub-signature-256"] as string;
  if (!signature) {
    console.warn("⚠️ Webhook sin header x-hub-signature-256");
    return false;
  }

  const expected = "sha256=" + createHmac("sha256", appSecret)
    .update(req.rawBody)
    .digest("hex");

  return signature === expected;
}

logger.info({
  port: PORT,
  verifyToken: VERIFY_TOKEN ? '✅ Configurado' : '❌ Falta',
  databaseUrl: process.env.DATABASE_URL ? '✅ Configurado' : '❌ Falta',
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
  // FIX: Verificar firma de Meta antes de procesar
  if (!verifyMetaSignature(req)) {
    console.warn("🚫 Webhook con firma inválida rechazado");
    return res.sendStatus(403);
  }

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
  let dbOk = true;
  try {
    await query("SELECT id FROM services LIMIT 1");
    logger.debug('✅ DB OK');
  } catch (e) {
    logger.error({ error: e }, '❌ DB error');
    dbOk = false;
  }
  const checks = { server: true, database: dbOk };
  const status = dbOk ? "ok" : "degraded";
  logger.debug({ status, checks }, '🏥 Health response');
  res.json({ status, checks });
});

app.post("/api/webhooks/mercadopago", handleMercadoPagoWebhook);

// Panel de turnos (solo lectura, sin auth por ahora)
app.get("/panel", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "panel.html"));
});

app.get("/api/panel/appointments", async (req, res) => {
  try {
    const today = formatDateAR(new Date()).split("/").reverse().join("-"); // dd/mm/yyyy -> yyyy-mm-dd
    const from = typeof req.query.from === "string" ? req.query.from : today;
    const to = typeof req.query.to === "string" ? req.query.to : from;
    const status = typeof req.query.status === "string" ? req.query.status : "all";

    const appointments = await getPanelAppointments({ from, to, status });
    res.json({ appointments });
  } catch (error) {
    logError(error, "panel appointments");
    res.status(500).json({ error: "Error obteniendo los turnos" });
  }
});

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