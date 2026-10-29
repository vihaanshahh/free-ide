/**
 * Non-secret model settings. Change hosts and ids here.
 * Secrets stay in the environment: LLM_API_KEY, optional LLM_FALLBACK_API_KEY, GRAVITY_API_KEY.
 * The OpenRouter key is read only on the server. Do not import it into client bundles.
 */

export const PRIMARY_MODEL = "z-ai/glm-5.3-flash";
export const FALLBACK_MODEL = "deepseek/deepseek-v4.1-flash";

/** OpenRouter OpenAI-compatible API. Both models use this host. */
export const LLM_BASE_URL = "https://openrouter.ai/api/v1";
export const LLM_FALLBACK_BASE_URL = LLM_BASE_URL;

export const OPENROUTER_REFERER = "https://www.subspaces.si";
export const OPENROUTER_TITLE = "subspaces.si";

/** Public Gravity pixel. Not a secret. */
export const GRAVITY_PIXEL_ID = "9f5969b9-4f34-449e-8360-992259cd0f50";

export const MAX_OUTPUT_TOKENS = 2048;
export const MAX_REQUEST_BYTES = 48_000;
export const MODEL_REQUESTS_PER_MINUTE = 30;

/** One short hosted reply. Issued once per IP by the server, not by the client. */
export const TRIAL_TOKENS = 4_096;
