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
 * Supabase Auth requires an email under the hood. We derive one
 * deterministically from the username so users only ever see/type a
 * username - this "email" is never displayed and never receives mail.
 */
export function usernameToEmail(raw: string): string {
  return `${normalizeUsername(raw)}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
