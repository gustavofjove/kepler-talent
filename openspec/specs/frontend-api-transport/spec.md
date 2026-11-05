# Frontend API Transport Specification

## Purpose

Defines one consistent frontend boundary for API requests, problem responses, correlation,
cancellation, and controlled downloads while preserving Kepler Talento's established
React service and test-substitution conventions.

## Requirements

### Requirement: Shared API request behavior

All frontend service calls introduced for the new backend SHALL use one shared transport
behavior for API base URL resolution, JSON handling, timeouts, and correlation headers.

That shared transport SHALL attach the current bearer token to every API request, obtained from a
single session source rather than from each calling service. A request made while no session is
held SHALL be refused locally as unauthenticated rather than sent without credentials.

A response refusing a request as unauthenticated SHALL be reported to the session owner rather than
surfacing as a generic failure that leaves a signed-out user looking at a broken screen. When the
page holds no unsaved changes, the local session SHALL be cleared and the user returned to sign-in.
When the page holds unsaved changes, the user SHALL stay on the page, the failed call SHALL fail as
unauthenticated to its caller, and signing in again SHALL be offered without leaving the page. The
bearer token SHALL NOT be written to logs or to browser storage that outlives the session.

#### Scenario: Reference service sends a request

- **WHEN** the reference candidate service calls the backend
- **THEN** the request uses the configured API base URL and shared transport behavior

#### Scenario: Authenticated request carries the token

- **WHEN** any feature service calls the API while a session is held
- **THEN** the request carries the current bearer token, attached by the shared transport

#### Scenario: Request is made with no session

- **WHEN** a feature service calls the API while no session is held
- **THEN** the call fails as unauthenticated without sending a credential-less request to the API

#### Scenario: API refuses the request as unauthenticated

- **WHEN** the API answers a request with the unauthenticated status and the page holds no unsaved
  changes
- **THEN** the local session is cleared and the user is returned to sign-in

#### Scenario: API refuses the request while changes are unsaved

- **WHEN** the API answers a request with the unauthenticated status while the page holds unsaved
  changes
- **THEN** the user stays on the page, the call fails as unauthenticated to its caller, and signing
  in again is offered on the page

### Requirement: Problem-details translation

The frontend transport SHALL translate documented API problem responses into the
application's stable error model while preserving the backend error code, user-facing
Spanish message, and correlation identifier.

#### Scenario: Reference request returns validation problem

- **WHEN** the backend returns a documented validation problem
- **THEN** the feature service receives the stable error code, Spanish message, field
  errors, and correlation identifier without parsing ad hoc response shapes

#### Scenario: Response is not a documented problem

- **WHEN** an unsuccessful response is malformed or has an unexpected content type
- **THEN** the transport returns a safe generic error with the available correlation
  identifier and does not expose raw server content to the UI

### Requirement: Request cancellation and timeout

Frontend API calls SHALL support caller cancellation and a documented finite timeout
without automatically retrying unsafe operations.

#### Scenario: Component abandons a request

- **WHEN** the caller cancels an in-flight reference request
- **THEN** the request is aborted and no stale successful/error state is applied to the
  abandoned consumer

#### Scenario: Request exceeds timeout

- **WHEN** the backend does not respond within the configured timeout
- **THEN** the caller receives a stable timeout error and a non-idempotent request is not
  retried automatically

### Requirement: Controlled download filename

The frontend transport SHALL download files only from the API and SHALL derive the user
filename from a valid safe `Content-Disposition` value or a safe application fallback.

#### Scenario: API returns a valid filename

- **WHEN** a permitted download response includes a valid safe filename
- **THEN** the browser download uses that filename without exposing the backend URL or
  storage key

#### Scenario: API returns an unsafe filename

- **WHEN** the response filename contains path separators, control characters, or other
  unsafe content
- **THEN** the transport replaces it with a safe application-generated filename

### Requirement: Service boundary preservation

Components SHALL consume backend capabilities through test-substitutable feature
services rather than issuing direct network calls.

#### Scenario: Reference UI integration is tested

- **WHEN** the reference React integration is rendered under the service provider used by
  tests
- **THEN** a test double can replace the API-backed feature service without real network
  access

### Requirement: Incremental persistence cutover

Each delivered backend slice SHALL cut its own frontend feature service over to the API within
the same change, rather than deferring frontend integration to a single terminal cutover.
Feature data paths whose backend slice has not yet been delivered SHALL retain their existing
behavior until their own migration change.

#### Scenario: Foundation is deployed in development

