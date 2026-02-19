/**
 * Normalize a phone number to E.164 format WITH SPACES (Meta format).
 * Handles common Argentine formats.
 */
export function normalizePhone(phone: string): string {
  // Strip everything except digits and leading +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // If it starts with +, keep it
  if (cleaned.startsWith("+")) {
    return formatWithSpaces(cleaned);
  }

  // Argentine numbers: if starts with 54, add +
  if (cleaned.startsWith("54")) {
    return formatWithSpaces(`+${cleaned}`);
  }

  // If starts with 0 (local Argentine format), convert
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
    return formatWithSpaces(`+54${cleaned}`);
  }

  // If it's 10+ digits starting with 9 (mobile without country code)
  if (cleaned.startsWith("9") && cleaned.length >= 10) {
    return formatWithSpaces(`+54${cleaned}`);
  }

  // Default: assume Argentine, prepend +54
  return formatWithSpaces(`+54${cleaned}`);
}

/**
 * Format Argentine number with spaces to match Meta's format
 * +5493413935931 → +54 341 393 5931
 */
function formatWithSpaces(phone: string): string {
  // If it's not Argentine, return as is
  if (!phone.startsWith("+54")) {
    return phone;
  }

  // Remove the + and 54
  const withoutPrefix = phone.slice(3);

  // Argentine mobile format: +54 9 XXX XXX XXXX
  if (withoutPrefix.startsWith("9") && withoutPrefix.length === 11) {
    const areaCode = withoutPrefix.slice(1, 4); // 341
    const part1 = withoutPrefix.slice(4, 7);    // 393
    const part2 = withoutPrefix.slice(7);        // 5931
    return `+54 ${areaCode} ${part1} ${part2}`;
  }

  // If not standard format, return without spaces
  return phone;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone.replace(/\s/g, ""));
}