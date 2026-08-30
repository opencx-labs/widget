/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENCX_WIDGET_TOKEN?: string;
  readonly VITE_OPENCX_AGENT_ID?: string;
  readonly VITE_OPENCX_API_URL?: string;
  readonly VITE_OPENCX_BOT_NAME?: string;
  readonly VITE_OPENCX_WIDGET_SRC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
