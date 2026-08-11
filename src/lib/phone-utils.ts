/**
 * Normalize a phone number to E.164 format WITHOUT spaces (for DB storage and lookups).
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
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
    return `+54${cleaned}`;
  }

  // If it's 10+ digits starting with 9 (mobile without country code)
  if (cleaned.startsWith("9") && cleaned.length >= 10) {
    return `+54${cleaned}`;
  }

  // Default: assume Argentine, prepend +54
  return `+54${cleaned}`;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}