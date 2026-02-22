/**
 * Normalize a phone number to E.164 format WITHOUT spaces (for DB storage and lookups).
 * Use formatPhoneForWhatsApp() when sending to Meta Cloud API.
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

/**
 * Format a normalized E.164 phone number with spaces for Meta Cloud API.
 * Meta expects: +54 341 393 5931
 */
export function formatPhoneForWhatsApp(phone: string): string {
  if (!phone.startsWith("+54")) {
    return phone;
  }

  const withoutPrefix = phone.slice(3); // Remove "+54"

  // Argentine mobile: +54 9 341 393 5931
  if (withoutPrefix.startsWith("9") && withoutPrefix.length === 11) {
    const areaCode = withoutPrefix.slice(1, 4);
    const part1 = withoutPrefix.slice(4, 7);
    const part2 = withoutPrefix.slice(7);
    return `+54 ${areaCode} ${part1} ${part2}`;
  }

  return phone;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}