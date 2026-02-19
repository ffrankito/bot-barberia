# ROLE

You are a senior software engineer taking ownership of an existing WhatsApp chatbot project. Your job is to implement the full MVP as described below. Do NOT assume anything about the codebase — read every file first, then implement.

---

# STEP 0: READ THE ENTIRE CODEBASE FIRST

Before writing ANY code, read and understand every file in this repository. Pay special attention to:

- `IMPLEMENTATION_PLAN.txt` — this is the detailed technical spec. It is your primary reference.
- `plan.txt` — setup/deployment guide.
- `.env.example` — current environment variables.
- `package.json` — dependencies (Anthropic SDK is already installed).
- `tsconfig.json` — TypeScript config.
- `supabase/migrations/` — all SQL migration files (understand the current DB schema).
- Every file inside `src/` — understand the current state machine, handlers, tools, types, utilities, and webhook setup.

After reading, produce a short summary of:
1. What is already implemented and working.
2. What is missing relative to the IMPLEMENTATION_PLAN.txt.
3. Any inconsistencies or issues you spot.

Wait for my confirmation before proceeding to implementation.

---

# PROJECT CONTEXT

This is a WhatsApp appointment-booking chatbot for service-based businesses (barber shops, clinics, spas, etc.). It is built with:

- **TypeScript + Express** (webhook server)
- **Supabase** (PostgreSQL — services, availability, appointments, clients)
- **Meta Cloud API** (WhatsApp messaging — already working)
- **State machine architecture** (13 states, menu-driven numbered navigation — already working end-to-end)

The base bot is **production-tested and working**. Do NOT refactor or rewrite the existing working code unless strictly necessary for the new features. Respect what's already there.

---

# WHAT TO IMPLEMENT (MVP SCOPE)

Implement **all 5 phases** from `IMPLEMENTATION_PLAN.txt`. The two major features are:

## Feature 1: Claude AI Intent Parser
- Thin AI parsing layer on top of the existing state machine (AI does NOT replace the state machine — it feeds into it).
- Uses `claude-haiku-4-5-20250929` for speed and cost.
- Extracts intent + entities from natural language Spanish messages (e.g., "quiero un corte el viernes a las 3").
- Shortcuts: if AI extracts enough entities, skip states and jump ahead in the flow.
- Fallback: if AI fails or confidence is low, fall through to the existing menu-driven flow. The bot must NEVER break because of AI failure.
- Cost optimization: bypass the API call entirely for single-digit messages, known keywords ("volver", "menu", "si", "no"), and other cases where AI adds no value.

## Feature 2: Kommo CRM Integration
- Kommo becomes the source of truth for contacts/leads.
- Supabase `clients` table becomes a shadow table (kept for FK integrity on appointments).
- Dual-write strategy: every contact creation/lookup hits Kommo first, then upserts in Supabase.
- On confirmed booking, create a Lead in Kommo's pipeline.
- All Kommo operations must be non-fatal — if Kommo is down or misconfigured, the booking still succeeds in Supabase. Wrap in try/catch, log errors, continue.

## Files to create and modify

Follow the `IMPLEMENTATION_PLAN.txt` exactly for the file list:

**7 new files:**
- `src/ai/prompts.ts`
- `src/ai/intent-parser.ts`
- `src/kommo/client.ts`
- `src/kommo/contacts.ts`
- `src/kommo/leads.ts`
- `src/tools/get-client-kommo.ts`
- `src/tools/register-client-kommo.ts`

**7 modified files:**
- `src/chatbot/types.ts`
- `src/chatbot/handler.ts`
- `src/chatbot/handlers/identify-client.ts`
- `src/chatbot/handlers/register-client.ts`
- `src/chatbot/handlers/confirm-booking.ts`
- `src/tools/create-appointment.ts`
- `.env.example`

**1 new migration:**
- `supabase/migrations/003_kommo_integration.sql`

**All other files remain unchanged.** Do not touch handlers, utilities, or modules that the plan marks as unchanged unless you find a bug that blocks the new features.

---

# ARCHITECTURE PRINCIPLES (MUST FOLLOW)

1. **AI is a thin layer, not the core.** The state machine remains the engine. AI only parses intent and pre-populates context fields. If AI is removed entirely, the bot still works via numbered menus.

