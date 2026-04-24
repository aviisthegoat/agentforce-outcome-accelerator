/**
 * Human-like names used when a user or persona name is missing for display.
 * Persona names are now AI-generated at creation; these are only for display fallbacks.
 */

/** Default name for the person running the simulation when not using their account name. */
const DEFAULT_RUNNER_NAMES = [
  'Alex',
  'Jordan',
  'Sam',
  'Morgan',
  'Casey',
  'Riley',
  'Quinn',
  'Avery',
] as const;

let runnerIndex = 0;

/**
 * Returns a human-like display name for the person running the simulation.
 * Use the provided username when available (e.g. from auth); otherwise a default.
 */
export function getRunnerDisplayName(username: string | null | undefined): string {
  const trimmed = typeof username === 'string' ? username.trim() : '';
  if (trimmed.length > 0) return trimmed;
  const name = DEFAULT_RUNNER_NAMES[runnerIndex % DEFAULT_RUNNER_NAMES.length];
  runnerIndex += 1;
  return name;
}

/** Generic label when persona has no name (no default name list; names are AI-generated at creation). */
export function getStablePersonaFallbackName(): string {
  return 'Persona';
}

/**
 * Display name for a persona: trimmed name, or role/description when name is missing or same as description.
 * When name equals description (e.g. role used as name like "Project Manager"), show the role (description).
 * When name is missing entirely, show description if available, else generic "Persona".
 */
export function getPersonaDisplayName(persona: { name?: string | null; description?: string | null } | null | undefined): string {
  const name = typeof persona?.name === 'string' ? persona.name.trim() : '';
  const desc = typeof persona?.description === 'string' ? persona.description.trim() : '';
  if (name.length > 0 && name !== desc) return name;
  if (desc.length > 0) return desc;
  return getStablePersonaFallbackName();
}
