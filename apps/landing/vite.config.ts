import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, "../..");
const port = Number(process.env.SUBSPACES_LANDING_PORT || 41825);
const apiPort = Number(process.env.SUBSPACES_API_PORT || 41824);

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
      "/v1": `http://127.0.0.1:${apiPort}`,
    },
  },
  preview: {
    host: "0.0.0.0",
    port,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(dir, "index.html"),
        download: path.resolve(dir, "download/index.html"),
        pricing: path.resolve(dir, "pricing/index.html"),
        security: path.resolve(dir, "security/index.html"),
        changelog: path.resolve(dir, "changelog/index.html"),
        about: path.resolve(dir, "about/index.html"),
        tasks: path.resolve(dir, "tasks/index.html"),
        templates: path.resolve(dir, "templates/index.html"),
      },
    },
  },
});
