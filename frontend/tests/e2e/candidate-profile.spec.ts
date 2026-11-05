import { expect, test } from './fixtures';
import { authFile } from './global-setup';
import { authorizationHeaders } from './support/auth';
import {
  createCandidate as create,
  editPanel,
  finishPanel,
  savePanel,
} from './support/candidate-panels';
import {
  addValue,
  chip,
  chips,
  offered,
  openInput,
  removeValue,
  setLevel,
} from './support/catalog-picker';

test.use({ storageState: authFile('rrhh_admin') });

/** Creates a candidate and stays on its page (KTL-29: there is no separate edit page). */
async function createCandidate(
  page: import('@playwright/test').Page,
  firstName: string,
  lastName: string,
): Promise<string> {
  return create(page, firstName, lastName);
}

async function expectNoHorizontalScroll(page: import('@playwright/test').Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('Candidate profile enrichment', () => {
  test('stages languages and skills in Competencias, saves them together, and never duplicates', async ({
    page,
  }) => {
    const suffix = Date.now().toString();
    const id = await createCandidate(page, `Perfil${suffix}`, 'Test');
    const stored = async () =>
      (await (
        await page.request.get(`/api/candidates/${id}`, { headers: authorizationHeaders(page) })
      ).json()) as {
        languages: { id: string; language: string; level: string }[];
        skills: { skill: string }[];
        lastName: string;
      };

    await editPanel(page, 'competencies');
    await addValue(page, 'candidate-language', 'Inglés', 'B2');
    await expect(chip(page, 'candidate-language', 'Inglés')).toContainText('B2');
    // A value the candidate already has is not offered, so it cannot be added twice.
    await expect(await offered(page, 'candidate-language', 'Ingl')).toHaveCount(0);

    // KTL-27: a value joins at the lowest active level, without opening the editor; closing
    // the editor without a choice keeps that level.
    await (await openInput(page, 'candidate-language')).fill('Alem');
    await page.getByRole('listbox').getByRole('option', { name: 'Alemán', exact: true }).click();
    await expect(page.getByTestId('candidate-language-editor')).toHaveCount(0);
    await expect(chips(page, 'candidate-language')).toHaveCount(2);
    const levels = (await (
      await page.request.get('/api/catalogs/language_level', {
        headers: authorizationHeaders(page),
      })
    ).json()) as { nameEs: string; sortOrder: number }[];
    const lowest = [...levels].sort((a, b) => a.sortOrder - b.sortOrder)[0].nameEs;
    await chip(page, 'candidate-language', 'Alemán').click();
    await expect(page.getByTestId('candidate-language-editor')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('candidate-language-editor')).toHaveCount(0);
    await expect(chip(page, 'candidate-language', 'Alemán')).toContainText(lowest);

    // KTL-29: nothing is written until «Guardar».
    expect((await stored()).languages).toEqual([]);
    await savePanel(page, 'competencies');
    // The API returns entries in its own order, so compare as a set.
    const saved = (await stored()).languages;
    expect(saved).toHaveLength(2);
    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ language: 'Inglés', level: 'B2' }),
        expect.objectContaining({ language: 'Alemán', level: lowest }),
      ]),
    );

    // The level changes in place: same entry, new level, nothing added or removed.
    const before = saved.find((entry) => entry.language === 'Inglés')!;
    await editPanel(page, 'competencies');
    await removeValue(page, 'candidate-language', 'Alemán');
    await setLevel(page, 'candidate-language', 'Inglés', 'C1');
    await addValue(page, 'candidate-skill', 'Compras', 'Medio');
    await savePanel(page, 'competencies');
    expect((await stored()).languages).toEqual([
      expect.objectContaining({ id: before.id, level: 'C1' }),
    ]);

    // Saving another panel afterwards does not conflict with the Competencias save.
    await editPanel(page, 'main');
    await page.fill('input[name="lastName"]', 'Test Editado');
    await savePanel(page, 'main');
    // Each saved panel announced its own confirmation; the latest is the core record's.
    await expect(page.locator('.toast').last()).toBeVisible();
    expect((await stored()).lastName).toBe('Test Editado');

    // Read-only again, every section shows what was saved and offers no control of its own.
    await page.reload();
    await expect(chips(page, 'candidate-skill')).toHaveCount(1);
    await expect(chip(page, 'candidate-language', 'Inglés')).toContainText('C1');
    for (const testId of [
      'candidate-languages',
      'candidate-programs',
      'candidate-education',
      'candidate-experience',
      'candidate-skills',
      'candidate-tags',
      'candidate-notes',
      'candidate-documents',
    ]) {
      const section = page.getByTestId(testId);
      await expect(section.locator('form')).toHaveCount(0);
      await expect(section.locator('button')).toHaveCount(0);
      await expect(section.getByRole('combobox')).toHaveCount(0);
    }
    await expect(page.getByTestId('document-file')).toHaveCount(0);
  });

  test('edits each panel in place, one at a time, and guards unsaved changes (KTL-29)', async ({
    page,
  }) => {
    const suffix = Date.now().toString();
    const id = await createCandidate(page, `Panel${suffix}`, 'Test');
    const stored = async () =>
      (await (
        await page.request.get(`/api/candidates/${id}`, { headers: authorizationHeaders(page) })
      ).json()) as { education: { degree: string }[]; experience: { company: string }[] };

    // Formación: «Añadir formación» writes at once (KTL-46 follow-up); the X closes the panel.
    // The entry form waits behind «Nueva formación».
    await editPanel(page, 'education');
    const education = page.getByTestId('candidate-education');
    await expect(education.locator('form')).toHaveCount(0);
    await page.getByTestId('education-new').click();
    await education.locator('select[name="educationType"]').selectOption('Grado');
    await education.locator('input[name="degree"]').fill(`Grado ${suffix}`);
    await education.locator('input[name="institution"]').fill('UCM');
    await education.locator('select[name="status"]').selectOption('Finalizada');
    await education.locator('form button[type="submit"]').click();
    await expect(education.locator('.item-row')).toContainText(`Grado ${suffix}`);
    await expect
      .poll(async () => (await stored()).education.map((item) => item.degree))
      .toEqual([`Grado ${suffix}`]);
    await expect(page.getByTestId('candidate-panel-education-save')).toHaveCount(0);
    await finishPanel(page, 'education');

    // Switching panels with an entry typed but not added asks first; declining keeps it.
    await editPanel(page, 'experience');
    const experience = page.getByTestId('candidate-experience');
    await page.getByTestId('experience-new').click();
    await experience.locator('input[name="company"]').fill(`Acme ${suffix}`);
    await page.getByTestId('candidate-panel-education-edit').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('candidate-panel-experience-done')).toBeVisible();
    await expect(experience.locator('input[name="company"]')).toHaveValue(`Acme ${suffix}`);

    // Leaving the page with unsaved changes asks too; declining stays with the form.
    await page.getByTestId('breadcrumb-candidates').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-cancel').click();
    await expect(page).toHaveURL(new RegExp(`/app/candidates/${id}$`));
    await expect(experience.locator('input[name="company"]')).toHaveValue(`Acme ${suffix}`);

    // At 390px an open panel still fits without horizontal scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalScroll(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    // Confirming the switch discards what was typed and opens the other panel.
    await page.getByTestId('candidate-panel-notes-edit').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('candidate-panel-notes-done')).toBeVisible();
    await expect(experience.locator('input[name="company"]')).toHaveCount(0);
    await finishPanel(page, 'notes');
    expect((await stored()).experience).toEqual([]);

    // A former edit address still resolves, to the same page.
    await page.goto(`/app/candidates/${id}/edit`);
    await expect(page).toHaveURL(new RegExp(`/app/candidates/${id}$`));
    await expect(page.getByTestId('candidate-panel-main-edit')).toBeVisible();
  });

  test('stacks the sections and shares the family rows with search (KTL-27)', async ({ page }) => {
    const suffix = Date.now().toString();
    await createCandidate(page, `Filas${suffix}`, 'Test');
    const candidateUrl = page.url();

    const families = async () =>
      page
        .getByTestId('candidate-competencies')
        .locator('.catalog-family-row')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-family')));
    const labelWidths = async () =>
      page
        .locator('.catalog-family-row .catalog-picker-label')
        .evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().width));
    // One full-width section per row: same left edge and width, each below the previous one.
    const expectStacked = async (testIds: string[]) => {
      const boxes = [];
      for (const testId of testIds) {
        boxes.push(
          await page.getByTestId(testId).evaluate((element) => {
            const { x, y, width, height } = element.closest('.panel')!.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
      }
      for (let index = 1; index < boxes.length; index++) {
        expect(boxes[index].y).toBeGreaterThan(boxes[index - 1].y + boxes[index - 1].height - 1);
        expect(Math.abs(boxes[index].x - boxes[0].x)).toBeLessThanOrEqual(1);
        expect(Math.abs(boxes[index].width - boxes[0].width)).toBeLessThanOrEqual(1);
      }
    };
    const sections = [
      'candidate-competencies',
      'candidate-education',
      'candidate-experience',
      'candidate-notes',
      'candidate-documents',
    ];

    await editPanel(page, 'competencies');
    await expect(page.getByTestId('candidate-skill-add')).toBeEnabled();
    expect(await families()).toEqual(['skill', 'language', 'program', 'tag']);
    await expectStacked(sections);
    const candidateWidths = await labelWidths();

    await page.goto('/app/search');
    await expect(page.getByTestId('search-skill-add')).toBeEnabled();
    const searchRows = await page
      .locator('.catalog-family-row')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-family')));
    expect(searchRows).toEqual(['skill', 'language', 'program', 'tag']);
    expect(await labelWidths()).toEqual(candidateWidths);

    await page.goto(candidateUrl);
    await expect(page.getByTestId('candidate-competencies')).toBeVisible();
    expect(await families()).toEqual(['skill', 'language', 'program', 'tag']);
    await expectStacked(sections);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(candidateUrl);
    await expect(page.getByTestId('candidate-competencies')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await editPanel(page, 'competencies');
    await expectNoHorizontalScroll(page);
  });

  test('shows the CV beside the sections on wide screens and after them otherwise (KTL-28)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Without a preview the shell keeps its default cap.
    await page.goto('/app/candidates');
    const mainWidth = await page
      .locator('main')
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(mainWidth).toBeLessThanOrEqual(1440);

    await createCandidate(page, `Vista${Date.now()}`, 'Test');
    const candidateUrl = page.url();
    await editPanel(page, 'documents');
    const documents = page.getByTestId('candidate-documents');
    await documents.getByTestId('document-file').setInputFiles({
      name: 'vista-cv.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF',
        'utf-8',
      ),
    });
    await documents.getByTestId('document-upload').click();
    // The preview follows the scan and loads the PDF once it is clean.
    await expect(page.getByTestId('cv-preview-viewer')).toHaveAttribute('data', /^blob:/, {
      timeout: 25_000,
    });
    await finishPanel(page, 'documents');

    const box = async (locator: import('@playwright/test').Locator) =>
      (await locator.boundingBox())!;
    const mainData = () => page.locator('.page-split__main .panel').first();
    const preview = page.getByTestId('candidate-cv-preview');

    // Read-only, and with Datos principales in edit mode.
    for (const editing of [false, true]) {
      await page.goto(candidateUrl);
      await expect(page.getByTestId('cv-preview-viewer')).toHaveAttribute('data', /^blob:/);
      if (editing) await editPanel(page, 'main');
      await page.evaluate(() => window.scrollTo(0, 0));
      const data = await box(mainData());
      const side = await box(preview);
      expect(side.x).toBeGreaterThanOrEqual(data.x + data.width);
      expect(side.y).toBeLessThan(data.y + data.height);

      // Sticky: still fully visible below the header once the sections scroll to Documentos.
      await page.getByTestId('candidate-documents').scrollIntoViewIfNeeded();
      const header = await box(page.locator('.shell header'));
      const stuck = await box(preview);
      expect(stuck.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
      expect(stuck.y + stuck.height).toBeLessThanOrEqual(1080 + 1);
    }

    // The main data form keeps two columns beside the preview, and a picker opens on screen.
    const first = await box(page.locator('input[name="firstName"]'));
    const last = await box(page.locator('input[name="lastName"]'));
    expect(Math.abs(first.y - last.y)).toBeLessThanOrEqual(1);
    await page.getByTestId('candidate-panel-main-cancel').click();
    await editPanel(page, 'competencies');
    await (await openInput(page, 'candidate-skill')).fill('a');
    const listbox = await box(page.getByRole('listbox'));
    expect(listbox.x).toBeGreaterThanOrEqual(0);
    expect(listbox.x + listbox.width).toBeLessThanOrEqual(1920);
    await page.keyboard.press('Escape');

    // At 1366×768 the content area is under the threshold: the preview follows Documentos.
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(candidateUrl);
    await expect(preview).toBeVisible();
    const lastPanel = await box(page.getByTestId('candidate-documents'));
    expect((await box(preview)).y).toBeGreaterThanOrEqual(lastPanel.y + lastPanel.height);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(candidateUrl);
    await expect(preview).toBeVisible();
    await expectNoHorizontalScroll(page);
    await editPanel(page, 'main');
    await expectNoHorizontalScroll(page);
  });

  test('rejects experience with an end date before the start date', async ({ page }) => {
    const suffix = Date.now().toString();
    await createCandidate(page, `Exp${suffix}`, 'Test');
    await editPanel(page, 'experience');
    await page.getByTestId('experience-new').click();

    const experiencePanel = page.getByTestId('candidate-experience');
    await experiencePanel.locator('input[name="company"]').fill('Acme');
    await experiencePanel.locator('input[name="position"]').fill('Analista');
    await experiencePanel.locator('select[name="sector"]').selectOption('Servicios');
    // KTL-46 follow-up: a month and a year each.
    await experiencePanel.locator('select[name="startDateMonth"]').selectOption('6');
    await experiencePanel.locator('select[name="startDateYear"]').selectOption('2024');
    await experiencePanel.locator('select[name="endDateMonth"]').selectOption('1');
    await experiencePanel.locator('select[name="endDateYear"]').selectOption('2024');
    await experiencePanel.locator('form button[type="submit"]').click();

    await expect(experiencePanel.locator('text=no puede ser anterior')).toBeVisible();
  });

  test('requires a degree before adding education', async ({ page }) => {
    const suffix = Date.now().toString();
    await createCandidate(page, `Edu${suffix}`, 'Test');
    await editPanel(page, 'education');
    await page.getByTestId('education-new').click();

    const educationPanel = page.getByTestId('candidate-education');
    await educationPanel.locator('select[name="educationType"]').selectOption('Grado');
    await educationPanel.locator('select[name="status"]').selectOption('Finalizada');
    await educationPanel.locator('form button[type="submit"]').click();

    await expect(educationPanel.locator('text=titulación es obligatoria')).toBeVisible();
  });
});