- **WHEN** the KTL-5 frontend changes are enabled
- **THEN** the reference integration uses the API while unrelated candidate, catalog, search,
  admin, import, and export services retain their existing behavior

#### Scenario: Catalog slice is deployed

- **WHEN** the catalog backend slice is enabled
- **THEN** the catalog feature service reaches the API, no catalog data is read from or written
  to browser storage, and candidate, search, admin, import, and export services retain their
  existing behavior

#### Scenario: Candidate slice is deployed

- **WHEN** the candidate backend slice is enabled
- **THEN** the candidate feature service and the candidate relation and document services reach
  the API, no candidate data is read from or written to browser storage, and search, admin,
  import, and export services retain their existing behavior

#### Scenario: Identity slice is deployed

- **WHEN** the identity and access-control slice is enabled
- **THEN** the authentication, user and role services reach the API, no profile, user or role data
  is read from or written to browser storage, and the import service retains its existing behavior
  until its own migration change

#### Scenario: Import slice is deployed

- **WHEN** the candidate import slice is enabled
- **THEN** the import feature service reaches the API, no batch record, row outcome or imported
  candidate data is read from or written to browser storage, and no feature service retains a
  browser-storage data path

#### Scenario: Slice ships without a consumer

- **WHEN** a change delivers backend endpoints for a feature whose frontend service still uses
  its legacy data path
- **THEN** the change is incomplete, because a delivered slice must demonstrate its own
  frontend integration

### Requirement: Asynchronous feature data loading

A frontend feature service backed by the API SHALL expose the loading, loaded, and failed
states of its data to consuming components, so that a component never renders a partially
loaded collection as though it were complete.

#### Scenario: Data is loading

- **WHEN** a component renders while its feature service is still loading API-backed data
- **THEN** the component communicates the loading state and does not present an empty
  collection as a complete result

#### Scenario: Data fails to load

- **WHEN** the API-backed load fails
- **THEN** the component presents the failure with the Spanish message from the application
  error model and offers no stale or fabricated data

#### Scenario: Data is reloaded after a change

- **WHEN** a component submits a change through an API-backed feature service and the change
  succeeds
- **THEN** the data the component presents afterwards reflects the stored server state

### Requirement: Same-origin browser evidence

The frontend and API foundation SHALL be validated through a browser flow using the
configured same-origin `/api` route.

#### Scenario: Browser exercises reference integration

- **WHEN** the targeted end-to-end smoke flow runs through Nginx
- **THEN** the SPA reaches the reference API and renders/observes the expected result
  without permissive CORS configuration

### Requirement: Eviction of superseded browser storage

When a feature's data moves from browser storage to the API, the delivering change SHALL
actively remove the superseded browser storage entry on application startup, not merely stop
reading and writing it. Removal SHALL be attempted regardless of whether the API is reachable,
and SHALL NOT prevent the application from starting if storage is unavailable.

An entry that carried a user's identity, role or permission set SHALL be treated the same way as one
that carried candidate data: leaving it behind would let a stale local copy decide what the
application renders after the authority for that decision has moved to the API.

An entry whose contents describe work the application never actually performed SHALL be removed
rather than migrated. Carrying such a record forward would give a fabricated history the appearance
of a real one.

#### Scenario: Browser holds a superseded entry

- **WHEN** the new build starts in a browser that still holds the superseded storage entry
- **THEN** the entry is removed from that browser without requiring a user action

#### Scenario: Entry holds personal data

- **WHEN** the superseded entry held candidate personal data
- **THEN** after first run of the new build no candidate personal data remains in browser
  storage, and none is written back by any later interaction

#### Scenario: Entry holds identity or authorization data

- **WHEN** the superseded entry held a signed-in profile, a user list or a role and permission
  definition
- **THEN** after first run of the new build none of it remains in browser storage, and the
  application's rendering decisions come from the caller profile endpoint instead

#### Scenario: Entry describes work that never happened

- **WHEN** the superseded entry held import batch records describing candidates that were never
  created
- **THEN** the entry is removed rather than migrated to the server, and the server's batch history
  begins empty

#### Scenario: Backend is unreachable at startup

- **WHEN** the new build starts and the API cannot be reached
- **THEN** the superseded entry is still removed, and the application reports the API failure
  rather than falling back to the removed data

#### Scenario: Storage access fails

- **WHEN** browser storage cannot be read or written at startup
- **THEN** the application starts and continues to operate against the API

### Requirement: Feature service cache for synchronous consumers

