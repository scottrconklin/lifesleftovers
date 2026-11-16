/**
 * US phone numbers only: V1 runs in one US metro, and refusing other countries also blocks the
 * international "SMS pumping" fraud that runs up texting bills.
 *
 * Phone numbers are personal data: never log them (CLAUDE.md, privacy rules).
 */

/** "(713) 555-0123", "713.555.0123", "+1 713 555 0123" → "+17135550123"; anything else → null. */
export function normalizeUsPhone(input: string): string | null {
  const trimmed = input.trim();
  // Letters mean it isn't a phone number we accept (no vanity numbers, no extensions).
  if (!trimmed || /[a-z]/i.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // NANP: area code and exchange can't start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  // N11 area codes (211, 311, 411, 911…) are service codes, not real area codes.
  if (digits[1] === "1" && digits[2] === "1") return null;
  return `+1${digits}`;
}

/** "+17135550123" → "(713) 555-0123". */
export function formatUsPhone(e164: string): string {
  const d = e164.replace(/^\+1/, "");
  if (!/^\d{10}$/.test(d)) return e164;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** "+17135550123" → "(•••) •••-0123", for showing a saved number without exposing it. */
export function maskPhone(e164: string): string {
  return `(•••) •••-${e164.slice(-4)}`;
}
