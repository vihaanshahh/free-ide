/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IDE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
