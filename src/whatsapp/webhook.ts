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
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    console.warn("Webhook verification failed");
    res.sendStatus(403);
  }
});

// Webhook handler (POST) - receives incoming messages
app.post("/webhook", async (req, res) => {
  // Always respond 200 quickly to avoid retries
  res.sendStatus(200);

  try {
    const body = req.body;

    const entries = body?.entry;
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
      const changes = entry?.changes;
      if (!Array.isArray(changes)) continue;

      for (const change of changes) {
        const value = change?.value;
        if (!value || value.messaging_product !== "whatsapp") continue;

        const messages = value.messages;
        if (!Array.isArray(messages)) continue;

        for (const msg of messages) {
          // Only handle text messages
          if (msg.type !== "text") continue;

          const from = normalizePhone(msg.from);
          const text: string = msg.text?.body ?? "";

          console.log(`[${from}] ${text}`);

          const reply = await processMessage(from, text);

          if (reply) {
            await sendWhatsAppMessage(from, reply);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
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
  console.log(`Chatbot server running on port ${PORT}`);
});
