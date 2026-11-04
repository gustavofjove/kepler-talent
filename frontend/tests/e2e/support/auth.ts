import type { Page, Response } from '@playwright/test';

type AuthRole = 'rrhh_admin' | 'readonly' | 'system_admin';

/**
 * The KTL-19 auditor. `system_admin` is the only seeded role holding `audit.read`, and a new
 * subject is provisioned as `readonly`, so global setup creates this user by email first and
 * the sign-in links to it.
 */
export const AUDITOR = {
  subject: 'e2e-auditor-oid',
  displayName: 'Auditor e2e',
  email: 'e2e-auditor@kepler-talento.local',
};

const patchedPages = new WeakSet<Page>();
const pageTokens = new WeakMap<Page, string>();

export function authorizationHeaders(page: Page): { Authorization: string } {
  const token = pageTokens.get(page);
  if (!token) throw new Error('The page has no authenticated development token.');
  return { Authorization: `Bearer ${token}` };
}

export async function signInAs(page: Page, role: AuthRole): Promise<void> {
  const originalGoto = page.goto.bind(page);
  const originalReload = page.reload.bind(page);

  await authenticate(page, role, originalGoto);

  if (patchedPages.has(page)) return;
  patchedPages.add(page);

  page.goto = async (url): Promise<Response | null> => {
    const target = new URL(url, page.url());
    if (target.origin !== new URL(page.url()).origin) return originalGoto(url);
    await navigateInApp(page, `${target.pathname}${target.search}${target.hash}`);
    return null;
  };

  page.reload = async (options): Promise<Response | null> => {
    const target = new URL(page.url());
    const response = await originalReload(options);
    await page.getByTestId('sign-in').waitFor();
    await authenticate(page, role, originalGoto);
    await navigateInApp(page, `${target.pathname}${target.search}${target.hash}`);
    return response;
  };
}

const developmentModePages = new WeakSet<Page>();

/**
 * KTL-45: the dev server signs people in with a password, like every other environment. The
 * suite still needs to be any of several roles without a password each, so only the test browser
 * is switched to the development issuer, by serving it its own runtime configuration.
 */
async function useDevelopmentSignIn(page: Page): Promise<void> {
  if (developmentModePages.has(page)) return;
  developmentModePages.add(page);
  await page.route('**/env.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: "window.__APP_CONFIG__ = { API_BASE_URL: '/api', APP_ENV: 'local', AUTH_MODE: 'development', APP_VERSION: 'e2e' };",
    }),
  );
}

async function authenticate(page: Page, role: AuthRole, goto: Page['goto']): Promise<void> {
  await useDevelopmentSignIn(page);
  await page.route('**/api/dev/token', async (route) => {
    const request = route.request();
    const identity =
      role === 'rrhh_admin'
        ? {
            subject: 'dev-admin-oid',
            displayName: 'Administrador local',
            email: 'admin@kepler-talento.local',
          }
        : role === 'system_admin'
          ? AUDITOR
          : {
              subject: 'e2e-readonly-oid',
              displayName: 'Usuario de solo lectura',
              email: 'e2e-readonly@kepler-talento.local',
            };
    const response = await route.fetch({
      postData: JSON.stringify(identity),
      headers: { ...request.headers(), 'content-type': 'application/json' },
    });
    const body = (await response.json()) as { accessToken: string };
    pageTokens.set(page, body.accessToken);
    await route.fulfill({ response, json: body });
  });
  await goto('/login');
  await page.getByTestId('sign-in').click();
  await page.waitForURL('**/app');
  await page.unroute('**/api/dev/token');
}

async function navigateInApp(page: Page, url: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}
