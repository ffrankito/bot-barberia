export type ConversationState =
  | "GREETING"
  | "IDENTIFY_CLIENT"
  | "REGISTER_CLIENT"
  | "MAIN_MENU"
  | "BROWSE_SERVICES"
  | "SELECT_SERVICE"
  | "CHECK_AVAILABILITY"
  | "SELECT_SLOT"
  | "CONFIRM_BOOKING"
  | "SELECT_PAYMENT_METHOD"
  | "VIEW_MY_APPOINTMENTS"
  | "CANCEL_APPOINTMENT"
  | "DONE";

// ---------------------------------------------------------------------------
// AI Intent Parsing (Claude)
// ---------------------------------------------------------------------------

export type UserIntent =
  | "BOOK_APPOINTMENT"
  | "VIEW_APPOINTMENTS"
  | "CANCEL_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "CONFIRM_YES"
  | "CONFIRM_NO"
  | "PAY_NOW"
  | "PAY_LATER"
  | "GREETING"
  | "MENU"
  | "GOODBYE"
  | "UNKNOWN";

export interface ParsedEntities {
  serviceName?: string;
  date?: string; // YYYY-MM-DD (resolved by parseUserDate)
  time?: string; // HH:mm
  appointmentReference?: string; // "el de mañana", "el primero"
  paymentMethod?: "mercado_pago" | "cash";
  clientName?: string;
}

export interface IntentParseResult {
  intent: UserIntent;
  entities: ParsedEntities;
  confidence: number;
  rawDateText?: string;
}

// ---------------------------------------------------------------------------
// Kommo
// ---------------------------------------------------------------------------

export interface KommoContact {
  id: number;
  name: string;
  phone: string;
}

export interface ConversationContext {
  state: ConversationState;
  phone: string;
  clientId?: string;
  clientName?: string;
  kommoContactId?: number;
  lastIntent?: IntentParseResult;
  lastIntentApplied?: boolean;
  lastActivity: number; // timestamp ms

  // Booking flow
  selectedServiceId?: string;
  selectedServiceName?: string;
  selectedServiceDuration?: number;
  selectedServicePrice?: number;
  selectedDate?: string;        // YYYY-MM-DD
  availableSlots?: string[];    // ["09:00", "09:30", ...]
  selectedSlot?: string;        // "09:00"
  lastAppointmentId?: string;   // ID del appointment recién creado

  // Cancel flow
  cancellableAppointments?: Array<{
    id: string;
    service_name: string;
    starts_at: string;
  }>;
}

export interface HandlerResult {
  response: string;
  newState?: ConversationState;
}

export type StateHandler = (
  ctx: ConversationContext,
  message: string
) => Promise<HandlerResult>;