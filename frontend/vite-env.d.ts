/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_TOKEN: string
  readonly VITE_PREORDER_BASE_URL: string
  readonly VITE_PREORDER_ADMIN_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}