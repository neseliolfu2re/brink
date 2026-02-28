/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MODULE_ADDRESS?: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_APTOS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
