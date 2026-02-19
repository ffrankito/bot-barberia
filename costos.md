# Desglose de Costos a Escala - Chatbot WhatsApp

Análisis completo de cada servicio con costo en el proyecto.

---

## Servicios y sus Disparadores de Costo

| Servicio | Archivos | Modelo de Cobro | Costo por Evento |
|---------|-------|------------|----------------|
| **Anthropic Claude** (Haiku 4.5) | `src/ai/intent-parser.ts` | Por llamada API (~30-40% de mensajes lo activan) | ~$0.0003 USD/llamada |
| **Supabase** | `src/lib/supabase.ts` | Almacenamiento DB + solicitudes API | Gratis → $25 USD/mes (Pro) |
| **WhatsApp Cloud API** | `src/whatsapp/sender.ts` | Por conversación (ventana de 24h) | ~$0.01-0.03 USD/conversación |
| **Kommo CRM** | `src/kommo/` | Suscripción SaaS | $15-45 USD/usuario/mes |
| **Mercado Pago** | `src/payments/` | Comisión por transacción | **3.99%** por pago |
| **Hosting** (Node.js/Express) | `src/whatsapp/webhook.ts` | VPS o PaaS (requiere 24/7) | $7-40 USD/mes |

---

## Estimaciones Mensuales por Escala

| Componente | **100 conv/mes** | **500 conv/mes** | **2,000 conv/mes** |
|-----------|:-:|:-:|:-:|
| Supabase | Gratis | $25 | $25 |
| WhatsApp API | Gratis (1k gratis) | $5-10 | $20-40 |
| Claude AI | $1-2 | $5-8 | $20-30 |
| Kommo CRM | $15 | $15-25 | $25-45 |
| Hosting | $7-12 | $12-20 | $20-40 |
| Monitoreo | $0 | $0 | $15 |
| **Subtotal** | **~$23-31** | **~$62-88** | **~$125-195** |
| + Mercado Pago | +3.99% de ingresos | +3.99% de ingresos | +3.99% de ingresos |

*Todos los montos en USD salvo las comisiones de Mercado Pago (en ARS sobre el monto cobrado).*

---

## Optimizaciones ya Implementadas

- **Bypass rápido de IA** — números de menú, "hola", "si/no" no llaman a Claude
- **Modelo más barato** — Haiku 4.5 con máximo 300 tokens + caché del prompt de sistema
- **Caché de sesión** — TTL de 1 minuto reduce consultas a Supabase
- **Rate limiter** — previene abuso de la API de WhatsApp
- **Degradación elegante** — si Kommo o la IA fallan, el bot sigue funcionando con menús

## Ahorros Posibles

- **Sacar Kommo** si el CRM no es crítico (ahorrás $15-45/mes) — el fallback ya funciona
- **Aumentar el TTL del caché de sesión** para reducir más las consultas a la DB
- **Quedarse en Supabase Free** el mayor tiempo posible (aguanta hasta ~300-400 turnos/mes)

## Cosas a Tener en Cuenta al Escalar

- **Límite de conexiones de Supabase** — pasadas ~1,000 conexiones simultáneas puede necesitar plan Team ($599/mes)
- **Verificación de WhatsApp Business** — obligatoria para producción, no tiene costo pero lleva tiempo
- **Sin estrategia de archivado de datos** — las tablas de sesiones y turnos crecen indefinidamente
- **Estabilidad del webhook de Mercado Pago** — el endpoint necesita alta disponibilidad para confirmar pagos

---

**Resumen:** A volumen bajo el proyecto corre por **~$25-30 USD/mes** (Kommo es el costo fijo más grande). A volumen alto (~2k conversaciones), esperá **$125-195 USD/mes** más el 3.99% de Mercado Pago. La arquitectura ya está bien optimizada en costos.