A feature service backed by the API MAY expose a synchronous read of data it has already
loaded, so that existing consumers need not be rewritten around promises. Such a read SHALL
return only data the API has supplied — never seeded, fabricated, or browser-persisted data —
and the service SHALL expose its load state so that a consumer can distinguish "not loaded yet"
from "no such record".

Such a cache SHALL be scoped to the records a screen actually needs. A feature service SHALL NOT
load a whole table, and SHALL NOT pre-load the full aggregate of every record in a list in order to
serve a later detail view. A detail view SHALL load the one record it opens.

A cache SHALL NOT be the means by which a screen filters, sorts or pages. Those SHALL be requested
from the API, so that what the user sees reflects the whole matching set and not merely the subset
the browser happens to hold.

#### Scenario: Consumer reads a loaded record synchronously

- **WHEN** a consumer synchronously reads a record the service has already loaded from the API
- **THEN** it receives the loaded record without issuing a new request

#### Scenario: Consumer reads a record that is not loaded

- **WHEN** a consumer synchronously reads a record the service has not loaded
- **THEN** it receives no record, and the exposed load state distinguishes an incomplete load
  from a confirmed absence

#### Scenario: Cached record is changed

- **WHEN** a change to a record succeeds through the service
- **THEN** subsequent synchronous reads reflect the stored server state rather than a locally
  applied guess

#### Scenario: Cache survives no longer than the session

- **WHEN** the application is reloaded
- **THEN** the service holds no records until it loads them from the API again

#### Scenario: List screen is opened

- **WHEN** a list screen loads
- **THEN** the service requests one page of the minimal list projection, and does not load the
  aggregate of every listed record

#### Scenario: Detail screen is opened from a list

- **WHEN** a user opens one record from a list
- **THEN** that record's aggregate is loaded on demand, and no other record's aggregate is loaded
  with it

#### Scenario: User sorts or filters a list

- **WHEN** a user changes a list's sort or filter
- **THEN** the service requests the corresponding page from the API, rather than reordering or
  filtering data it already holds

### Requirement: File content transmission

The shared transport SHALL send a selected file's content to the API as a multipart request
without setting a media type of its own, so that the browser supplies the multipart boundary.
File content SHALL NOT be transformed, truncated, or re-encoded before transmission, and no
feature service SHALL report an upload as succeeding without having transmitted the content.

#### Scenario: File is uploaded

- **WHEN** a feature service uploads a selected file
- **THEN** the request carries the file's bytes as multipart form data, the transport sets no
  media type for that body, and the correlation identifier is present as on any other request

#### Scenario: Content is discarded

- **WHEN** a feature service builds an upload from a file's name, type and size without
  transmitting its bytes
- **THEN** the change is incomplete, because a stored document must contain the uploaded content

#### Scenario: Upload is refused by the API

- **WHEN** the API refuses an upload for size, format, or authorization
- **THEN** the refusal is surfaced as a Spanish message derived from the problem response, and
  the interface shows no stored document

#### Scenario: Upload is cancelled or times out

- **WHEN** an upload is cancelled by the user or exceeds its timeout
- **THEN** the request is aborted, the interface reports it as not completed, and no document is
  shown as stored

### Requirement: Deferred availability in the interface

When the API accepts work whose result is not immediately available, the interface SHALL present
the intermediate state to the user in Spanish rather than reporting completion. It SHALL observe
the server's state until it settles, SHALL show the settled outcome — available, by offering the
document's download without a pending or refused label, or refused with a non-technical reason —
and SHALL stop observing when the user leaves the view.

#### Scenario: Accepted upload is not yet available

- **WHEN** the API accepts a document upload that is awaiting a scan result
- **THEN** the interface shows the document in an "en análisis" state, does not offer a download,
  and does not report the upload as finished

#### Scenario: Work settles as available

- **WHEN** the observed document becomes available
- **THEN** the interface removes its "en análisis" state, shows no state label for it, and offers
  a download to holders of the download permission, without requiring the user to reload the page

#### Scenario: Work settles as refused

- **WHEN** the observed document is refused
- **THEN** the interface shows a Spanish explanation of the refusal, keeps the document visible
  in its refused state, and offers no download

#### Scenario: User leaves the view while work is pending

- **WHEN** the user navigates away while a document is still pending
- **THEN** the interface stops observing it and issues no further requests for it

#### Scenario: Observation cannot reach the API

- **WHEN** the API becomes unreachable while a document is being observed
- **THEN** the interface reports the failure to observe rather than assuming either outcome, and
  never shows a pending document as available