2. **Graceful degradation everywhere.** If the Anthropic API key is missing or the API is down, the bot falls back to menu flow. If Kommo is unreachable, bookings still work via Supabase. Never let an external service failure crash the bot or block a user.

3. **Existing behavior is sacred.** A user sending "1" from the main menu must still work exactly as before. All numbered menu flows must remain functional. AI is additive, not replacing.

4. **Reconfigurability for different businesses.** This codebase will be deployed once per client (one instance = one business). Keep business-specific config in environment variables and Supabase data (services, availability, pricing), NOT hardcoded. The chatbot language is Spanish. Business name, greeting text, and similar strings should be easy to change (env vars or a config object at the top of a file — not buried deep in handler logic). Do NOT build multi-tenancy. Just make it clean to fork/reconfigure.

5. **Keep it simple.** No over-engineering. No abstractions "for the future." No dependency additions beyond what's in package.json (Anthropic SDK is already there). Use native `fetch` for Kommo API calls. Minimal code, maximum clarity.

6. **Spanish language.** All user-facing messages, AI prompts, and Kommo lead names are in Spanish. Code (variable names, comments) stays in English.

---

# IMPLEMENTATION ORDER

Follow this exact order. After each phase, verify it compiles (`npx tsc --noEmit`) and confirm with me before moving to the next phase.

1. **Phase 1:** Types + `.env.example` updates. No runtime changes — just foundations.
2. **Phase 2:** AI intent parser (`src/ai/`). Testable in isolation.
3. **Phase 3:** Kommo CRM client + bridge tools (`src/kommo/`, `src/tools/*-kommo.ts`, migration). Testable in isolation.
4. **Phase 4:** Wire AI + Kommo into the state machine (modify `handler.ts` and specific handlers). This is the integration phase.
5. **Phase 5:** Health endpoint enhancement.

---

# WHAT "DONE" LOOKS LIKE

The end-to-end verification checklist from the implementation plan:

- [ ] `npm run dev` starts without errors
- [ ] Sending "hola" via WhatsApp → bot greets, looks up contact in Kommo, shows menu
- [ ] Sending "quiero un corte el viernes a las 3" → AI parses, shows booking summary, asks si/no
- [ ] Sending "si" → appointment in Supabase + lead in Kommo pipeline
- [ ] Sending "2" from menu → view appointments (menu-driven still works)
- [ ] Sending "3" from menu → cancel appointment flow works
- [ ] New contact appears in Kommo dashboard
- [ ] Lead appears in Kommo pipeline
- [ ] Appointment in Supabase has `kommo_contact_id` populated
- [ ] Killing `ANTHROPIC_API_KEY` → bot falls back to numbered menus (no crash)
- [ ] Killing `KOMMO_ACCESS_TOKEN` → bookings still work in Supabase (no crash)
- [ ] `npx tsc --noEmit` compiles clean with zero errors

---

# WHAT NOT TO DO

- Do NOT refactor the existing state machine architecture.
- Do NOT rename existing files or restructure folders beyond what the plan specifies.
- Do NOT add new npm dependencies (everything needed is already installed or use native `fetch`).
- Do NOT build multi-tenancy, admin panels, dashboards, or anything outside the scope above.
- Do NOT hardcode business-specific data (services, prices, hours, business name) — these come from Supabase or env vars.
- Do NOT skip error handling. Every external call (Anthropic, Kommo, Supabase) must have try/catch with meaningful logging.
- Do NOT make changes to the WhatsApp webhook verification or message sending logic — it already works.

---

# ENVIRONMENT VARIABLES (for reference)

The current `.env.example` has WhatsApp + Supabase vars. You will ADD these:

```
# Anthropic Claude AI
ANTHROPIC_API_KEY=

# Kommo CRM
KOMMO_SUBDOMAIN=
KOMMO_ACCESS_TOKEN=
KOMMO_PIPELINE_ID=
KOMMO_INITIAL_STAGE_ID=
```

These will not have real values during development. All code must handle them being empty/undefined gracefully.

---

# START

Begin with Step 0: read the full codebase and give me your summary. Do not write any code until I confirm.
