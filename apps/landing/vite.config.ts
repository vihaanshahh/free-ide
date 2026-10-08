import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.env.SUBSPACES_LANDING_PORT || 41825);

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
  preview: {
    host: "0.0.0.0",
    port,
    strictPort: true,
  },
});
