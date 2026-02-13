/**
 * Normalize a phone number to E.164 format.
 * Handles common Argentine formats.
 */
export function normalizePhone(phone: string): string {
  // Strip everything except digits and leading +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // If it starts with +, keep it
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // Argentine numbers: if starts with 54, add +
  if (cleaned.startsWith("54")) {
    return `+${cleaned}`;
  }

  // If starts with 0 (local Argentine format), convert
  // 011-xxxx-xxxx -> +5411xxxxxxxx
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1); // remove leading 0
    return `+54${cleaned}`;
  }

  // If it's 10+ digits starting with 9 (mobile without country code)
  if (cleaned.startsWith("9") && cleaned.length >= 10) {
    return `+54${cleaned}`;
  }

  // Default: assume Argentine, prepend +54
  return `+54${cleaned}`;
}

/** Validate that a phone string looks like E.164 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}
