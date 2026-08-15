/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Google refuses a desktop client without this, whatever PKCE does. It is
   * not confidential, and it ships inside the app. See `oauth-config.ts`.
   */
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
  /** The planner the internal flavor signs in to. Default: the live site. */
  readonly VITE_PLANNER_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
