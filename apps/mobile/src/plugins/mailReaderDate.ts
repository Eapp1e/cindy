const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');

/** Mail dates arrive as RFC 2822 text ("Wed, 21 Oct 2026 09:55:03 +1300"), which
 * Hermes does not reliably parse. Unknown formats return undefined so callers can
 * show the provider's original text instead of a wrong time. */
export function parseMailDate(text: string): Date | undefined {
  const match = /^\s*(?:[a-z]{3},\s*)?(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([+-])(\d{2})(\d{2})|GMT|UTC|UT|Z)?\b/i.exec(text);
  if (match) {
    const month = MONTHS.indexOf(match[2].toLowerCase());
    if (month >= 0) {
      const offset = match[7] ? (match[7] === '-' ? -1 : 1) * (Number(match[8]) * 60 + Number(match[9])) : 0;
      const time = Date.UTC(Number(match[3]), month, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6] || 0)) - offset * 60_000;
      const date = new Date(time);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  const fallback = new Date(text);
  return text.trim() && !Number.isNaN(fallback.getTime()) ? fallback : undefined;
}

/** Mail-app style: time today, month and day this year, full date otherwise. */
export function formatMailDate(text: string, language: string, now = new Date()): string {
  const date = parseMailDate(text);
  if (!date) return text;
  const sameYear = date.getFullYear() === now.getFullYear();
  const today = sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  try {
    return new Intl.DateTimeFormat(language, today ? { hour: '2-digit', minute: '2-digit' }
      : { ...(sameYear ? {} : { year: 'numeric' as const }), month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  } catch { return text; }
}
