import fs from "node:fs";
import path from "node:path";

export const OPENCODE_VERSION = "1.18.27";
export const PRIMARY_MODEL_ID = "glm-5.3-flash";
export const FALLBACK_MODEL_ID = "deepseek-v4.1-flash";
export const PRIMARY_MODEL_NAME = "GLM-5.3-Flash";
export const FALLBACK_MODEL_NAME = "DeepSeek V4.1 Flash";
export const DEFAULT_API = "https://subspaces.vercel.app/v1";
export const PROVIDER_KEY = "subspaces-local";

export interface OpencodeConfig {
  $schema: string;
  model: string;
  small_model: string;
  autoupdate: false;
  enabled_providers: string[];
  permission: { edit: string; bash: string; read: string; write: string };
  provider: {
    subspaces: {
      name: string;
      npm: string;
      env: string[];
      options: { baseURL: string; apiKey: string };
      models: Record<string, { name: string; tool_call: boolean }>;
    };
  };
}

export function resolveApi(env: NodeJS.ProcessEnv): string {
  const raw = (env.SUBSPACES_API || DEFAULT_API).trim().replace(/\/+$/, "");
  if (raw.endsWith("/v1")) return raw;
  return `${raw}/v1`;
}

export function apiOrigin(api: string): string {
  return api.replace(/\/v1$/, "");
}

export function hostedApi(api: string): boolean {
  const host = new URL(api).hostname;
  return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
}

export function buildOpencodeConfig(api: string, providerKey = PROVIDER_KEY): OpencodeConfig {
  return {
    $schema: "https://opencode.ai/config.json",
    model: `subspaces/${PRIMARY_MODEL_ID}`,
    small_model: `subspaces/${PRIMARY_MODEL_ID}`,
    autoupdate: false,
    enabled_providers: ["subspaces"],
    permission: { edit: "allow", bash: "allow", read: "allow", write: "allow" },
    provider: {
      subspaces: {
        name: "subspaces",
        npm: "@ai-sdk/openai-compatible",
        env: ["SUBSPACES_PROVIDER_KEY"],
        options: {
          baseURL: api,
          apiKey: providerKey,
        },
        models: {
          [PRIMARY_MODEL_ID]: { name: PRIMARY_MODEL_NAME, tool_call: true },
          [FALLBACK_MODEL_ID]: { name: FALLBACK_MODEL_NAME, tool_call: true },
        },
      },
    },
  };
}

export function writeOpencodeConfig(file: string, api: string, providerKey = PROVIDER_KEY): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(buildOpencodeConfig(api, providerKey), null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

const SECRET = /API_KEY|SECRET|TOKEN|PASSWORD/i;

export function opencodeEnv(base: NodeJS.ProcessEnv, home: string, configPath: string, providerKey = PROVIDER_KEY): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (key.startsWith("GRAVITY_") || SECRET.test(key)) continue;
    env[key] = value;
  }
  const dataHome = path.join(home, "opencode-home");
  env.HOME = dataHome;
  env.XDG_CONFIG_HOME = path.join(dataHome, ".config");
  env.XDG_DATA_HOME = path.join(dataHome, ".local", "share");
  env.OPENCODE_CONFIG = configPath;
  env.OPENCODE_DISABLE_AUTOUPDATE = "1";
  env.OPENCODE_DISABLE_MODELS_FETCH = "1";
  env.SUBSPACES_PROVIDER_KEY = providerKey;
  return env;
}

export function configPathFor(home: string): string {
  return path.join(home, "opencode.json");
}
