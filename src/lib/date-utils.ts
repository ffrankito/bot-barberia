import { format, parse, isToday, isBefore, startOfDay, addDays } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export const TIMEZONE = "America/Argentina/Buenos_Aires";

/** Get the current time in Argentina */
export function nowAR(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

/** Convert a UTC Date to Argentina zoned time */
export function toAR(date: Date): Date {
  return toZonedTime(date, TIMEZONE);
}

/** Build a TIMESTAMPTZ from a date string (YYYY-MM-DD) and time string (HH:mm) in AR timezone */
export function arDateTimeToUTC(date: string, time: string): Date {
  const localString = `${date} ${time}`;
  const parsed = parse(localString, "yyyy-MM-dd HH:mm", new Date());
  return fromZonedTime(parsed, TIMEZONE);
}

/** Format a Date in AR timezone as "dd/MM/yyyy HH:mm" */
export function formatAR(date: Date): string {
  const zoned = toZonedTime(date, TIMEZONE);
  return format(zoned, "dd/MM/yyyy HH:mm");
}

/** Format a Date in AR timezone as "dd/MM/yyyy" */
export function formatDateAR(date: Date): string {
  const zoned = toZonedTime(date, TIMEZONE);
  return format(zoned, "dd/MM/yyyy");
}

/** Format a Date in AR timezone as "HH:mm" */
export function formatTimeAR(date: Date): string {
  const zoned = toZonedTime(date, TIMEZONE);
  return format(zoned, "HH:mm");
}

/** Get day of week (0=Sunday) for a date string YYYY-MM-DD interpreted in AR timezone */
export function getDayOfWeek(dateStr: string): number {
  const parsed = parse(dateStr, "yyyy-MM-dd", new Date());
  return parsed.getDay();
}

/** Check if a date string (YYYY-MM-DD) is today in AR timezone */
export function isDateToday(dateStr: string): boolean {
  const parsed = parse(dateStr, "yyyy-MM-dd", new Date());
  const now = nowAR();
  return isToday(parsed) || format(parsed, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
}

/** Get current time as HH:mm in AR timezone */
export function currentTimeAR(): string {
  return format(nowAR(), "HH:mm");
}

/**
 * Parse a user-provided date into YYYY-MM-DD.
 * Supports: "hoy", "mañana", "lunes"-"domingo", dd/mm, dd/mm/yyyy, yyyy-mm-dd
 */
export function parseUserDate(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const now = nowAR();
  const today = startOfDay(now);

  if (trimmed === "hoy") {
    return format(today, "yyyy-MM-dd");
  }

  if (trimmed === "mañana") {
    return format(addDays(today, 1), "yyyy-MM-dd");
  }

  const dayNames: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6,
  };

  if (dayNames[trimmed] !== undefined) {
    const targetDay = dayNames[trimmed];
    const currentDay = today.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    return format(addDays(today, daysAhead), "yyyy-MM-dd");
  }

  // dd/mm/yyyy
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = parse(`${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`, "yyyy-MM-dd", new Date());
    if (!isNaN(date.getTime()) && !isBefore(startOfDay(date), today)) {
      return format(date, "yyyy-MM-dd");
    }
    return null;
  }

  // dd/mm (current year)
  const dm = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dm) {
    const [, d, m] = dm;
    const year = now.getFullYear();
    const date = parse(`${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`, "yyyy-MM-dd", new Date());
    if (!isNaN(date.getTime()) && !isBefore(startOfDay(date), today)) {
      return format(date, "yyyy-MM-dd");
    }
    return null;
  }

  // yyyy-mm-dd
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = parse(trimmed, "yyyy-MM-dd", new Date());
    if (!isNaN(date.getTime()) && !isBefore(startOfDay(date), today)) {
      return format(date, "yyyy-MM-dd");
    }
    return null;
  }

  return null;
}

/** Day name in Spanish */
export function dayNameES(dayOfWeek: number): string {
  const names = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return names[dayOfWeek] ?? "Desconocido";
}
