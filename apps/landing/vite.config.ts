import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.env.SUBSPACES_LANDING_PORT || 41825);
const apiPort = Number(process.env.SUBSPACES_API_PORT || 41824);

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
      "/v1": `http://127.0.0.1:${apiPort}`,
    },
  },
  preview: {
    host: "127.0.0.1",
    port,
    strictPort: true,
  },
});
