import { expect, test } from './fixtures';
import { authFile } from './global-setup';
import { CANDIDATE_PAGE_URL, editPanel, savePanel } from './support/candidate-panels';

test.use({ storageState: authFile('rrhh_admin') });

test.describe('Candidate CRUD', () => {
  test('validates contacts and serves the Kepler Talent brand locally', async ({ page }) => {
    await page.goto('/app/candidates/new');
    await expect(page).toHaveTitle('Kepler Talent');
    await expect(page.locator('.brand strong')).toHaveText('Kepler Talent');
    await page.fill('input[name="firstName"]', `Contact${Date.now()}`);
    await page.fill('input[name="lastName"]', 'Test');
    await page.fill('input[name="email"]', 'invalid');
    await page.click('button[type="submit"]');
    await expect(page.getByRole('alert')).toBeVisible();
    await page.fill('input[name="email"]', '');
    await page.fill('input[name="phone"]', '612-345-678');
    await page.click('button[type="submit"]');
    await expect(page.getByRole('alert')).toBeVisible();
    await page.fill('input[name="phone"]', '12345678');
    await page.click('button[type="submit"]');
    await expect(page.getByRole('alert')).toBeVisible();
    for (const icon of ['/favicon-150.png', '/favicon-300.png']) {
      const response = await page.request.get(icon);
      expect(response.ok()).toBeTruthy();
      expect(response.headers()['content-type']).toContain('image/png');
    }
    await page.fill('input[name="phone"]', '+34 (612) 345 678');
    await page.route(/\/api\/candidates$/, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 400,
          code: 'validation.failed',
          errors: [{ property: 'Phone', code: 'candidate.phone.too_short' }],
        }),
      }),
    );
    await page.click('button[type="submit"]');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('input[name="phone"]')).toHaveValue('+34 (612) 345 678');
    await page.unroute(/\/api\/candidates$/);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(CANDIDATE_PAGE_URL);
  });
  test('creates, edits, and logically deactivates a candidate', async ({ page }) => {
    const uniqueSuffix = Date.now().toString();
    const firstName = `Test${uniqueSuffix}`;
    const lastName = 'Candidato';

    await page.goto('/app/candidates/new');
    await page.fill('input[name="firstName"]', firstName);
    await page.fill('input[name="lastName"]', lastName);
    await page.click('button[type="submit"]');

    // KTL-29: creating opens the candidate page, where Datos principales is edited in place.
    await expect(page).toHaveURL(CANDIDATE_PAGE_URL);
    await editPanel(page, 'main');
    await page.fill('input[name="lastName"]', `${lastName} Editado`);
    await savePanel(page, 'main');
    await expect(page.locator('.toast')).toBeVisible();
    await expect(page).toHaveURL(CANDIDATE_PAGE_URL);
    await expect(page.locator('h1')).toContainText(`${firstName} ${lastName} Editado`);
    const summary = page.getByTestId('candidate-summary-row');
    const main = summary.locator('article').first();
    const availability = summary.locator('article').last();
    await expect(availability.getByTestId('candidate-availability')).toBeVisible();
    await expect(page.getByTestId('candidate-audit')).toHaveCount(0);
    const wideMain = await main.boundingBox();
    const wideAvailability = await availability.boundingBox();
    expect(wideMain && wideAvailability).toBeTruthy();
    expect(Math.abs(wideMain!.y - wideAvailability!.y)).toBeLessThan(12);

    const timestamps = page.getByTestId('candidate-timestamps');
    await expect(timestamps).toContainText('Actualizado');
    const info = timestamps.getByRole('button');
    await info.focus();
    await page.keyboard.press('Enter');
    await expect(info).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.candidate-detail__exact-dates')).toContainText('Creado');

    await page.setViewportSize({ width: 390, height: 844 });
    const narrowMain = await main.boundingBox();
    const narrowAvailability = await availability.boundingBox();
    expect(narrowMain && narrowAvailability).toBeTruthy();
    expect(narrowAvailability!.y).toBeGreaterThan(narrowMain!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.setViewportSize({ width: 1280, height: 720 });

    // KTL-23: the breadcrumb names the stored record and leads back to the list.
    const breadcrumb = page.getByTestId('breadcrumb');
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(
      `${firstName} ${lastName} Editado`,
    );

    await breadcrumb.getByTestId('breadcrumb-candidates').click();
    await expect(page).toHaveURL(/\/app\/candidates$/);
    await expect(page.getByTestId('breadcrumb')).toHaveCount(0);
    await expect(page.locator(`text=${firstName} ${lastName} Editado`)).toBeVisible();

    // KTL-31: the row opens the candidate. Click a plain cell (the update date), not the name link.
    const row = page.getByTestId('candidate-row').filter({ hasText: firstName });
    await expect(row.locator('a[href^="tel:"]')).toHaveCount(0);
    await row.locator('td:not([data-row-link-ignore])').last().click();
    await expect(page).toHaveURL(CANDIDATE_PAGE_URL);
    await page.click('button:has-text("Baja lógica")');
    await page.getByTestId('confirm-accept').click();

    await expect(page.getByTestId('candidate-inactive')).toBeVisible();

    await page.goto('/app/candidates');
    await expect(page.locator(`text=${firstName} ${lastName} Editado`)).toHaveCount(0);
  });

  test('reverts a logical deactivation with alta lógica', async ({ page }) => {
    const uniqueSuffix = Date.now().toString();
    const firstName = `Alta${uniqueSuffix}`;

    await page.goto('/app/candidates/new');
    await page.fill('input[name="firstName"]', firstName);
    await page.fill('input[name="lastName"]', 'Candidato');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(CANDIDATE_PAGE_URL);

    await page.click('button:has-text("Baja lógica")');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('candidate-inactive')).toBeVisible();

    await page.click('button:has-text("Alta lógica")');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('candidate-inactive')).toHaveCount(0);

    await page.goto('/app/candidates');
    await page.fill('input[name="text"]', firstName);
    await expect(page.locator(`tbody tr:has-text("${firstName}")`)).toHaveCount(1);
  });

  test('blocks empty submission with a validation message', async ({ page }) => {
    await page.goto('/app/candidates/new');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Nombre y apellidos son obligatorios.')).toBeVisible();
    await expect(page).toHaveURL(/\/app\/candidates\/new$/);
  });
});
