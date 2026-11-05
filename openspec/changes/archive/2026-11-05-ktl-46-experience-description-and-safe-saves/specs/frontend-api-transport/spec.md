## MODIFIED Requirements

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
