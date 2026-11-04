import { expect, test, type Page } from './fixtures';

/**
 * KTL-45. The dev server already asks for a password, but this spec pins its own runtime
 * configuration so it does not depend on what `public/env.js` happens to say. The accounts
 * are the ones the migrator seeds from docker-compose.yml, with its development-only passwords;
 * they are shared fixtures, not records this spec creates.
 */
const ACCOUNTS = {
  admin: { userName: 'rrhh_admin', password: 'KeplerLocal-Admin-2026' },
  user: { userName: 'rrhh_user', password: 'KeplerLocal-User-2026' },
} as const;

async function usePasswordMode(page: Page): Promise<void> {
  await page.route('**/env.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: "window.__APP_CONFIG__ = { API_BASE_URL: '/api', APP_ENV: 'local', AUTH_MODE: 'password', APP_VERSION: 'e2e' };",
    }),
  );
}

async function signInWithPassword(
  page: Page,
  account: { userName: string; password: string },
): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-username').fill(account.userName);
  await page.getByTestId('login-password').fill(account.password);
  await page.getByTestId('sign-in').click();
}

/** In-app navigation, so the route guard runs without a reload. */
async function navigateInApp(page: Page, url: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

test.describe('Password sign-in', () => {
  test.beforeEach(async ({ page }) => {
    await usePasswordMode(page);
  });

  test('refuses a wrong password, keeps the user name and clears the password', async ({
    page,
  }) => {
    await signInWithPassword(page, { userName: ACCOUNTS.user.userName, password: 'not-the-one' });

    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-username')).toHaveValue(ACCOUNTS.user.userName);
    await expect(page.getByTestId('login-password')).toHaveValue('');
  });

  test('the user account works without administration', async ({ page }) => {
    await signInWithPassword(page, ACCOUNTS.user);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId('nav-candidates')).toBeVisible();
    await expect(page.getByTestId('nav-admin-trigger')).toHaveCount(0);

    await navigateInApp(page, '/app/admin/users');
    await expect(page).not.toHaveURL(/\/app\/admin\/users/);
  });

  test('the administrator account reaches user administration', async ({ page }) => {
    await signInWithPassword(page, ACCOUNTS.admin);
    await expect(page).toHaveURL(/\/app$/);

    await page.getByTestId('nav-admin-trigger').click();
    await page.getByTestId('nav-users').click();
    await expect(page).toHaveURL(/\/app\/admin\/users$/);
  });

  test('a reload keeps the session, and signing out ends it', async ({ page }) => {
    await signInWithPassword(page, ACCOUNTS.user);
    await expect(page).toHaveURL(/\/app$/);

    await page.reload();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId('sign-out')).toBeVisible();

    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => sessionStorage.getItem('ktl.auth.session'))).toBeNull();

    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-password')).toBeVisible();
  });
});
