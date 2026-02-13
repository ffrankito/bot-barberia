import { currentTimeAR, isDateToday } from "./date-utils.js";

export interface TimeBlock {
  start_time: string; // "HH:mm"
  end_time: string;   // "HH:mm"
}

export interface ExistingAppointment {
  starts_at: string; // "HH:mm" in AR timezone
  ends_at: string;   // "HH:mm" in AR timezone
}

const SLOT_INCREMENT_MINUTES = 30;

/**
 * Generate available time slots for a given date.
 *
 * 1. For each availability block, generate candidate slots at 30-min increments
 *    where the service fits entirely within the block.
 * 2. Remove slots that overlap with existing (non-cancelled) appointments.
 * 3. If the date is today, remove past slots.
 */
export function generateAvailableSlots(
  blocks: TimeBlock[],
  durationMinutes: number,
  existingAppointments: ExistingAppointment[],
  dateIsToday: boolean
): string[] {
  const candidates: string[] = [];

  for (const block of blocks) {
    const blockStartMin = timeToMinutes(block.start_time);
    const blockEndMin = timeToMinutes(block.end_time);

    for (let startMin = blockStartMin; startMin + durationMinutes <= blockEndMin; startMin += SLOT_INCREMENT_MINUTES) {
      candidates.push(minutesToTime(startMin));
    }
  }

  // Filter out slots that overlap with existing appointments
  const available = candidates.filter((slot) => {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + durationMinutes;

    for (const appt of existingAppointments) {
      const apptStart = timeToMinutes(appt.starts_at);
      const apptEnd = timeToMinutes(appt.ends_at);

      // Overlap: slotStart < apptEnd AND slotEnd > apptStart
      if (slotStart < apptEnd && slotEnd > apptStart) {
        return false;
      }
    }
    return true;
  });

  // If today, remove past slots
  if (dateIsToday) {
    const nowMin = timeToMinutes(currentTimeAR());
    return available.filter((slot) => timeToMinutes(slot) > nowMin);
  }

  return available;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
