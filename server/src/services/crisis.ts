/**
 * Crisis detection guardrail — server-side, deterministic, runs BEFORE the LLM.
 *
 * Mirrors the keyword set in agents/server.py (CRISIS_KEYWORDS) so the decode
 * path has the same protection as the Maya /chat path. Keep the two lists in
 * sync if either changes.
 *
 * NOTE: keyword matching is intentionally simple and will miss paraphrased
 * distress ("what's even the point", "I want it to stop"). It is a floor, not
 * a ceiling — a cheap LLM classifier pass is the planned upgrade. Do not treat
 * a clean keyword check as "this person is fine".
 */

const CRISIS_KEYWORDS = [
  'kill myself', 'end it all', "don't want to be here", 'dont want to be here',
  'suicide', 'suicidal', 'self harm', 'self-harm',
  "can't go on", 'cant go on', 'no point anymore', 'want to die',
  'end my life', 'not worth living', 'better off dead',
  'hurt myself', 'cutting myself', 'take my life',
];

export const CRISIS_MESSAGE = `Hey — I heard that. Before anything about the job search: are you okay? Not job-search okay. Actually okay.

If things feel really dark right now, please reach out to someone who can help:

**UK:** Samaritans — 116 123 (free, 24/7)
**UK Text:** Text SHOUT to 85258
**US:** 988 Suicide & Crisis Lifeline
**International:** findahelpline.com

The job search is brutal, and a rejection can land hard. But you matter far more than any application. Please talk to one of the lines above — they're there for exactly this.`;

export function checkForCrisis(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => lower.includes(keyword));
}
