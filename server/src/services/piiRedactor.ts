/**
 * PII Redactor Service
 *
 * Automatically redacts personally identifiable information from text
 * before sending to external AI APIs. This is a trust and privacy feature.
 *
 * Supported redactions:
 * - Email addresses
 * - Phone numbers (UK and international formats)
 * - Names after common greetings
 * - LinkedIn profile URLs
 * - UK National Insurance numbers
 * - Postal codes (UK format)
 */

export interface RedactionLog {
  type: 'email' | 'phone' | 'name' | 'linkedin' | 'ni_number' | 'postcode';
  count: number;
}

export interface RedactionResult {
  redacted: string;
  redactions: RedactionLog[];
  totalRedactions: number;
}

/**
 * Redact PII from text before AI processing
 * Returns the redacted text and a log of what was removed (counts only, not content)
 */
export function redactPII(text: string): RedactionResult {
  const redactions: RedactionLog[] = [];
  let result = text;

  // Email addresses - comprehensive pattern
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailMatches = result.match(emailPattern);
  if (emailMatches && emailMatches.length > 0) {
    redactions.push({ type: 'email', count: emailMatches.length });
    result = result.replace(emailPattern, '[EMAIL]');
  }

  // Phone numbers - UK and international formats
  // Matches: +44 7XXX, 07XXX, (020) XXXX, +1-XXX-XXX-XXXX, etc.
  const phonePatterns = [
    /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, // International
    /\b0\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g, // UK landline
    /\b07\d{3}[-.\s]?\d{3}[-.\s]?\d{3}\b/g, // UK mobile
  ];

  let phoneCount = 0;
  for (const pattern of phonePatterns) {
    const matches = result.match(pattern);
    if (matches) {
      phoneCount += matches.length;
      result = result.replace(pattern, '[PHONE]');
    }
  }
  if (phoneCount > 0) {
    redactions.push({ type: 'phone', count: phoneCount });
  }

  // Names after greetings - be careful not to over-redact
  // Matches: "Dear John", "Hi Sarah Smith", "Hello Mr. Johnson", etc.
  const namePatterns = [
    /(Dear|Hi|Hello|Hey)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /(Sincerely|Best|Regards|Cheers|Thanks),?\s*\n?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /(From|Sent by|Contact):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  ];

  let nameCount = 0;
  for (const pattern of namePatterns) {
    const matches = result.match(pattern);
    if (matches) {
      nameCount += matches.length;
      // Preserve the greeting word, only redact the name
      result = result.replace(pattern, '$1 [NAME]');
    }
  }
  if (nameCount > 0) {
    redactions.push({ type: 'name', count: nameCount });
  }

  // LinkedIn profile URLs
  const linkedinPattern = /linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/gi;
  const linkedinMatches = result.match(linkedinPattern);
  if (linkedinMatches && linkedinMatches.length > 0) {
    redactions.push({ type: 'linkedin', count: linkedinMatches.length });
    result = result.replace(linkedinPattern, 'linkedin.com/in/[REDACTED]');
  }

  // UK National Insurance numbers (format: AB123456C)
  const niPattern = /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Z]\b/gi;
  const niMatches = result.match(niPattern);
  if (niMatches && niMatches.length > 0) {
    redactions.push({ type: 'ni_number', count: niMatches.length });
    result = result.replace(niPattern, '[NI_NUMBER]');
  }

  // UK Postcodes (be careful - some are short like "W1A 1AA")
  const postcodePattern = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi;
  const postcodeMatches = result.match(postcodePattern);
  if (postcodeMatches && postcodeMatches.length > 0) {
    redactions.push({ type: 'postcode', count: postcodeMatches.length });
    result = result.replace(postcodePattern, '[POSTCODE]');
  }

  // Clean up any double-redactions (e.g., [EMAIL] [EMAIL])
  result = result.replace(/(\[EMAIL\]\s*)+/g, '[EMAIL] ');
  result = result.replace(/(\[PHONE\]\s*)+/g, '[PHONE] ');
  result = result.replace(/(\[NAME\]\s*)+/g, '[NAME] ');

  const totalRedactions = redactions.reduce((sum, r) => sum + r.count, 0);

  return {
    redacted: result.trim(),
    redactions,
    totalRedactions
  };
}

/**
 * Check if text contains PII without redacting
 * Useful for warnings/prompts
 */
export function containsPII(text: string): boolean {
  const { totalRedactions } = redactPII(text);
  return totalRedactions > 0;
}

/**
 * Get a summary of PII types found in text
 */
export function getPIISummary(text: string): string[] {
  const { redactions } = redactPII(text);
  return redactions.map(r => `${r.count} ${r.type}${r.count > 1 ? 's' : ''}`);
}
