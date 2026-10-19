/**
 * Non-secret model settings. Change hosts and ids here.
 * Secrets stay in the environment: LLM_API_KEY, optional LLM_FALLBACK_API_KEY, GRAVITY_API_KEY.
 */

export const PRIMARY_MODEL = "glm-5.3-flash";
export const FALLBACK_MODEL = "deepseek-v4.1-flash";

/** Z.ai OpenAI-compatible chat host for glm-5.3-flash. */
export const LLM_BASE_URL = "https://api.z.ai/api/paas/v4";

/**
 * DeepSeek OpenAI-compatible host.
 * TODO: if deepseek-v4.1-flash is rejected, switch FALLBACK_MODEL to deepseek-flash.
 */
export const LLM_FALLBACK_BASE_URL = "https://api.deepseek.com";

/** Public Gravity pixel. Not a secret. */
export const GRAVITY_PIXEL_ID = "9f5969b9-4f34-449e-8360-992259cd0f50";

export const MAX_OUTPUT_TOKENS = 2048;
export const MAX_REQUEST_BYTES = 48_000;
export const MODEL_REQUESTS_PER_MINUTE = 30;
