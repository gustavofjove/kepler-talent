import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import type { MockedObject } from 'vitest';
import { services, type Services } from '../../src/app/core/di/services';
import { ServicesProvider } from '../../src/app/core/di/services-context';
import { signal } from '../../src/app/core/state/signal';
import { CandidateEducation } from '../../src/app/features/candidates/components/candidate-education';
import { CandidateExperience } from '../../src/app/features/candidates/components/candidate-experience';
import type { PanelControl } from '../../src/app/features/candidates/components/candidate-panel.logic';
import type { Candidate } from '../../src/app/features/candidates/models/candidate.models';
import { CandidateRelationsService } from '../../src/app/features/candidates/services/candidate-relations.service';
import type { CatalogService } from '../../src/app/features/catalogs/services/catalog.service';
import { FakeCandidateApi } from './support/candidate-doubles';
import { loadedCatalogService } from './support/catalog-doubles';

const candidate: Candidate = new FakeCandidateApi().seed({
  id: 'c1',
  education: [
    {
      id: 'e1',
      educationType: 'Grado',
      degree: 'Grado en ADE',
      specialty: '',
      institution: 'UCM',
      endYear: 2020,
      status: 'Finalizado',
    },
  ],
  experience: [
    {
      id: 'x1',
      company: 'Kepler',
      position: 'Técnico',
      sector: 'Industria',
      startDate: '2020-01-01',
      yearsExperience: 4,
      isCurrent: true,
      functions: 'Mantenimiento de líneas',
    },
  ],
});

