/// <reference types="vite/client" />

interface GravityDevice {
  ua?: string;
  timezone?: string;
  locale?: string;
}

interface GravityContext {
  sessionId: string;
  user: { userId: string };
  device: GravityDevice;
}

interface SubspacesBoot {
  surface: "chat" | "sidebar";
}

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface Window {
  __SUBSPACES__?: SubspacesBoot;
  __SUBSPACES_VSCODE__?: VsCodeApi;
}

declare module "*.svg" {
  const src: string;
  export default src;
}
