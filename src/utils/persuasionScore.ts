/** Matches "Persuasion: N%" (global so matchAll finds every occurrence). */
const PERSUASION_PERCENT_RE = /Persuasion\s*:\s*(\d+(?:\.\d+)?)\s*%/gi;

function clampInt1To100(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/**
 * Final persuasion line wins when the model repeats the line — one scalar for UI/API.
 */
export function parseLastPersuasionPercentFromText(text: string): number | null {
  if (!text?.trim()) return null;
  const matches = [...text.matchAll(PERSUASION_PERCENT_RE)];
  if (matches.length === 0) return null;
  const n = parseFloat(matches[matches.length - 1][1]);
  if (!Number.isFinite(n)) return null;
  return clampInt1To100(n);
}

/**
 * Normalize API or stray values so `persuasionScore` is always one number or null.
 */
export function coerceSinglePersuasionScore(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return clampInt1To100(raw);
  if (typeof raw === 'string') {
    const fromLine = parseLastPersuasionPercentFromText(raw);
    if (fromLine != null) return fromLine;
    const n = parseFloat(raw.trim());
    return Number.isFinite(n) ? clampInt1To100(n) : null;
  }
  if (Array.isArray(raw)) {
    for (let i = raw.length - 1; i >= 0; i--) {
      const v = coerceSinglePersuasionScore(raw[i]);
      if (v != null) return v;
    }
    return null;
  }
  return null;
}
