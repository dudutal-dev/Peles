/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** כתובת שרת ההתראות (push-server). ריק = התראות לא מוגדרות. */
  readonly VITE_PUSH_URL?: string;
}
