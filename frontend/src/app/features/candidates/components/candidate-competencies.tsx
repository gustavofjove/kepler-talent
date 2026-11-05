import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionRetry } from '../../../core/auth/use-session-retry';
import { useServices } from '../../../core/di/services-context';
import { errorText } from '../../../core/i18n/translatable-error';
import { FormError } from '../../../shared/components/form-error';
import { CatalogFamilyRows } from '../../catalogs/components/catalog-family-rows';
import { CATALOG_FAMILY_ORDER } from '../../catalogs/components/catalog-family-rows.logic';
import type { PickerItem } from '../../catalogs/components/catalog-value-picker.logic';
import { CatalogStatusNotice } from '../../catalogs/components/catalog-status';
import { useCatalogStatus } from '../../catalogs/components/use-catalog-status';
import { useCatalogs } from '../../catalogs/use-catalogs';
import type { Candidate } from '../models/candidate.models';
import { useCandidates } from '../use-candidates';
import {
  changedFamilies,
  familiesWithoutLevels,
  savedFamilies,
  type FamilyItems,
} from './candidate-competencies.logic';
import { CandidatePanel } from './candidate-panel';
import type { PanelControl } from './candidate-panel.logic';
import { CandidateRelationSection } from './candidate-relation-section';
import { RELATION_DEFINITIONS, type RelationKind } from './candidate-relation-section.logic';
import { usePanelDraft } from './use-panel-draft';

interface Props {
  candidate: Candidate;
  control: PanelControl;
}

/**
 * Skills, languages, programs and tags of a candidate in one panel, on the family rows every
 * search and preset host uses too (KTL-27). In edit mode the four families form one draft;
 * «Guardar» writes only the families that changed, one after another, since each write
 * carries the aggregate version the previous one returned (KTL-29 design D4). A family the
 * API refuses keeps its draft and error, and a further «Guardar» retries only it.
 */
export function CandidateCompetencies({ candidate, control }: Props) {
  const { t } = useTranslation();
  const { candidateRelationsService, toastService } = useServices();
  const session = useSessionRetry();
  const candidateService = useCandidates();
  const catalogs = useCatalogs();
  const catalogStatus = useCatalogStatus();
  const saved = useMemo(() => savedFamilies(candidate), [candidate]);
  const draft = usePanelDraft<FamilyItems>(saved, control.editing, control.onDirtyChange);
  const [errors, setErrors] = useState<Partial<Record<RelationKind, string>>>({});
  const [saving, setSaving] = useState(false);

  const withoutLevels = catalogStatus.message
    ? []
    : familiesWithoutLevels(CATALOG_FAMILY_ORDER, (family) => catalogs.activeNames(family));
  const message =
    catalogStatus.message ??
    (withoutLevels
      .map((kind) =>
        t('candidate.profile.competencies.noLevels', {
          family: t(RELATION_DEFINITIONS[kind].titleKey),
        }),
      )
      .join(' ') ||
      null);

  const setError = (kind: RelationKind, error?: string): void =>
    setErrors((current) => {
      const { [kind]: _cleared, ...rest } = current;
      return error ? { ...rest, [kind]: error } : rest;
    });

  const change = (kind: RelationKind, items: PickerItem[], changed: PickerItem): void => {
    try {
      RELATION_DEFINITIONS[kind].validate(candidate, items, changed);
    } catch (err) {
      setError(kind, errorText(err, t));
      return;
    }
    setError(kind);
    draft.set({ ...draft.value, [kind]: items });
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    const pending = { ...draft.value };
    const failures: Partial<Record<RelationKind, string>> = {};
    let sessionEnded = false;
    for (const kind of changedFamilies(CATALOG_FAMILY_ORDER, saved, draft.value)) {
      // Each family maps its draft against the aggregate as it stands now, after the
      // families saved before it in this loop.
      const current = candidateService.find(candidate.id) ?? candidate;
      try {
        await RELATION_DEFINITIONS[kind].save(candidateRelationsService, current, pending[kind]);
        const absorbed = candidateService.find(candidate.id) ?? current;
        pending[kind] = RELATION_DEFINITIONS[kind].items(absorbed);
      } catch (err) {
        // KTL-46: the rest would be refused too. Keep them all; signing in again retries
        // the save, which writes only the families still changed.
        if (session.handle(err, save)) {
          sessionEnded = true;
          break;
        }
        failures[kind] = errorText(err, t);
      }
    }
    setSaving(false);
    setErrors(failures);
    if (sessionEnded || Object.keys(failures).length) {
      // Saved families now match the aggregate, so only the refused ones stay changed.
      draft.set(pending);
      return;
    }
    toastService.show(t('candidate.panel.saved.competencies'), 'success');
    control.onClose();
  };

  const cancel = (): void => {
    draft.reset();
    setErrors({});
  };

  return (
    <CandidatePanel
      id="competencies"
      title={t('candidate.profile.competencies.title')}
      control={control}
      mode="form"
      onSave={() => void save()}
      onCancel={cancel}
      saving={saving}
      saveDisabled={Boolean(catalogStatus.message)}
      testId="candidate-competencies"
      session={session}
    >
      <CatalogFamilyRows
        notice={
          control.editing ? (
            <CatalogStatusNotice status={{ ...catalogStatus, message }} />
          ) : undefined
        }
        renderRow={(kind) => (
          <>
            <CandidateRelationSection
              kind={kind}
              items={draft.value[kind]}
              editing={control.editing}
              onItemsChange={(items, changed) => change(kind, items, changed)}
            />
            {/* Stays beside its own family row: it names a value in that row, not the form. */}
            <FormError
              message={control.editing ? errors[kind] : null}
              testId={`${RELATION_DEFINITIONS[kind].idPrefix}-error`}
            />
          </>
        )}
      />
    </CandidatePanel>
  );
}
