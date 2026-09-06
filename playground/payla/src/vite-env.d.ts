/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENCX_WIDGET_TOKEN?: string;
  readonly VITE_OPENCX_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
