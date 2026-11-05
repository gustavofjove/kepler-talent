import { AuditService } from '../../features/admin/audit/audit.service';
import { ImportService } from '../../features/admin/import/import.service';
import { RoleService } from '../../features/admin/roles/role.service';
import { ProfileService } from '../../features/admin/users/profile.service';
import { CandidateRelationsService } from '../../features/candidates/services/candidate-relations.service';
import { CandidateApi } from '../../features/candidates/services/candidate.api';
import { CandidateDraftService } from '../../features/candidates/services/candidate-draft.service';
import { CandidateService } from '../../features/candidates/services/candidate.service';
import { CandidateNotesService } from '../../features/candidates/services/candidate-notes.service';
import { CatalogApi } from '../../features/catalogs/services/catalog.api';
import { CatalogService } from '../../features/catalogs/services/catalog.service';
import { DocumentService } from '../../features/documents/services/document.service';
import { CandidateSearchService } from '../../features/search/services/candidate-search.service';
import { ExportService } from '../../features/search/services/export.service';
import { SearchPresetsService } from '../../features/search/services/search-presets.service';
import { PositionService } from '../../features/positions/position.service';
import { AuthService } from '../auth/auth.service';
import { DataRouterNavigator } from '../routing/navigator';
import { ObservabilityService } from '../services/observability.service';
import { ToastService } from '../services/toast.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog.service';
import { ApiTransport } from '../http/api-transport';
import { readAppConfig } from '../services/app-config.model';
import { createTokenSource } from '../auth/token-source';
import { UnsavedChangesRegistry } from '../state/unsaved-changes';

/**
 * Composition root - replaces Angular's `providedIn: 'root'` injector.
 *
 * The graph is acyclic and shallow: CandidateService is the root of the feature
 * graph, while the token source and API transport form the authentication boundary.
 */

export const appNavigator = new DataRouterNavigator();

const appConfig = readAppConfig();
const tokenSource = createTokenSource(appConfig);
const authServiceRef: { current: AuthService | null } = { current: null };
const apiTransport = new ApiTransport(
  appConfig.API_BASE_URL,
  () => tokenSource.getToken(),
  () => authServiceRef.current?.handleUnauthorized(),
);
const unsavedChanges = new UnsavedChangesRegistry();
const authService = new AuthService(tokenSource, apiTransport, appNavigator, unsavedChanges);
authServiceRef.current = authService;
const roleService = new RoleService(apiTransport);
const profileService = new ProfileService(apiTransport);
const candidateApi = new CandidateApi(apiTransport);
const candidateService = new CandidateService(candidateApi);

export const services = {
  appNavigator,
  authService,
  unsavedChanges,
  toastService: new ToastService(),
  observabilityService: new ObservabilityService(),
  confirmDialogService: new ConfirmDialogService(),
  candidateService,
  candidateNotesService: new CandidateNotesService(candidateApi),
  candidateDraftService: new CandidateDraftService(apiTransport),
  catalogService: new CatalogService(new CatalogApi(apiTransport)),
  candidateRelationsService: new CandidateRelationsService(candidateService),
  documentService: new DocumentService(candidateService, apiTransport),
  // Search and saved searches reach the API directly. Neither depends on CandidateService
  // any more: the browser no longer holds a candidate collection to filter.
  candidateSearchService: new CandidateSearchService(apiTransport),
  searchPresetsService: new SearchPresetsService(apiTransport),
  exportService: new ExportService(),
  importService: new ImportService(apiTransport),
  auditService: new AuditService(apiTransport),
  positionService: new PositionService(apiTransport),
  roleService,
  profileService,
  apiTransport,
};

export type Services = typeof services;
