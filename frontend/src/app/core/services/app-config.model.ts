/** How the browser signs in (KTL-45). */
export type AuthMode = 'development' | 'password' | 'entra';

export interface AppConfig {
  APP_ENV: string;
  APP_VERSION: string;
  API_BASE_URL: string;
  AUTH_MODE: AuthMode;
  ENTRA_CLIENT_ID: string;
  ENTRA_AUTHORITY: string;
  ENTRA_API_SCOPE: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<Record<keyof AppConfig, string>>;
  }
}

const AUTH_MODES: readonly AuthMode[] = ['development', 'password', 'entra'];

/**
 * An explicit `AUTH_MODE` wins. Without one, a deployment keeps the behaviour it had before the
 * setting existed: local and test environments use the development issuer, anything else Entra.
 * An unsubstituted template value (`''`) counts as absent.
 */
export function resolveAuthMode(authMode: string | undefined, appEnv: string): AuthMode {
  if (authMode && (AUTH_MODES as readonly string[]).includes(authMode)) {
    return authMode as AuthMode;
  }
  return appEnv === 'local' || appEnv === 'test' ? 'development' : 'entra';
}

export function readAppConfig(): AppConfig {
  const config = window.__APP_CONFIG__ ?? {};
  const appEnv = config.APP_ENV ?? 'local';
  return {
    APP_ENV: appEnv,
    APP_VERSION: config.APP_VERSION ?? '0.1.0',
    API_BASE_URL: config.API_BASE_URL ?? '/api',
    AUTH_MODE: resolveAuthMode(config.AUTH_MODE, appEnv),
    ENTRA_CLIENT_ID: config.ENTRA_CLIENT_ID ?? '',
    ENTRA_AUTHORITY: config.ENTRA_AUTHORITY ?? '',
    ENTRA_API_SCOPE: config.ENTRA_API_SCOPE ?? '',
  };
}
