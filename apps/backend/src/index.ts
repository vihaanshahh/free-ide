import { serve } from "@hono/node-server";
import { app, attachHarness } from "./app.ts";
import { loadEnvFile, mockLlmEnabled } from "./env.ts";
import { defaultHarness } from "./harness.ts";

export default app;

// Vercel imports this module as a function. The opencode child and the
// listening server are the local IDE only.
if (process.env.VERCEL !== "1") {
  loadEnvFile();

  const port = Number(process.env.SUBSPACES_API_PORT || process.env.PORT || 41824);
  const autostart = process.env.OPENCODE_AUTOSTART !== "0";

  if (autostart) {
    const harness = defaultHarness();
    attachHarness(harness);
    harness.start().catch((error: unknown) => {
      console.error("opencode harness failed to start.", error instanceof Error ? error.message : "unknown");
    });
  }

  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
    console.log(`subspaces proxy on http://127.0.0.1:${port} mockLlm=${mockLlmEnabled()} opencode=${autostart}`);
  });
}
