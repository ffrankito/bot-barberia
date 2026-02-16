import "dotenv/config";
import express from "express";
import { processMessage } from "../chatbot/handler.js";
import { sendWhatsAppMessage } from "./sender.js";
import { normalizePhone } from "../lib/phone-utils.js";
import { supabase } from "../lib/supabase.js";
import { checkRateLimit } from "../middleware/rate-limiter.js";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";

console.log('🔧 Configuración cargada:');
console.log('   PORT:', PORT);
console.log('   VERIFY_TOKEN:', VERIFY_TOKEN ? '✅ Configurado' : '❌ Falta');
console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Configurado' : '❌ Falta');
console.log('   WHATSAPP_ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? '✅ Configurado' : '❌ Falta');

// Webhook verification (GET) - Meta sends this to verify your endpoint
app.get("/webhook", (req, res) => {
  console.log('📞 Webhook verification request');
  console.log('   hub.mode:', req.query["hub.mode"]);
  console.log('   hub.verify_token:', req.query["hub.verify_token"]);
  console.log('   VERIFY_TOKEN esperado:', VERIFY_TOKEN);

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    console.warn("⚠️ Webhook verification failed");
    console.warn("   Mode match:", mode === "subscribe");
    console.warn("   Token match:", token === VERIFY_TOKEN);
    res.sendStatus(403);
  }
});

// Webhook handler (POST) - receives incoming messages
app.post("/webhook", async (req, res) => {
  // Always respond 200 quickly to avoid retries
  res.sendStatus(200);

  try {
    const body = req.body;

    console.log('\n' + '='.repeat(80));
    console.log('📩 WEBHOOK RECIBIDO:', JSON.stringify(body, null, 2));
    console.log('='.repeat(80) + '\n');

    const entries = body?.entry;
    if (!Array.isArray(entries)) {
      console.log('⚠️ No entries array');
      return;
    }

    for (const entry of entries) {
      const changes = entry?.changes;
      if (!Array.isArray(changes)) {
        console.log('⚠️ No changes array');
        continue;
      }

      for (const change of changes) {
        const value = change?.value;
        if (!value || value.messaging_product !== "whatsapp") {
          console.log('⚠️ Not a WhatsApp message');
          continue;
        }

        const messages = value.messages;
        if (!Array.isArray(messages)) {
          console.log('⚠️ No messages array');
          continue;
        }

        for (const msg of messages) {
          // Only handle text messages
          if (msg.type !== "text") {
            console.log('⚠️ Not a text message, type:', msg.type);
            continue;
          }

          console.log('\n' + '-'.repeat(80));
          console.log('🔍 PROCESANDO MENSAJE');
          console.log('🔍 NÚMERO ORIGINAL (msg.from):', msg.from);
          console.log('🔍 TIPO:', typeof msg.from);
          console.log('🔍 LONGITUD:', msg.from.length);

          const from = normalizePhone(msg.from);
          
          console.log('🔍 NÚMERO NORMALIZADO:', from);
          console.log('🔍 TIPO:', typeof from);
          console.log('🔍 LONGITUD:', from.length);
          console.log('-'.repeat(80) + '\n');

          const text: string = msg.text?.body ?? "";

          console.log(`💬 Mensaje de [${from}]: ${text}`);

          // 🛡️ RATE LIMITING
          if (!checkRateLimit(from)) {
            console.warn(`⚠️ Rate limit exceeded for ${from}`);
            await sendWhatsAppMessage(from, "⚠️ Demasiados mensajes. Por favor esperá un minuto.");
            continue; // Saltar al siguiente mensaje
          }

          console.log('⏳ Procesando con chatbot handler...');
          const reply = await processMessage(from, text);
          console.log('✅ Handler completado');

          if (reply) {
            console.log(`📤 Enviando respuesta a: ${from}`);
            console.log(`📝 Respuesta (primeros 100 chars): ${reply.substring(0, 100)}...`);
            await sendWhatsAppMessage(from, reply);
          } else {
            console.log('⚠️ No hay respuesta para enviar');
          }

          console.log('✅ Mensaje procesado completamente\n');
        }
      }
    }
  } catch (error) {
    console.error('\n' + '❌'.repeat(40));
    console.error("❌ Error processing webhook:", error);
    console.error('❌'.repeat(40) + '\n');
  }
});

// Health check
app.get("/health", async (_req, res) => {
  console.log('🏥 Health check request');
  let supabaseOk = true;
  try {
    const { error } = await supabase.from("services").select("id").limit(1);
    if (error) {
      console.error('❌ Supabase error:', error);
      supabaseOk = false;
    } else {
      console.log('✅ Supabase OK');
    }
  } catch (e) {
    console.error('❌ Supabase catch:', e);
    supabaseOk = false;
  }
  const checks = { server: true, supabase: supabaseOk };
  const status = supabaseOk ? "ok" : "degraded";
  console.log('🏥 Health response:', { status, checks });
  res.json({ status, checks });
});

// Capturar errores no manejados
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION:', reason);
});

// Error handler middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error('💥 EXPRESS ERROR:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '🚀'.repeat(40));
  console.log(`🚀 Chatbot server running on port ${PORT}`);
  console.log(`🚀 Server listening on 0.0.0.0:${PORT}`);
  console.log('🚀 Waiting for WhatsApp messages...');
  console.log('🚀'.repeat(40) + '\n');
});