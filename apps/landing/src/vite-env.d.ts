/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IDE_URL?: string;
  readonly VITE_DOWNLOAD_BASE_URL?: string;
  readonly VITE_DOWNLOAD_URL?: string;
  readonly NEXT_PUBLIC_DOWNLOAD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
