import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../../apps/extension/media",
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 200_000,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        format: "iife",
        name: "SubspacesChat",
        entryFileNames: "chat.js",
        assetFileNames: "chat.[ext]",
        inlineDynamicImports: true,
      },
    },
  },
});
