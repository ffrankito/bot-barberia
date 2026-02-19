import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import { getDayOfWeek, isDateToday, dayNameES, arDateTimeToUTC, formatTimeAR } from "../lib/date-utils.js";
import { generateAvailableSlots, type TimeBlock, type ExistingAppointment } from "../lib/slot-generator.js";

// Schema de validación
const CheckAvailabilitySchema = z.object({
  service_id: z.string().uuid("service_id debe ser un UUID válido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe tener formato YYYY-MM-DD"),
});

export interface CheckAvailabilityInput {
  service_id: string;
  date: string; // YYYY-MM-DD
}

export interface CheckAvailabilityOutput {
  date: string;
  day_of_week: number;
  day_name: string;
  is_business_day: boolean;
  available_slots: string[]; // ["09:00", "09:30", ...]
}

export async function checkAvailability(input: CheckAvailabilityInput): Promise<CheckAvailabilityOutput> {
  // Validar input con Zod
  const validation = CheckAvailabilitySchema.safeParse(input);
  
  if (!validation.success) {
    const errors = validation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
    console.error('❌ Validación fallida:', errors);
    throw new Error(`Datos inválidos: ${errors}`);
  }

  const dayOfWeek = getDayOfWeek(input.date);
  const dayName = dayNameES(dayOfWeek);

  // 1. Get service duration
  const { data: service, error: serviceErr } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", input.service_id)
    .single();

  if (serviceErr || !service) {
    throw new Error(`Service not found: ${serviceErr?.message ?? "unknown"}`);
  }

  // 2. Get availability blocks for this day
  const { data: blocks, error: blockErr } = await supabase
    .from("availability")
    .select("start_time, end_time")
    .eq("day_of_week", dayOfWeek)
    .eq("is_active", true)
    .order("start_time");

  if (blockErr) {
    throw new Error(`Error fetching availability: ${blockErr.message}`);
  }

  if (!blocks || blocks.length === 0) {
    return {
      date: input.date,
      day_of_week: dayOfWeek,
      day_name: dayName,
      is_business_day: false,
      available_slots: [],
    };
  }

  // 3. Get existing non-cancelled appointments for this date
  const dayStartUTC = arDateTimeToUTC(input.date, "00:00");
  const dayEndUTC = arDateTimeToUTC(input.date, "23:59");

  const { data: appointments, error: apptErr } = await supabase
    .from("appointments")
    .select("starts_at, ends_at")
    .neq("status", "cancelled")
    .gte("starts_at", dayStartUTC.toISOString())
    .lte("starts_at", dayEndUTC.toISOString());

  if (apptErr) {
    throw new Error(`Error fetching appointments: ${apptErr.message}`);
  }

  const existingAppointments: ExistingAppointment[] = (appointments ?? []).map((a) => ({
    starts_at: formatTimeAR(new Date(a.starts_at)),
    ends_at: formatTimeAR(new Date(a.ends_at)),
  }));

  // 4. Generate available slots
  const timeBlocks: TimeBlock[] = blocks.map((b) => ({
    start_time: b.start_time.slice(0, 5), // "HH:mm:ss" -> "HH:mm"
    end_time: b.end_time.slice(0, 5),
  }));

  const dateIsToday = isDateToday(input.date);
  const availableSlots = generateAvailableSlots(
    timeBlocks,
    service.duration_minutes,
    existingAppointments,
    dateIsToday
  );

  return {
    date: input.date,
    day_of_week: dayOfWeek,
    day_name: dayName,
    is_business_day: true,
    available_slots: availableSlots,
  };
}