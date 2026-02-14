import "dotenv/config";
import express from "express";
import { processMessage } from "../chatbot/handler.js";
import { sendWhatsAppMessage } from "./sender.js";
import { normalizePhone } from "../lib/phone-utils.js";
import { supabase } from "../lib/supabase.js";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";

// Webhook verification (GET) - Meta sends this to verify your endpoint
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    console.warn("⚠️ Webhook verification failed");
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
  let supabaseOk = true;
  try {
    // lightweight connectivity check (will fail if URL/key invalid or DB unreachable)
    const { error } = await supabase.from("services").select("id").limit(1);
    if (error) supabaseOk = false;
  } catch {
    supabaseOk = false;
  }
  const checks = { server: true, supabase: supabaseOk };
  const status = supabaseOk ? "ok" : "degraded";
  res.json({ status, checks });
});

app.listen(PORT, () => {
  console.log('\n' + '🚀'.repeat(40));
  console.log(`🚀 Chatbot server running on port ${PORT}`);
  console.log('🚀 Waiting for WhatsApp messages...');
  console.log('🚀'.repeat(40) + '\n');
});