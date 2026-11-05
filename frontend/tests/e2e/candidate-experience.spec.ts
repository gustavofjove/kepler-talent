import { expect, test, type Page } from './fixtures';
import { authFile } from './global-setup';
import { authorizationHeaders } from './support/auth';
import {
  CANDIDATE_PAGE_URL,
  createCandidate,
  editPanel,
  finishPanel,
} from './support/candidate-panels';

/**
 * KTL-46: the experience description, worked-out years, the read-only accordion, and a panel
 * save that outlives the end of the session. Every candidate carries a Date.now() marker so the
 * global teardown purges it.
 */

interface StoredExperience {
  company: string;
  functions: string | null;
  yearsExperience: number | null;
}

async function storedExperience(
  page: Page,
  id: string,
  headers?: Record<string, string>,
): Promise<StoredExperience[]> {
  const response = await page.request.get(`/api/candidates/${id}`, {
    headers: headers ?? authorizationHeaders(page),
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { experience: StoredExperience[] }).experience;
}

/** Picks an experience date's month (1–12) and year; there is no day (KTL-46 follow-up). */
async function pickMonthYear(
  form: ReturnType<Page['getByTestId']>,
  name: 'startDate' | 'endDate',
  month: number,
  year: number,
): Promise<void> {
  await form.locator(`select[name="${name}Month"]`).selectOption(String(month));
  await form.locator(`select[name="${name}Year"]`).selectOption(String(year));
}

/** Fills the Experiencia form without adding the entry. */
async function fillEntry(
  page: Page,
  company: string,
  dates?: { start: [number, number]; end: [number, number] },
): Promise<void> {
  const form = page.getByTestId('experience-add-form');
  // KTL-46 follow-up: the form waits behind «Nueva experiencia».
  if ((await form.count()) === 0) await page.getByTestId('experience-new').click();
  await form.locator('input[name="company"]').fill(company);
  await form.locator('input[name="position"]').fill('Analista');
  await form.locator('select[name="sector"]').selectOption('Servicios');
  if (dates) {
    await pickMonthYear(form, 'startDate', ...dates.start);
    await pickMonthYear(form, 'endDate', ...dates.end);
  }
}

/** «Añadir experiencia», which writes the entry at once (KTL-46 follow-up). */
async function addEntry(page: Page): Promise<void> {
  await page.getByTestId('experience-add-form').locator('button[type="submit"]').click();
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('Experience records', () => {
  test.use({ storageState: authFile('rrhh_admin') });

  test('saves a formatted description, works the years out and shows it in the accordion', async ({
    page,
  }) => {
    const marker = Date.now().toString();
    const id = await createCandidate(page, `Exp${marker}`, 'Descripcion');
    await editPanel(page, 'experience');
    const form = page.getByTestId('experience-add-form');
    // The form is hidden until «Nueva experiencia» (KTL-46 follow-up).
    await expect(form).toHaveCount(0);
    await page.getByTestId('experience-new').click();

    await form.locator('input[name="company"]').fill(`Acme ${marker}`);
    await form.locator('input[name="position"]').fill('Analista');
    await form.locator('select[name="sector"]').selectOption('Servicios');
    await expect(form.locator('input[type="date"]')).toHaveCount(0);
    await pickMonthYear(form, 'startDate', 3, 2019);
    await pickMonthYear(form, 'endDate', 6, 2024);
    const years = form.locator('input[name="yearsExperience"]');
    await expect(years).toHaveAttribute('readonly', '');
    // March 2019 to June 2024, both months included.
    await expect(years).toHaveValue('5,3');

    // «Puesto actual» clears and disables the end date; unticking leaves it empty.
    await form.locator('input[name="isCurrent"]').check();
    await expect(form.locator('select[name="endDateMonth"]')).toBeDisabled();
    await form.locator('input[name="isCurrent"]').uncheck();
    await expect(form.locator('select[name="endDateYear"]')).toHaveValue('');
    await pickMonthYear(form, 'endDate', 6, 2024);

    const editor = form.locator('[contenteditable][name="functions"]');
    await editor.click();
    await page.keyboard.type('Coordinación de equipos');
    await page.keyboard.press('ControlOrMeta+a');
    await form.locator('button[name="functionsBold"]').click();
    // Underline is not offered, and its shortcut does nothing (KTL-46 follow-up).
    await expect(form.locator('button[name="functionsUnderline"]')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+u');

    // The form fits a phone with the editor open.
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalScroll(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    // «Añadir experiencia» writes at once; there is no panel «Guardar», only the X.
    await addEntry(page);
    await expect.poll(async () => (await storedExperience(page, id)).length).toBe(1);
    await expect(page.getByTestId('candidate-panel-experience-save')).toHaveCount(0);
    await finishPanel(page, 'experience');

    const [saved] = await storedExperience(page, id);
    expect(saved.yearsExperience).toBe(5.3);
    expect(saved.functions).toMatch(/<strong>.*Coordinación de equipos/);
    expect(saved.functions).not.toMatch(/<u>|style=|<span/);

    await page.reload();
    const toggle = page.getByTestId('experience-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const description = page.getByTestId('experience-description');
    // The editor may export the bold phrase as more than one run.
    await expect(description).toHaveText('Coordinación de equipos');
    await expect(description.locator('strong').first()).toBeVisible();
    await expect(description.locator('u')).toHaveCount(0);
  });

  test('keeps the typed entry when its write is refused as unauthenticated, then writes it', async ({
    page,
  }) => {
    const marker = Date.now().toString();
    const id = await createCandidate(page, `Ses${marker}`, 'Caducada');
    await editPanel(page, 'experience');
    await fillEntry(page, `Uno ${marker}`);
    await addEntry(page);
    await expect.poll(async () => (await storedExperience(page, id)).length).toBe(1);

    // The next write meets a refused token, as when it expired while the entry was typed.
    let refused = false;
    await page.route('**/api/candidates/*/experience', async (route) => {
      if (!refused) {
        refused = true;
        await route.fulfill({ status: 401, body: '' });
        return;
      }
      await route.continue();
    });
    await fillEntry(page, `Dos ${marker}`);
    await addEntry(page);

    await expect(page.getByTestId('session-expired')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/app/candidates/${id}$`));
    const form = page.getByTestId('experience-add-form');
    await expect(form.locator('input[name="company"]')).toHaveValue(`Dos ${marker}`);
    expect(await storedExperience(page, id)).toHaveLength(1);

    await page.getByTestId('session-expired-sign-in').click();
    await expect(page.getByTestId('session-expired-dialog')).toBeVisible();
    await page.getByTestId('session-expired-submit').click();

    await expect(page.getByTestId('session-expired')).toHaveCount(0);
    // Written: the form closes back to «Nueva experiencia».
    await expect(form).toHaveCount(0);
    await expect
      .poll(async () => (await storedExperience(page, id)).map((item) => item.company).sort())
      .toEqual([`Dos ${marker}`, `Uno ${marker}`]);
  });
});

test.describe('Experience records with a password session', () => {
  // No role file: this journey signs in with a password itself.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('keeps the draft when the stored session has already expired, then saves it', async ({
    page,
  }) => {
    await page.route('**/env.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: "window.__APP_CONFIG__ = { API_BASE_URL: '/api', APP_ENV: 'local', AUTH_MODE: 'password', APP_VERSION: 'e2e' };",
      }),
    );
    // The development-only account the migrator seeds from docker-compose.yml.
    const account = { userName: 'rrhh_admin', password: 'KeplerLocal-Admin-2026' };
    await page.goto('/login');
    await page.getByTestId('login-username').fill(account.userName);
    await page.getByTestId('login-password').fill(account.password);
    await page.getByTestId('sign-in').click();
    await expect(page).toHaveURL(/\/app$/);

    // In-app navigation: a full load would go through the sign-in redirect and land on /app.
    const marker = Date.now().toString();
    await page.evaluate(() => {
      window.history.pushState({}, '', '/app/candidates/new');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.fill('input[name="firstName"]', `Pwd${marker}`);
    await page.fill('input[name="lastName"]', 'Caducada');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(CANDIDATE_PAGE_URL);
    const id = page.url().split('/').at(-1)!;
    await editPanel(page, 'experience');
    // January 2020 to December 2021: 24 months, 2 years.
    await fillEntry(page, `Acme ${marker}`, { start: [1, 2020], end: [12, 2021] });

    const token = await page.evaluate(() => {
      const raw = sessionStorage.getItem('ktl.auth.session')!;
      const session = JSON.parse(raw) as { accessToken: string; expiresAt: number };
      sessionStorage.setItem(
        'ktl.auth.session',
        JSON.stringify({ ...session, expiresAt: Date.now() - 1 }),
      );
      return session.accessToken;
    });
    await addEntry(page);

    await expect(page.getByTestId('session-expired')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/app/candidates/${id}$`));

    await page.getByTestId('session-expired-sign-in').click();
    await page.getByTestId('session-username').fill(account.userName);
    await page.getByTestId('session-password').fill(account.password);
    await page.getByTestId('session-expired-submit').click();

    await expect(page.getByTestId('session-expired')).toHaveCount(0);
    await expect
      .poll(
        async () => (await storedExperience(page, id, { Authorization: `Bearer ${token}` })).length,
      )
      .toBe(1);
    const [saved] = await storedExperience(page, id, { Authorization: `Bearer ${token}` });
    expect(saved.company).toBe(`Acme ${marker}`);
    expect(saved.yearsExperience).toBe(2);
  });
});
