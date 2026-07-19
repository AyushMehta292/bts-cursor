const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const SYNTHETIC_EMAIL_DOMAIN = "bypass.local";

export const USERNAME_RULES =
  "3-20 characters: lowercase letters, numbers, underscore only.";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_REGEX.test(normalizeUsername(raw));
}

/**
 * Must stay identical to the portal's implementation: it's how the
 * extension logs into the same Supabase Auth account with just a
 * username + password.
 */
export function usernameToEmail(raw: string): string {
  return `${normalizeUsername(raw)}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
