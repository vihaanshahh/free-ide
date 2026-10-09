const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]+`/g;
const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const ENV_SECRET = /\b[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*\s*[:=]\s*\S+/gi;
const TOKEN_PREFIX = /\b(?:sk|pk|rk|ghp|gho|github_pat|xox[baprs]|AKIA|AIza|ya29|glpat)-[A-Za-z0-9_\-]{8,}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const CONN = /\b(?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|amqp|https?):\/\/[^\s]+/gi;
const UNIX_PATH = /(?:\/[\w.@+-]+){2,}/g;
const WIN_PATH = /\b[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]+/g;
const EMAIL = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Prose-only ad context. Code, paths, and secrets never leave for an ad network.
 * Keeps short route mentions like "GET /invoices" (a single slash).
 */
export function stripForAds(text: string): string {
  return text
    .replace(PRIVATE_KEY, " ")
    .replace(FENCED_CODE, " ")
    .replace(INLINE_CODE, " ")
    .replace(ENV_SECRET, " ")
    .replace(TOKEN_PREFIX, " ")
    .replace(BEARER, " ")
    .replace(JWT, " ")
    .replace(CONN, " ")
    .replace(UNIX_PATH, " ")
    .replace(WIN_PATH, " ")
    .replace(EMAIL, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function messagesForAds(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  return messages
    .slice(-2)
    .map((message) => ({
      role: message.role,
      content: stripForAds(message.content),
    }))
    .filter((message) => message.content.length > 0);
}
