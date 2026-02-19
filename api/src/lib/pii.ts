/**
 * PII Minimization layer.
 * Pseudonymizes personal data before sending to Bedrock LLM.
 * Restores original values in the response.
 *
 * Strategy:
 * - Replace email addresses with [EMAIL_1], [EMAIL_2], etc.
 * - Replace phone numbers with [PHONE_1], etc.
 * - Replace IBAN/bank account numbers with [BANK_1], etc.
 * - Maintain a mapping to restore values in the draft output.
 */

interface PiiMapping {
  placeholder: string;
  original: string;
  type: "email" | "phone" | "bank" | "name";
}

export interface PiiResult {
  sanitized: string;
  mappings: PiiMapping[];
}

// Patterns
const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{2,4}/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{0,2}\b/g;

export function minimizePii(text: string): PiiResult {
  const mappings: PiiMapping[] = [];
  let sanitized = text;
  let counter = { email: 0, phone: 0, bank: 0 };

  // Emails
  sanitized = sanitized.replace(EMAIL_RE, (match) => {
    counter.email++;
    const placeholder = `[EMAIL_${counter.email}]`;
    mappings.push({ placeholder, original: match, type: "email" });
    return placeholder;
  });

  // IBANs (before phone to avoid partial matches)
  sanitized = sanitized.replace(IBAN_RE, (match) => {
    counter.bank++;
    const placeholder = `[BANK_${counter.bank}]`;
    mappings.push({ placeholder, original: match, type: "bank" });
    return placeholder;
  });

  // Phone numbers
  sanitized = sanitized.replace(PHONE_RE, (match) => {
    // Skip if it looks like a date or very short
    if (match.length < 7) return match;
    counter.phone++;
    const placeholder = `[PHONE_${counter.phone}]`;
    mappings.push({ placeholder, original: match, type: "phone" });
    return placeholder;
  });

  return { sanitized, mappings };
}

export function restorePii(text: string, mappings: PiiMapping[]): string {
  let restored = text;
  for (const m of mappings) {
    restored = restored.replaceAll(m.placeholder, m.original);
  }
  return restored;
}
