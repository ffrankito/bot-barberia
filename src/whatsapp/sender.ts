const KAPSO_API_URL = "https://api.kapso.ai/meta/whatsapp/v24.0";

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  const apiKey = process.env.KAPSO_API_KEY;

  if (!phoneNumberId || !apiKey) {
    throw new Error("Missing KAPSO_PHONE_NUMBER_ID or KAPSO_API_KEY");
  }

  // Kapso espera el número sin el "+" (ej: "5493413935931")
  const toDigits = to.replace(/^\+/, "");

  const url = `${KAPSO_API_URL}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits,
      type: "text",
      text: { body },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Kapso API error (${response.status}):`, errorBody);
    throw new Error(`Kapso API error: ${response.status}`);
  }
}
