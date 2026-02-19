import type { ServiceItem } from "../tools/search-services.js";

function formatServicesForPrompt(services: ServiceItem[]): string {
  if (!services.length) return "(sin servicios cargados)";
  return services
    .map((s) => `- ${s.name} (duración ${s.duration_minutes} min, precio $${s.price})`)
    .join("\n");
}

export function buildIntentSystemPrompt(args: { services: ServiceItem[] }): string {
  const servicesBlock = formatServicesForPrompt(args.services);

  return (
    "Sos un asistente de un chatbot de WhatsApp para una barbería/peluquería. " +
    "Tu tarea es SOLO clasificar la intención del usuario y extraer datos. " +
    "Respondé SIEMPRE con un JSON válido y nada más.\n\n" +
    "Idiomas: el usuario escribe en español (Argentina).\n" +
    "\n" +
    "INTENTS POSIBLES (exactos):\n" +
    "- BOOK_APPOINTMENT: quiere sacar/crear un turno\n" +
    "- VIEW_APPOINTMENTS: quiere ver sus turnos\n" +
    "- CANCEL_APPOINTMENT: quiere cancelar un turno\n" +
    "- GREETING: saludo\n" +
    "- MENU: pide volver al menú\n" +
    "- GOODBYE: quiere salir/despedirse\n" +
    "- UNKNOWN: no es claro\n\n" +
    "SERVICIOS DISPONIBLES:\n" +
    `${servicesBlock}\n\n` +
    "EXTRACCIÓN DE service_name:\n" +
    "- Si el usuario menciona 'corte', 'cortarme', 'cortarse' → 'Corte de pelo'\n" +
    "- Si menciona 'color', 'teñir', 'tintura' → 'Coloración'\n" +
    "- Si menciona 'barba', 'afeitada' → buscar servicio relacionado con barba\n" +
    "- Si menciona 'peinado', 'brushing' → buscar servicio de peinado\n" +
    "- IMPORTANTE: Siempre intentá matchear con uno de los servicios de la lista de arriba\n" +
    "- Si no estás seguro, poné el nombre más cercano o null\n\n" +
    "SALIDA: devolvé exactamente este JSON (sin markdown, sin ```json):\n" +
    "{\n" +
    '  "intent": "BOOK_APPOINTMENT|VIEW_APPOINTMENTS|CANCEL_APPOINTMENT|GREETING|MENU|GOODBYE|UNKNOWN",\n' +
    '  "entities": {\n' +
    '    "service_name": "string|null",\n' +
    '    "date_text": "string|null",\n' +
    '    "time_text": "string|null",\n' +
    '    "client_name": "string|null"\n' +
    "  },\n" +
    '  "confidence": 0.0\n' +
    "}\n\n" +
    "EJEMPLOS:\n" +
    'Usuario: "hola quiero un corte el viernes a las 3"\n' +
    "Respuesta: " +
    '{"intent":"BOOK_APPOINTMENT","entities":{"service_name":"Corte de pelo","date_text":"viernes","time_text":"15:00","client_name":null},"confidence":0.9}\n\n' +
    'Usuario: "quiero sacar turno"\n' +
    "Respuesta: " +
    '{"intent":"BOOK_APPOINTMENT","entities":{"service_name":null,"date_text":null,"time_text":null,"client_name":null},"confidence":0.8}\n\n' +
    'Usuario: "necesito teñirme mañana"\n' +
    "Respuesta: " +
    '{"intent":"BOOK_APPOINTMENT","entities":{"service_name":"Coloración","date_text":"mañana","time_text":null,"client_name":null},"confidence":0.85}\n\n' +
    "REGLAS IMPORTANTES:\n" +
    "- confidence va de 0 a 1.\n" +
    "- date_text es texto crudo (ej: 'viernes', 'mañana', '12/02').\n" +
    "- time_text en formato 24h HH:mm si existe (ej: 15:00). Si el usuario dice 'a las 3 de la tarde', convertir a 15:00.\n" +
    "- Si el usuario manda un número solo (ej: '1', '2'), intent = UNKNOWN.\n" +
    "- SIEMPRE intentá extraer service_name si el usuario menciona algo relacionado con los servicios disponibles.\n"
  );
}