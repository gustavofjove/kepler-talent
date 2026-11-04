window.__APP_CONFIG__ = {
  API_BASE_URL: '/api',
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  APP_ENV: 'local',
  // KTL-45: the dev server asks for a user name and password too (rrhh_admin / rrhh_user).
  // Only the e2e browser is switched back to the development issuer (tests/e2e/support/auth.ts).
  AUTH_MODE: 'password',
  APP_VERSION: '0.1.0',
};