describe('Candidate profile section panels (KTL-29)', () => {
  it('keeps the CV preview after the panels, in the page aside (KTL-28)', () => {
    const source = readFileSync(
      'src/app/features/candidates/pages/candidate-detail-page.tsx',
      'utf8',
    );
    const preview = source.indexOf('<CandidateCvPreview');
    const documents = source.indexOf('<CandidateDocuments');
    expect(documents).toBeGreaterThan(-1);
    expect(preview).toBeGreaterThan(documents);
    // KTL-35: the page asks for a previewable primary CV before it offers the preview.
    expect(source.slice(preview)).toMatch(
      /<CandidateCvPreview\s[^>]*requirePreviewablePrimary\s*\/>\s*<\/aside>\s*<\/div>\s*<\/div>\s*<\/section>/,
    );
  });

  let relations: MockedObject<CandidateRelationsService>;
  let catalogService: CatalogService;
  let control: PanelControl;
  const toastService = { show: vi.fn() };
  const confirmDialogService = { confirm: vi.fn() };

  const renderPanel = (ui: (control: PanelControl) => React.ReactElement) => {
    const view = render(
      <ServicesProvider
        value={
          {
            ...services,
            candidateRelationsService: relations,
            catalogService,
            toastService,
            confirmDialogService,
            authService: { profile: signal(null), hasPermission: vi.fn(() => true) },
          } as unknown as Services
        }
      >
        {ui(control)}
      </ServicesProvider>,
    );
    return {
      ...view,
      rerenderWith: (next: PanelControl) =>
        view.rerender(
          <ServicesProvider
            value={
              {
                ...services,
                candidateRelationsService: relations,
                catalogService,
                toastService,
                confirmDialogService,
                authService: { profile: signal(null), hasPermission: vi.fn(() => true) },
              } as unknown as Services
            }
          >
            {ui(next)}
          </ServicesProvider>,
        ),
    };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    confirmDialogService.confirm.mockResolvedValue(true);
    catalogService = await loadedCatalogService();
    relations = {
      saveEducation: vi.fn().mockResolvedValue(undefined),
      saveExperience: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<CandidateRelationsService>;
    control = {
      editing: true,
      canEdit: true,
      onEdit: vi.fn(),
      onClose: vi.fn(),
      onDirtyChange: vi.fn(),
    };
  });

  /** KTL-46 follow-up: the entry form is hidden behind «Nueva …» until asked for. */
  const openNew = (panel: 'education' | 'experience') =>
    userEvent.click(screen.getByTestId(`${panel}-new`));

  describe('CandidateEducation', () => {
    const education = (c: PanelControl) => <CandidateEducation candidate={candidate} control={c} />;

    it('hides the entry form until «Nueva formación», and «Cancelar» hides it again', async () => {
      renderPanel(education);

      expect(screen.queryByRole('form', { name: 'Nueva formación' })).toBeNull();
      expect(screen.getByTestId('candidate-panel-education-done')).toBeInTheDocument();
      await openNew('education');
      expect(screen.getByRole('form', { name: 'Nueva formación' })).toBeInTheDocument();
      expect(screen.getByLabelText('Tipo')).toHaveFocus();

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('form', { name: 'Nueva formación' })).toBeNull();
      expect(screen.getByTestId('education-new')).toHaveFocus();
      expect(relations.saveEducation).not.toHaveBeenCalled();
    });

    it('refuses an invalid entry locally and keeps the typed values', async () => {
      renderPanel(education);
      await openNew('education');

      await userEvent.type(screen.getByLabelText('Centro'), 'UCM');
      await userEvent.click(screen.getByRole('button', { name: 'Añadir formación' }));

      expect(screen.getByText('El tipo de formación es obligatorio.')).toBeInTheDocument();
      expect(screen.getByLabelText('Centro')).toHaveValue('UCM');
      expect(relations.saveEducation).not.toHaveBeenCalled();
    });

    it('writes an added entry at once, with the whole list, and hides the form', async () => {
      renderPanel(education);
      await openNew('education');

      await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Grado');
      await userEvent.type(screen.getByLabelText('Titulación'), 'Máster en RRHH');
      expect(control.onDirtyChange).toHaveBeenLastCalledWith(true);
      await userEvent.type(screen.getByLabelText('Centro'), 'UCM');
      await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Finalizada');
      await userEvent.click(screen.getByRole('button', { name: 'Añadir formación' }));

      await waitFor(() =>
        expect(relations.saveEducation).toHaveBeenCalledWith('c1', [
          expect.objectContaining({ id: 'e1' }),
          expect.objectContaining({ degree: 'Máster en RRHH' }),
        ]),
      );
      expect(toastService.show).toHaveBeenCalledWith('Formación guardada.', 'success');
      expect(screen.queryByLabelText('Titulación')).toBeNull();
      expect(screen.getByTestId('education-new')).toHaveFocus();
      expect(control.onDirtyChange).toHaveBeenLastCalledWith(false);
      // The panel stays open for the next entry; its X closes it.
      expect(control.onClose).not.toHaveBeenCalled();
    });

    it('keeps the form as typed with the Spanish error when the write is refused', async () => {
      relations.saveEducation.mockRejectedValue(new Error('El candidato ha cambiado.'));
      renderPanel(education);
      await openNew('education');
      await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Grado');
      await userEvent.type(screen.getByLabelText('Titulación'), 'Máster en RRHH');
      await userEvent.type(screen.getByLabelText('Centro'), 'UCM');
      await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Finalizada');

      await userEvent.click(screen.getByRole('button', { name: 'Añadir formación' }));

      expect(await screen.findByText('El candidato ha cambiado.')).toBeInTheDocument();
      expect(screen.getByLabelText('Titulación')).toHaveValue('Máster en RRHH');
      expect(toastService.show).not.toHaveBeenCalled();
    });

    it('removes an entry only after confirming, and writes the list without it', async () => {
      renderPanel(education);
      confirmDialogService.confirm.mockResolvedValueOnce(false);

      await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
      expect(confirmDialogService.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Quitar formación', danger: true }),
      );
      expect(relations.saveEducation).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
      await waitFor(() => expect(relations.saveEducation).toHaveBeenCalledWith('c1', []));
    });

    it('drops what is typed when edit mode ends', async () => {
      const { rerenderWith } = renderPanel(education);
      await openNew('education');
      await userEvent.type(screen.getByLabelText('Titulación'), 'Máster');
      expect(control.onDirtyChange).toHaveBeenLastCalledWith(true);

      rerenderWith({ ...control, editing: false });
      rerenderWith({ ...control, editing: true });

      // Back to «Nueva formación», with nothing kept.
      expect(screen.queryByLabelText('Titulación')).toBeNull();
      await openNew('education');
      expect(screen.getByLabelText('Titulación')).toHaveValue('');
      expect(control.onDirtyChange).toHaveBeenLastCalledWith(false);
      expect(relations.saveEducation).not.toHaveBeenCalled();
    });

    it('edits an entry in place, keeping its id and its retired status value', async () => {
      renderPanel(education);

      await userEvent.click(
        screen.getByRole('button', { name: 'Editar la formación Grado en ADE' }),
      );

      expect(screen.getByRole('form', { name: 'Editar formación' })).toBeInTheDocument();
      expect(screen.getByLabelText('Tipo')).toHaveFocus();
      // «Finalizado» is not an active education status; the form still holds it.
      expect(screen.getByLabelText('Estado')).toHaveValue('Finalizado');
      await userEvent.clear(screen.getByLabelText('Centro'));
      await userEvent.type(screen.getByLabelText('Centro'), 'UAM');
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar formación' }));

      // «Actualizar» writes at once: there is no «Guardar» to revert it.
      await waitFor(() =>
        expect(relations.saveEducation).toHaveBeenCalledWith('c1', [
          expect.objectContaining({ id: 'e1', institution: 'UAM', status: 'Finalizado' }),
        ]),
      );
      expect(screen.queryByRole('form', { name: 'Editar formación' })).toBeNull();
      expect(screen.getByTestId('education-new')).toBeInTheDocument();
      expect(screen.queryByTestId('candidate-panel-education-save')).toBeNull();
    });

    it('sends nothing when an edit changes nothing, and can cancel an edit', async () => {
      renderPanel(education);
      const edit = screen.getByRole('button', { name: 'Editar la formación Grado en ADE' });

      await userEvent.click(edit);
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar formación' }));
      expect(relations.saveEducation).not.toHaveBeenCalled();
      expect(screen.queryByRole('form', { name: 'Editar formación' })).toBeNull();
      expect(control.onDirtyChange).toHaveBeenLastCalledWith(false);

      await userEvent.click(edit);
      await userEvent.type(screen.getByLabelText('Centro'), ' Madrid');
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }));

      expect(screen.queryByRole('form', { name: 'Editar formación' })).toBeNull();
      expect(screen.getByTestId('education-new')).toBeInTheDocument();
      expect(screen.getByText('UCM', { exact: false })).toBeInTheDocument();
      expect(control.onDirtyChange).toHaveBeenLastCalledWith(false);
      expect(relations.saveEducation).not.toHaveBeenCalled();
    });

    it('refuses an edit that blanks a required field and keeps the entry as it was', async () => {
      renderPanel(education);

      await userEvent.click(
        screen.getByRole('button', { name: 'Editar la formación Grado en ADE' }),
      );
      await userEvent.clear(screen.getByLabelText('Titulación'));
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar formación' }));

      expect(screen.getByText('La titulación es obligatoria.')).toBeInTheDocument();
      expect(screen.getByRole('form', { name: 'Editar formación' })).toBeInTheDocument();
      expect(
        within(screen.getByTestId('candidate-education')).getByText('Grado en ADE'),
      ).toBeVisible();
    });
  });

  describe('CandidateExperience', () => {
    /** The «Fecha inicio» or «Fecha fin» group: a month select and a year select. */
    const dateGroup = (legend: string) => screen.getByRole('group', { name: legend });
    const pick = async (legend: string, month: number, year: number): Promise<void> => {
      const group = within(dateGroup(legend));
      await userEvent.selectOptions(group.getByRole('combobox', { name: 'Mes' }), String(month));
      await userEvent.selectOptions(group.getByRole('combobox', { name: 'Año' }), String(year));
    };
    const shownDate = (legend: string) => {
      const group = within(dateGroup(legend));
      return [
        (group.getByRole('combobox', { name: 'Mes' }) as HTMLSelectElement).value,
        (group.getByRole('combobox', { name: 'Año' }) as HTMLSelectElement).value,
      ];
    };

    it('adds an entry without a sector (KTL-46 follow-up)', async () => {
      renderPanel((c) => <CandidateExperience candidate={candidate} control={c} />);
      await openNew('experience');

      const sector = screen.getByLabelText('Sector');
      expect(sector).not.toBeRequired();
      expect(sector).toHaveDisplayValue('Sin sector');
      await userEvent.type(screen.getByLabelText('Empresa'), 'Acme');
      await userEvent.type(screen.getByLabelText('Puesto'), 'Analista');
      await userEvent.click(screen.getByRole('button', { name: 'Añadir experiencia' }));

      await waitFor(() => expect(relations.saveExperience).toHaveBeenCalledTimes(1));
    });

    it('refuses a start date after the current month locally', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 5, 12));
      try {
        renderPanel((c) => <CandidateExperience candidate={candidate} control={c} />);
        await openNew('experience');

        // No later year is offered, but a later month of this year still is.
        const startYears = within(dateGroup('Fecha inicio')).getByRole('combobox', {
          name: 'Año',
        });
        expect(within(startYears).queryByRole('option', { name: '2027' })).toBeNull();
        await userEvent.type(screen.getByLabelText('Empresa'), 'Acme');
        await userEvent.type(screen.getByLabelText('Puesto'), 'Analista');
        await pick('Fecha inicio', 12, 2026);
        await userEvent.click(screen.getByRole('checkbox', { name: 'Puesto actual' }));
        await userEvent.click(screen.getByRole('button', { name: 'Añadir experiencia' }));

        expect(
          screen.getByText(
            'Las fechas de una experiencia no pueden ser posteriores al mes actual.',
          ),
        ).toBeInTheDocument();
        expect(relations.saveExperience).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('starts a row without dates at the left and names no missing sector', () => {
      control = { ...control, editing: false };
      const dated = {
        id: 'x7',
        company: 'Acme',
        position: 'Analista',
        sector: 'Servicios',
        startDate: '2020-01-01',
        endDate: '2020-12-01',
        isCurrent: false,
      };
      const undated = { id: 'x8', company: 'Beta', position: 'Becario', isCurrent: false };
      renderPanel((c) => (
        <CandidateExperience candidate={withEntries(dated, undated)} control={c} />
      ));

      expect(screen.getByTestId('experience-period')).toHaveTextContent('2020 (ene) – 2020 (dic)');
      const undatedRow = screen.getByText('Becario').closest('.item-main');
      expect(undatedRow?.firstElementChild).toHaveTextContent('Becario');
      expect(undatedRow).toHaveTextContent(/^Becario Beta$/);
    });

    it('refuses an end date before the start date locally', async () => {
      renderPanel((c) => <CandidateExperience candidate={candidate} control={c} />);
      await openNew('experience');

      await userEvent.type(screen.getByLabelText('Empresa'), 'Acme');
      await userEvent.type(screen.getByLabelText('Puesto'), 'Analista');
      await userEvent.selectOptions(screen.getByLabelText('Sector'), 'Servicios');
      await pick('Fecha inicio', 6, 2024);
      await pick('Fecha fin', 1, 2024);
      await userEvent.click(screen.getByRole('button', { name: 'Añadir experiencia' }));

      expect(
        screen.getByText('La fecha de fin no puede ser anterior a la fecha de inicio.'),
      ).toBeInTheDocument();
      expect(relations.saveExperience).not.toHaveBeenCalled();
    });

    it('edits an entry in place and keeps the fields the form does not show', async () => {
      renderPanel((c) => <CandidateExperience candidate={candidate} control={c} />);

      await userEvent.click(
        screen.getByRole('button', { name: 'Editar la experiencia Técnico en Kepler' }),
      );
      expect(screen.getByRole('form', { name: 'Editar experiencia' })).toBeInTheDocument();
      expect(screen.getByLabelText('Empresa')).toHaveFocus();
      expect(shownDate('Fecha inicio')).toEqual(['1', '2020']);
      expect(dateGroup('Fecha fin')).toBeDisabled();
      await userEvent.click(screen.getByRole('checkbox', { name: 'Puesto actual' }));
      await pick('Fecha fin', 6, 2024);
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar experiencia' }));

      // Written at once, without a panel «Guardar».
      await waitFor(() => expect(relations.saveExperience).toHaveBeenCalledTimes(1));
      expect(relations.saveExperience).toHaveBeenCalledWith('c1', [
        expect.objectContaining({
          id: 'x1',
          isCurrent: false,
          endDate: '2024-06-01',
          functions: 'Mantenimiento de líneas',
        }),
      ]);
    });

    it('lays out three columns: company, position, sector; dates and years; the description', async () => {
      renderPanel((c) => <CandidateExperience candidate={candidate} control={c} />);
      await openNew('experience');

      const cells = Array.from(
        screen.getByTestId('experience-add-form').querySelectorAll('.grid.three > .field'),
      );
      expect(
        cells.map((cell) =>
          cell.querySelector('input, select, [contenteditable]')?.getAttribute('name'),
        ),
      ).toEqual([
        'company',
        'position',
        'sector',
        'startDateMonth',
        'endDateMonth',
        'yearsExperience',
        'functions',
      ]);
      // Dates are a month and a year, with no day.
      expect(cells[3].querySelector('select[name="startDateYear"]')).not.toBeNull();
      expect(
        screen.getByTestId('experience-add-form').querySelector('input[type="date"]'),
      ).toBeNull();
      // «Puesto actual» sits under the end date it disables; the description spans the row.
      expect(cells[4].querySelector('input[name="isCurrent"]')).not.toBeNull();
      expect(cells[6]).toHaveClass('span-all');
    });

    const withEntries = (...experience: Candidate['experience']): Candidate => ({
      ...candidate,
      experience,
    });

    it('clears and disables the end date while «Puesto actual» is ticked', async () => {
      renderPanel((c) => <CandidateExperience candidate={withEntries()} control={c} />);
      await openNew('experience');

      await pick('Fecha fin', 6, 2024);
      await userEvent.click(screen.getByRole('checkbox', { name: 'Puesto actual' }));
      expect(dateGroup('Fecha fin')).toBeDisabled();
      expect(shownDate('Fecha fin')).toEqual(['', '']);

      await userEvent.click(screen.getByRole('checkbox', { name: 'Puesto actual' }));
      expect(dateGroup('Fecha fin')).toBeEnabled();
      expect(shownDate('Fecha fin')).toEqual(['', '']);
    });

    it('works the years out from both dates, read-only, and takes them by hand otherwise', async () => {
      renderPanel((c) => <CandidateExperience candidate={withEntries()} control={c} />);
      await openNew('experience');
      const years = () => screen.getByLabelText('Años de experiencia');

      expect(years()).toHaveAttribute('type', 'number');
      expect(years()).toHaveAttribute('step', '0.1');
      await userEvent.type(years(), '3.5');
      expect(years()).toHaveValue(3.5);

      await pick('Fecha inicio', 3, 2019);
      // Only a month chosen: not a date yet, so the years stay typed by hand.
      await userEvent.selectOptions(
        within(dateGroup('Fecha fin')).getByRole('combobox', { name: 'Mes' }),
        '6',
      );
      expect(years()).toHaveValue(3.5);
      await userEvent.selectOptions(
        within(dateGroup('Fecha fin')).getByRole('combobox', { name: 'Año' }),
        '2024',
      );

      // March 2019 to June 2024, both months included: 64 months.
      expect(years()).toHaveAttribute('readonly');
      expect(years()).toHaveValue('5,3');
      expect(years()).toHaveAccessibleDescription('Calculado a partir de las fechas');
    });

    it('shows a stored day as its month and year, and saves it back unchanged', async () => {
      const stored = {
        id: 'x7',
        company: 'Acme',
        position: 'Analista',
        sector: 'Servicios',
        startDate: '2019-03-15',
        endDate: '2024-06-30',
        isCurrent: false,
      };
      renderPanel((c) => <CandidateExperience candidate={withEntries(stored)} control={c} />);

      await userEvent.click(
        screen.getByRole('button', { name: 'Editar la experiencia Analista en Acme' }),
      );
      expect(shownDate('Fecha inicio')).toEqual(['3', '2019']);
      expect(shownDate('Fecha fin')).toEqual(['6', '2024']);
      await userEvent.type(screen.getByLabelText('Empresa'), ' SL');
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar experiencia' }));

      await waitFor(() =>
        expect(relations.saveExperience).toHaveBeenCalledWith('c1', [
          expect.objectContaining({
            company: 'Acme SL',
            startDate: '2019-03-15',
            endDate: '2024-06-30',
          }),
        ]),
      );
    });

    it('never shows typed years that the dates contradict', async () => {
      renderPanel((c) => <CandidateExperience candidate={withEntries()} control={c} />);
      await openNew('experience');

      // Reported: 6 years typed first, then a one-year range.
      await userEvent.type(screen.getByLabelText('Empresa'), 'Acme');
      await userEvent.type(screen.getByLabelText('Puesto'), 'Analista');
      await userEvent.selectOptions(screen.getByLabelText('Sector'), 'Servicios');
      await userEvent.type(screen.getByLabelText('Años de experiencia'), '6');
      await pick('Fecha inicio', 1, 2023);
      await pick('Fecha fin', 12, 2023);

      expect(screen.getByLabelText('Años de experiencia')).toHaveAttribute('readonly');
      // A whole number shows no decimal part.
      expect(screen.getByLabelText('Años de experiencia')).toHaveValue('1');
      await userEvent.click(screen.getByRole('button', { name: 'Añadir experiencia' }));
      await waitFor(() => expect(relations.saveExperience).toHaveBeenCalledTimes(1));
    });

    it('shows a row’s years from its dates even when it holds a contradicting value', () => {
      const contradicting = {
        id: 'x8',
        company: 'Acme',
        position: 'Analista',
        sector: 'Servicios',
        startDate: '2023-01-01',
        endDate: '2023-12-01',
        yearsExperience: 6,
        isCurrent: false,
      };
      renderPanel((c) => (
        <CandidateExperience candidate={withEntries(contradicting)} control={c} />
      ));

      const section = within(screen.getByTestId('candidate-experience'));
      expect(section.getByText(/· 1 año$/)).toBeInTheDocument();
      expect(section.queryByText(/6 años/)).toBeNull();
    });

    it('stages a formatted description with the entry', async () => {
      renderPanel((c) => <CandidateExperience candidate={withEntries()} control={c} />);
      await openNew('experience');

      expect(screen.getByRole('textbox', { name: 'Descripción' })).toHaveAttribute(
        'name',
        'functions',
      );
      expect(screen.getByRole('button', { name: 'Negrita' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Subrayado' })).toBeNull();
    });

    it('loads the description on «Editar» and stays clean when nothing changes', async () => {
      const entry = {
        id: 'x2',
        company: 'Acme',
        position: 'Jefa de obra',
        sector: 'Construcción',
        startDate: '2019-03-01',
        endDate: '2024-06-30',
        yearsExperience: 4,
        isCurrent: false,
        functions: '<p><strong>Coordinación</strong> de equipos</p>',
      };
      renderPanel((c) => <CandidateExperience candidate={withEntries(entry)} control={c} />);

      await userEvent.click(
        screen.getByRole('button', { name: 'Editar la experiencia Jefa de obra en Acme' }),
      );
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Descripción' })).toHaveTextContent(
          'Coordinación de equipos',
        ),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar experiencia' }));

      expect(control.onDirtyChange).toHaveBeenLastCalledWith(false);
      expect(relations.saveExperience).not.toHaveBeenCalled();
    });

    it('refuses a description longer than the API accepts', async () => {
      const entry = {
        id: 'x3',
        company: 'Acme',
        position: 'Analista',
        sector: 'Servicios',
        isCurrent: false,
        functions: `<p>${'x'.repeat(20_001)}</p>`,
      };
      renderPanel((c) => <CandidateExperience candidate={withEntries(entry)} control={c} />);

      await userEvent.click(
        screen.getByRole('button', { name: 'Editar la experiencia Analista en Acme' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar experiencia' }));

      expect(
        screen.getByText('La descripción no puede superar los 20.000 caracteres.'),
      ).toBeInTheDocument();
    });

    describe('read-only accordion', () => {
      const described = {
        id: 'x4',
        company: 'Acme',
        position: 'Analista',
        sector: 'Servicios',
        isCurrent: false,
        functions: '<p><strong>Análisis</strong> de datos</p><ul><li>Informes</li></ul>',
      };
      const plain = {
        id: 'x5',
        company: 'Beta',
        position: 'Becario',
        sector: 'Servicios',
        isCurrent: false,
      };

      it('expands and collapses a description from its summary', async () => {
        control = { ...control, editing: false };
        renderPanel((c) => (
          <CandidateExperience candidate={withEntries(described, plain)} control={c} />
        ));

        const toggles = screen.getAllByTestId('experience-toggle');
        expect(toggles).toHaveLength(1);
        const toggle = toggles[0];
        // The arrow leads the summary; the row without one keeps a spacer in its place.
        expect(toggle.firstElementChild).toHaveClass('item-toggle__chevron');
        expect(screen.getByText('Becario').closest('.item-main')?.firstElementChild).toHaveClass(
          'item-toggle__spacer',
        );
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('experience-description')).toBeNull();

        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const region = screen.getByTestId('experience-description');
        expect(toggle).toHaveAttribute('aria-controls', region.id);
        expect(within(region).getByText('Análisis').tagName).toBe('STRONG');
        expect(within(region).getByRole('listitem')).toHaveTextContent('Informes');

        toggle.focus();
        await userEvent.keyboard('{Enter}');
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await userEvent.keyboard(' ');
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
      });

      it('shows an entry without a description as a plain row', () => {
        control = { ...control, editing: false };
        renderPanel((c) => <CandidateExperience candidate={withEntries(plain)} control={c} />);

        expect(screen.queryByTestId('experience-toggle')).toBeNull();
        expect(screen.getByText('Becario')).toBeInTheDocument();
      });

      it('collapses every row again after an edit', async () => {
        control = { ...control, editing: false };
        const { rerenderWith } = renderPanel((c) => (
          <CandidateExperience candidate={withEntries(described)} control={c} />
        ));
        await userEvent.click(screen.getByTestId('experience-toggle'));

        rerenderWith({ ...control, editing: true });
        rerenderWith({ ...control, editing: false });

        expect(screen.getByTestId('experience-toggle')).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('shows a current role’s years worked out to today in the row', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 4, 12));
      try {
        control = { ...control, editing: false };
        const current = {
          id: 'x6',
          company: 'Acme',
          position: 'Directora',
          sector: 'Servicios',
          // December 2024 to November 2026, both included: 24 months.
          startDate: '2024-12-01',
          yearsExperience: 1.5,
          isCurrent: true,
        };
        renderPanel((c) => <CandidateExperience candidate={withEntries(current)} control={c} />);

        expect(screen.getByText(/2 años/)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe.each([
    {
      name: 'CandidateEducation',
      testId: 'candidate-education',
      text: 'Grado en ADE',
      ui: (c: PanelControl) => <CandidateEducation candidate={candidate} control={c} />,
    },
    {
      name: 'CandidateExperience',
      testId: 'candidate-experience',
      text: 'Kepler',
      ui: (c: PanelControl) => <CandidateExperience candidate={candidate} control={c} />,
    },
  ])('$name read-only mode', ({ testId, text, ui }) => {
    it('shows the entries and no editing control outside edit mode', () => {
      control = { ...control, editing: false };
      renderPanel(ui);

      const section = within(screen.getByTestId(testId));
      expect(section.getByText(text, { exact: false })).toBeInTheDocument();
      // KTL-46: the only button left is the disclosure that shows an experience's description.
      expect(
        section
          .queryAllByRole('button')
          .filter((button) => button.getAttribute('data-testid') !== 'experience-toggle'),
      ).toHaveLength(0);
      expect(section.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('leads each row with its years', () => {
      renderPanel(ui);

      const period = within(screen.getByTestId(testId)).getByTestId(/-period$/);
      expect(period).toHaveTextContent(
        testId === 'candidate-education' ? '2020' : '2020 (ene) – actualidad',
      );
      expect(period.parentElement?.firstElementChild).toBe(period);
    });

    it('offers editing controls in edit mode', () => {
      renderPanel(ui);

      expect(within(screen.getByTestId(testId)).getAllByRole('button').length).toBeGreaterThan(0);
    });
  });
});
