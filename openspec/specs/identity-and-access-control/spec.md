# Identity And Access Control Specification

## Purpose

Establishes who is calling the system and what they are allowed to do: how a request is
authenticated against the corporate identity provider, how users and roles are stored and governed,
how a caller's effective permissions are resolved on every request, and what the single permission
vocabulary is that both the API and the browser use.

## Requirements

### Requirement: Token-based caller authentication

Every request to a business endpoint SHALL be authenticated from a bearer token. The token SHALL be
issued either by the configured OpenID Connect identity provider or, when local accounts are
enabled, by the application's own local-account issuer. Outside production, it MAY also be issued by
the development issuer. The system SHALL validate the token's signature against the issuer's
signing keys, its issuer, its audience and its validity window before the request reaches any
endpoint. A request whose token is absent, malformed, expired, signed by an unknown key, or issued
for another audience or issuer SHALL be refused as unauthenticated, and the refusal SHALL disclose
nothing beyond the unauthenticated status.

Each enabled issuer SHALL have its own issuer name and its own signing key. A token SHALL validate
only against the key of the issuer it names.

The caller's stable identity SHALL be taken from a configured subject claim that is stable for the
same person across sessions and applications. The system SHALL NOT derive any part of a caller's
identity or permissions from a request header, query parameter or body field.

The system SHALL tolerate the provider rotating its signing keys while running, by refreshing the
published key material without a restart.

#### Scenario: Request arrives without a token

- **WHEN** a caller invokes a business endpoint with no bearer token
- **THEN** the request is refused as unauthenticated before validation runs, and no business data is
  returned

#### Scenario: Token has expired

- **WHEN** a caller presents a token whose validity window has passed
- **THEN** the request is refused as unauthenticated

#### Scenario: Token signature does not verify

- **WHEN** a caller presents a token signed by a key the provider does not publish
- **THEN** the request is refused as unauthenticated and the token is not trusted for any claim

#### Scenario: Token was issued for another audience

- **WHEN** a caller presents a validly signed token whose audience or issuer is not the configured
  one
- **THEN** the request is refused as unauthenticated

#### Scenario: Caller identity is claimed in the request body

- **WHEN** a request body, header or query parameter names a user, role or permission set for the
  caller
- **THEN** it is ignored, and the caller's identity and permissions come only from the validated
  token and the stored user record

#### Scenario: Provider rotates its signing keys

- **WHEN** the identity provider begins signing with a newly published key while the API is running
- **THEN** tokens signed with the new key are accepted without restarting the API

#### Scenario: Local-account token is presented

- **WHEN** local accounts are enabled and a caller presents an unexpired token from the local-account
  issuer
- **THEN** the request is authenticated as the stored user that the token's subject names

#### Scenario: Token names one issuer but is signed with another's key

- **WHEN** a token names the local-account issuer but is signed with the development issuer's key, or
  the reverse
- **THEN** the request is refused as unauthenticated

### Requirement: Users are provisioned on first sign-in

The first time a validated token presents a subject that has no stored user, the system SHALL create
an active user record for that subject, holding the default role, and SHALL proceed with the
request under that role. Provisioning SHALL be idempotent: concurrent first requests for the same
subject SHALL result in exactly one user record.

The default role SHALL be the least privileged seeded role. Provisioning SHALL NOT grant any
administrative permission.

The display name and email stored for a user SHALL be taken from the token's claims and SHALL be
refreshed when they change, so that the application is not the system of record for them.

#### Scenario: Unknown subject signs in

- **WHEN** a valid token presents a subject with no stored user record
- **THEN** an active user is created for that subject with the default role, and the request
  proceeds with that role's permissions

#### Scenario: Provisioned user has no administrative access

- **WHEN** a newly provisioned user invokes an endpoint requiring user or role management
- **THEN** the request is refused as forbidden

#### Scenario: Two first requests race

- **WHEN** two requests carrying the same previously unknown subject are handled concurrently
- **THEN** exactly one user record exists afterwards and neither request fails

#### Scenario: Display name changes at the provider

- **WHEN** a returning user's token carries a display name or email different from the stored one
- **THEN** the stored values are updated to match the token

### Requirement: Deactivated users are refused

A user record SHALL carry an active flag. A validated token whose subject maps to an inactive user
SHALL be refused as unauthenticated, regardless of how much of the token's validity window remains.
Deactivation SHALL take effect on the user's next request without waiting for the token to expire.

#### Scenario: User is deactivated mid-session

- **WHEN** an administrator deactivates a user who holds a token that is still within its validity
  window
- **THEN** that user's next request is refused and returns no business data

#### Scenario: Deactivated user is reactivated

- **WHEN** an administrator reactivates a previously deactivated user
- **THEN** that user's next request with a valid token succeeds with their role's permissions

### Requirement: Single permission vocabulary

The system SHALL use one permission vocabulary in the form `<resource>.<action>`, shared verbatim by
the API, the stored role definitions and the browser. There SHALL NOT be a second vocabulary or a
translation layer between them.

The vocabulary SHALL be a closed catalogue defined in code. A role SHALL NOT be assigned a
permission outside the catalogue, and the catalogue SHALL NOT contain a permission that no
server-side operation guards, except where a permission is explicitly recorded as awaiting the
change that will guard it.

#### Scenario: Browser and API name a permission identically

- **WHEN** the permission governing catalog management is named in the browser and in the API
- **THEN** both use the identical string, and no mapping table exists between them

#### Scenario: Unknown permission is assigned to a role

- **WHEN** a role write names a permission outside the catalogue
- **THEN** the write is rejected with a stable validation problem and the role is unchanged

#### Scenario: Catalogue is audited for dead permissions

- **WHEN** the permission catalogue is inspected against the guarded server operations
- **THEN** every permission either guards at least one operation or is explicitly recorded as
  pending a named later change

### Requirement: Effective permissions are resolved per request

A caller's effective permissions SHALL be resolved from their stored user record and its role on
every request, and SHALL NOT be read from claims carried in the token. A change to a role's
permission set, or to a user's role, SHALL govern that user's very next request without requiring a
new sign-in or a new token.

A user whose role is inactive or no longer exists SHALL hold no permissions, and SHALL therefore be
refused by every permission-guarded endpoint while retaining an authenticated identity.

#### Scenario: Permission is revoked from a role

- **WHEN** an administrator removes a permission from a role and a user holding that role issues
  their next request against an endpoint guarding it
- **THEN** the request is refused as forbidden, with the same token as before

#### Scenario: Permission is granted to a role

- **WHEN** an administrator adds a permission to a role and a user holding that role issues their
  next request against an endpoint guarding it
- **THEN** the request succeeds, with the same token as before

#### Scenario: Token carries permission claims

- **WHEN** a valid token carries claims naming permissions or roles
- **THEN** they are ignored and the caller's permissions come from the stored user and role

#### Scenario: User's role has been deactivated

- **WHEN** a user whose role is inactive invokes any permission-guarded endpoint
- **THEN** the request is refused as forbidden

### Requirement: Caller profile endpoint

The system SHALL expose an endpoint returning the calling user's own profile: their internal
identifier, display name, email, role name, role label, active flag and effective permission set. It
SHALL require authentication and no specific permission, and SHALL return only the caller's own
record.

The response SHALL NOT contain the external subject identifier, any token material, or any other
user's data.

#### Scenario: Authenticated caller reads their profile

- **WHEN** an authenticated user requests their own profile
- **THEN** their display name, role and effective permissions are returned

#### Scenario: Unauthenticated caller reads the profile endpoint

- **WHEN** a caller with no valid token requests the profile endpoint
- **THEN** the request is refused as unauthenticated and no profile data is returned

#### Scenario: Profile response is inspected for identity leakage

- **WHEN** a profile response is inspected
- **THEN** it contains no external subject identifier and no token material

#### Scenario: Permissions change between two reads

- **WHEN** a user's role permissions change and the user reads their profile again
- **THEN** the returned effective permission set reflects the change

### Requirement: User administration

The system SHALL let an actor holding `users.manage` list users, read a single user, create a user,
change a user's display name and role, and deactivate or reactivate a user. Listing SHALL include
inactive users only when explicitly requested, and SHALL be paged.

A user SHALL carry an opaque internal identifier, a display name, an email, a role name, an active
flag, a concurrency version and creation and update times. The external subject identifier SHALL
NOT appear in any response.

Creating a user SHALL require a unique email, compared without regard to case. A user record created
before that person has ever signed in SHALL be linked to its subject on their first successful
sign-in.

#### Scenario: Administrator lists users

- **WHEN** an actor holding `users.manage` lists users
- **THEN** a page of active users is returned with their display names, emails, roles and versions,
  and no external subject identifiers

#### Scenario: Inactive users are excluded by default

- **WHEN** an actor lists users without asking for inactive ones
- **THEN** deactivated users are absent from the result

#### Scenario: Duplicate email is created

- **WHEN** an actor creates a user with an email that already exists, differing only in case
- **THEN** the request is rejected with a stable conflict problem and no user is created

#### Scenario: Administrator changes a user's role

- **WHEN** an actor holding `users.manage` sets another user's role to an existing active role with
  the current version
- **THEN** the change is stored and that user's next request uses the new role's permissions

### Requirement: Role administration

The system SHALL let an actor holding `roles.manage` list roles, read a single role, create a role,
change a role's label, replace a role's permission set, and deactivate or reactivate a role. A role
SHALL carry an internal name, a label, a system flag, a permission set, an active flag, a
concurrency version and timestamps.

A role's internal name SHALL be unique, lower-case, and limited to letters, digits and underscores,
and SHALL NOT be changed after creation. A role SHALL hold at least one permission.

The system SHALL seed a fixed set of system roles at deployment. A system role SHALL NOT be renamed,
SHALL NOT have its permission set emptied, and SHALL NOT be deactivated. Its label and permission
set MAY otherwise be changed, so that an installation can adjust what a seeded role grants.

A role that is still held by an active user SHALL NOT be deactivated.

#### Scenario: Administrator creates a role

- **WHEN** an actor holding `roles.manage` creates a role with a unique name, a label and at least
  one permission from the catalogue
- **THEN** the role is stored as a non-system role and appears in later listings

#### Scenario: Role name is invalid

- **WHEN** a role is created with a name containing characters outside lower-case letters, digits
  and underscores
- **THEN** the request is rejected with a stable validation problem and no role is created

#### Scenario: System role is deactivated

- **WHEN** an actor attempts to deactivate a seeded system role
- **THEN** the request is refused and the role remains active

#### Scenario: System role's permissions are emptied

- **WHEN** an actor replaces a system role's permission set with an empty set
- **THEN** the request is refused and the permission set is unchanged

#### Scenario: Role in use is deactivated

- **WHEN** an actor deactivates a role that an active user still holds
- **THEN** the request is refused, naming that the role is in use, and the role remains active

#### Scenario: System role's permissions are adjusted

- **WHEN** an actor removes one permission from a seeded system role, leaving at least one
- **THEN** the change is stored and holders of that role lose the permission on their next request

### Requirement: Administration invariants protect against lockout and self-escalation

The system SHALL refuse any administration write that would leave no active user holding
`users.manage`. This SHALL cover deactivating such a user and changing their role to one without
that permission, and SHALL be enforced on the server, not in the browser.

An actor SHALL NOT change their own role and SHALL NOT deactivate themselves, whatever permissions
they hold.

#### Scenario: Last administrator is deactivated

- **WHEN** an actor deactivates the only remaining active user holding `users.manage`
- **THEN** the request is refused and that user remains active

#### Scenario: Last administrator loses the permission by role change

- **WHEN** an actor changes the only remaining active holder of `users.manage` to a role without it
- **THEN** the request is refused and the role is unchanged

#### Scenario: Last administrator loses the permission by role edit

- **WHEN** an actor removes `users.manage` from the only role that still grants it to an active user
- **THEN** the request is refused and the permission set is unchanged

#### Scenario: Actor changes their own role

- **WHEN** an actor holding `users.manage` sets their own role
- **THEN** the request is refused and their role is unchanged

#### Scenario: Actor deactivates themselves

- **WHEN** an actor holding `users.manage` deactivates their own user
- **THEN** the request is refused and they remain active

#### Scenario: Invariant is bypassed from the browser

- **WHEN** a request that would break an invariant is sent directly to the API without going through
  the administration screens
- **THEN** it is refused by the API with the same problem

### Requirement: Users and roles are deactivated, never deleted

The system SHALL NOT expose any operation that physically removes a user or a role. Removal SHALL be
expressed as deactivation, which preserves the record, its identifier and its history. The runtime
database role SHALL NOT hold delete permission on the user or role tables.

#### Scenario: Deactivated user is preserved

- **WHEN** a user is deactivated
- **THEN** their record still exists with its identifier, and they appear when inactive users are
  listed

#### Scenario: No removal operation is offered

- **WHEN** the administration contract is inspected
- **THEN** it exposes no operation that physically removes a user or a role

#### Scenario: Runtime database privileges are inspected

- **WHEN** the runtime database role's privileges on the user and role tables are inspected
- **THEN** it holds no delete privilege on either

### Requirement: Optimistic concurrency on administration writes

Every write that changes an existing user or role SHALL carry the version the actor last read. A
write carrying a stale version SHALL be refused with a stable conflict problem, distinguishable from
a validation or name-conflict problem, and SHALL store nothing. A successful write SHALL return a
new version.

#### Scenario: Two administrators edit the same user

- **WHEN** two actors load the same user and the second saves after the first
- **THEN** the second write is refused with a stable concurrency-conflict problem and the first
  actor's change remains

#### Scenario: Version is omitted

- **WHEN** an update omits the version
- **THEN** the request is rejected with a stable validation problem and nothing is stored

### Requirement: Administration authorization fails closed

Every user and role endpoint SHALL check authentication and then its specific permission —
`users.manage` for user operations, `roles.manage` for role operations — before validating the
request body or revealing whether the named user or role exists. A caller without a valid token
SHALL receive the unauthenticated refusal; an authenticated caller without the permission SHALL
receive the forbidden refusal.

Hiding an administration screen or control SHALL NOT be the access control. Reaching an
administration route or endpoint directly SHALL be refused by the route guard and by the API
independently.

#### Scenario: Unauthenticated administration write with an invalid body

- **WHEN** an unauthenticated caller sends a malformed user or role write
- **THEN** the refusal is the unauthenticated problem, identical to the refusal for a valid body,
  and no validation detail is returned

#### Scenario: Authenticated caller lacks the permission

- **WHEN** an authenticated actor without `users.manage` lists or writes users
- **THEN** the request is refused as forbidden and no user data is returned

#### Scenario: Permission does not cross over

- **WHEN** an actor holding `roles.manage` but not `users.manage` invokes a user endpoint
- **THEN** the request is refused as forbidden

#### Scenario: Forbidden caller probes for existence

- **WHEN** an actor without the permission requests a user or role identifier that does not exist
- **THEN** the refusal is the forbidden problem, indistinguishable from the refusal for an existing
  record

### Requirement: The development actor is bounded and is never a fallback

The system MAY offer a development actor for local development and automated tests, with a
configurable permission set so that a test can exercise an authorized and an unauthorized caller
deterministically. It SHALL be disabled by default, SHALL cause start-up to fail if enabled in a
production environment, and SHALL NOT be reachable through the production authentication path.

When the development actor is disabled, a request with no token or an invalid token SHALL be refused
as unauthenticated. It SHALL NOT fall back to the development actor, to an anonymous actor, or to
any other permissive identity.

#### Scenario: Development actor is enabled in production

- **WHEN** the application starts in a production environment with the development actor enabled
- **THEN** start-up fails before the API accepts any request

#### Scenario: Token is absent and the development actor is disabled

- **WHEN** a request arrives with no token and the development actor is disabled
- **THEN** the request is refused as unauthenticated rather than resolving to any actor

#### Scenario: Invalid token with the development actor enabled

- **WHEN** a request carries an invalid token while the development actor is enabled
- **THEN** the request is refused as unauthenticated rather than falling back to the development
  actor

#### Scenario: Test exercises an unauthorized caller

- **WHEN** a test configures the development actor without a given permission and invokes an
  endpoint guarding it
- **THEN** the request is refused as forbidden

### Requirement: Bootstrap administrator and recovery

The deployment SHALL leave at least one active user holding `users.manage`, so that an installation
is never locked out of administration. A seeded local account holding such a role SHALL satisfy
this. Otherwise, the bootstrap administrator SHALL be identified by configuration supplied at
deployment, not by a hard-coded credential. The email-seeded bootstrap administrator SHALL hold no
password: its authentication remains the identity provider's responsibility.

A documented operator procedure SHALL exist for restoring an administrator directly against the
database when no active administrator remains.

#### Scenario: Fresh deployment is administered

- **WHEN** the system is deployed to an empty database and the configured bootstrap administrator
  signs in
- **THEN** they hold `users.manage` and `roles.manage` and can administer users and roles

#### Scenario: Seeded local administrator satisfies the bootstrap check

- **WHEN** the system is deployed to an empty database with a local account seeded into a role holding
  `users.manage`
- **THEN** the deployment step completes, and that account can administer users and roles

#### Scenario: Deployment carries no bootstrap configuration

- **WHEN** the system is deployed without the bootstrap administrator configured and without any
  seeded local account holding `users.manage`
- **THEN** the deployment step fails with an explicit message rather than starting with no
  administrator

#### Scenario: Installation has lost its administrators

- **WHEN** no active user holds `users.manage`
- **THEN** the documented recovery procedure restores one against the database, and the procedure
  states what it changes

### Requirement: Identity data is absent from logs and responses

The external subject identifier, the raw or partial bearer token, and any token claim SHALL NOT be
written to application, request or diagnostic logs. A user's email, display name and user name SHALL
NOT be written to logs either, and neither SHALL a password or password hash. Authentication and
authorization failures SHALL be diagnosable from safe operational metadata: the correlation
identifier, the endpoint, the outcome and, where a user is resolved, their internal identifier.

Internal storage paths, provider secrets and signing key material SHALL NOT reach the browser.

#### Scenario: Authentication fails

- **WHEN** a request is refused because its token failed validation
- **THEN** the log entry identifies the request by correlation identifier and outcome and contains
  no token, subject, email or display name

#### Scenario: Authorization fails

- **WHEN** an authenticated request is refused for lacking a permission
- **THEN** the log entry names the permission and the caller's internal identifier and contains no
  email or display name

#### Scenario: Administration write is logged

- **WHEN** a user is created or a role's permissions are changed
- **THEN** the log entry contains no email or display name

#### Scenario: Browser configuration is inspected

- **WHEN** the configuration the browser receives is inspected
- **THEN** it contains the sign-in mode and the provider's public client and tenant identifiers
  only, and no client secret, signing key or password

### Requirement: Browser sign-in and profile

The browser SHALL sign in using the mode its runtime configuration selects:

- **identity provider:** it SHALL obtain its session from the provider.
- **password:** it SHALL collect a user name and password and exchange them at the API's password
  sign-in operation. It SHALL never check the credentials itself.
- **development:** outside production, it SHALL obtain a token from the development issuer.

When no mode is configured, the browser SHALL select the development mode for local and test
environments and the identity-provider mode otherwise.

In every mode, the browser SHALL obtain the signed-in user's display name, role and effective
permissions from the caller profile endpoint. It SHALL NOT construct a profile, a role or a
permission set locally, and SHALL NOT accept credentials that it validates itself.

Every request the browser sends to the API SHALL carry the current bearer token. A response refusing
the request as unauthenticated SHALL cause the browser to end the local session and return the user
to sign-in rather than presenting a generic failure. In password mode, the token SHALL be kept only
for the browser tab's session and SHALL be removed on sign-out or on such a refusal.

Permissions held in the browser SHALL be used only to decide what to render. Every guarded
destination SHALL remain protected by its route guard and by the API independently.

#### Scenario: User signs in

- **WHEN** a user completes sign-in with the identity provider
- **THEN** the application reads their profile from the caller profile endpoint and renders the
  destinations their permissions allow

#### Scenario: Browser is asked for credentials it would validate

- **WHEN** the sign-in screen is inspected in any mode
- **THEN** it either delegates to the identity provider or submits the credentials to the API, and
  it never decides itself whether a user name and password are valid

#### Scenario: User signs in with a password

- **WHEN** password mode is configured and a user submits a correct user name and password
- **THEN** the application reads their profile from the caller profile endpoint and renders the
  destinations their role allows

#### Scenario: Password sign-in is refused

- **WHEN** password mode is configured and the API refuses the submitted credentials
- **THEN** a Spanish message states that the user name or password is incorrect, without saying
  which, the user name is kept and the password field is cleared

#### Scenario: Password sign-in is rate-limited

- **WHEN** the API refuses a password sign-in as too many attempts
- **THEN** a distinct Spanish message asks the user to wait before trying again

#### Scenario: Session expires while the application is open

- **WHEN** an API request is refused as unauthenticated
- **THEN** the local session is cleared and the user is returned to sign-in

#### Scenario: User signs out

- **WHEN** a user signs out
- **THEN** the local session is ended (and, in identity-provider mode, the provider session too), and
  no profile or token remains in browser storage

#### Scenario: Rendered permissions are not the control

- **WHEN** a user without a permission reaches its destination by URL
- **THEN** the route guard redirects them, and the API refuses the underlying request independently

### Requirement: User and role administration screens

The application SHALL provide administration screens for users and for roles, reachable only by
actors holding `users.manage` and `roles.manage` respectively. The user screen SHALL list users with
their display name, email, role and active state, and SHALL offer creating a user, changing a
user's role and deactivating or reactivating one. The role screen SHALL list roles with their label,
system flag and active state, and SHALL offer creating a role, editing its label, setting its
permissions and deactivating or reactivating one.

A refusal returned by the API — a broken invariant, a stale version, a duplicate email or name —
SHALL be shown as a distinct Spanish message, and the entered values SHALL be kept. Deactivation
SHALL require explicit confirmation. All copy SHALL be Spanish, with correct accents, and SHALL come
from the translation resources.

The screens SHALL NOT re-implement the server's invariants as the control; they MAY disable a
control to explain why an action is unavailable, but the refusal SHALL come from the API.

#### Scenario: Administrator opens the user screen

- **WHEN** an actor holding `users.manage` opens the users section
- **THEN** active users are listed with their display name, email, role and state

#### Scenario: Role screen is reached without permission

- **WHEN** an actor without `roles.manage` navigates directly to the roles route
- **THEN** the route guard redirects them and no role page is rendered

#### Scenario: Server refuses an invariant-breaking change

- **WHEN** an administrator attempts to deactivate the last administrator
- **THEN** a distinct Spanish message explains the refusal and the list is unchanged

#### Scenario: Save conflicts are explained

- **WHEN** a save is refused because the record changed since it was loaded, or the email is taken
- **THEN** the page shows a distinct Spanish message for each case and keeps the entered values

#### Scenario: Deactivation is cancelled

- **WHEN** an administrator starts deactivating a user and dismisses the confirmation
- **THEN** no request is sent and the user remains active

### Requirement: Position permission vocabulary and seeded assignments

The shared API and SPA permission vocabulary SHALL include exactly `positions.read` and `positions.manage` for the position capability. `positions.read` SHALL govern listing and reading position data. `positions.manage` SHALL govern creating, editing, closing and reopening positions. Neither permission SHALL imply the other, `candidates.read`, `presets.manage`, catalog access or document access.

The seeded roles `rrhh_admin`, `rrhh_user`, `manager_reader`, `readonly` and `system_admin` SHALL hold `positions.read`. Only `rrhh_admin` and `rrhh_user` SHALL receive `positions.manage` by default. Permission seed changes SHALL be idempotent and SHALL NOT overwrite custom-role assignments.

#### Scenario: Shared vocabulary is inspected

- **WHEN** the API and SPA permission catalogues are compared
- **THEN** both contain `positions.read` and `positions.manage` with no alias or underscore variant

#### Scenario: Seeded read roles are inspected

- **WHEN** the five system roles are read after migration
- **THEN** each contains `positions.read`

#### Scenario: Seeded management roles are inspected

- **WHEN** the system roles are read after migration
- **THEN** `rrhh_admin` and `rrhh_user` contain `positions.manage` and the other seeded roles do not

#### Scenario: Manager lacks candidate permission

- **WHEN** a custom actor holds `positions.manage` but not `candidates.read`
- **THEN** the actor may perform authorized position writes but gains no candidate data or match count

#### Scenario: Permission migration is repeated

- **WHEN** the role-seed update is applied to an already updated database
- **THEN** seeded permissions are not duplicated and custom roles retain their configured permissions

### Requirement: Local account credentials are stored only as hashes

The system SHALL support local accounts: users that hold a user name and a password owned by the
application rather than by the identity provider. A user name SHALL be unique without regard to
case, stored in lower case, and limited to 3–64 characters from lower-case letters, digits, dot,
underscore and hyphen. A password SHALL be stored only as a salted, deliberately slow, one-way hash
whose format records its algorithm and work factor. The system SHALL NOT store a password in any
reversible form. Two accounts holding the same password SHALL have different stored hashes.

A stored password hash SHALL NOT appear in any API response, including user administration
responses, and SHALL NOT be written to any log. A user that has a password hash SHALL also have a
user name.

#### Scenario: Stored credential is inspected

- **WHEN** the stored record of a local account is read directly from the database
- **THEN** it holds a hash identifying its algorithm and work factor, and no column holds the
  password itself

#### Scenario: Two accounts share a password

- **WHEN** two local accounts are given the same password
- **THEN** their stored hashes differ

#### Scenario: User administration response is inspected

- **WHEN** an actor holding `users.manage` lists or reads a local account
- **THEN** the response contains no password hash and no password

#### Scenario: User name differs only in case

- **WHEN** a local account is created with a user name that differs from an existing one only in
  case
- **THEN** it is refused and no second account exists

### Requirement: Password sign-in issues an access token

When local accounts are enabled by configuration, the system SHALL expose one anonymous operation
that accepts a user name and a password and, if they match an active local account, returns a
signed access token, its type and its lifetime in seconds. The token SHALL identify the account by
a subject in the form `local:<userName>`, SHALL carry the display name and email, and SHALL NOT
carry any role or permission. Its lifetime SHALL be bounded by configuration and default to eight
hours. When local accounts are disabled, the operation SHALL NOT exist.

An unknown user name, a wrong password, an inactive account and an account with no password SHALL
all produce the same unauthenticated refusal, with the same body. An unknown user name SHALL
still cost the same verification work as a known one. The refusal SHALL NOT reveal which cause
applied.

The operation SHALL limit sign-in attempts per client address. An attempt beyond the limit within
the window SHALL be refused as too many requests, without checking the password.

The user name and password SHALL NOT be written to any log. A sign-in log entry SHALL carry only
the correlation identifier, the outcome and, on success, the internal user identifier.

#### Scenario: Correct credentials

- **WHEN** an active local account submits its user name and correct password
- **THEN** a signed access token is returned, and a request carrying it reads the caller profile
  with that account's role and permissions

#### Scenario: Every failure looks the same

- **WHEN** sign-in is attempted with an unknown user name, with a wrong password, with an inactive
  account, and with an account that has no password
- **THEN** each attempt receives the identical unauthenticated refusal and no token

#### Scenario: Too many attempts

- **WHEN** a client exceeds the allowed number of sign-in attempts within the window
- **THEN** further attempts are refused as too many requests until the window passes, even with
  correct credentials

#### Scenario: Token carries no permissions

- **WHEN** a token issued by password sign-in is decoded
- **THEN** it contains a subject, a display name, an email and validity claims, and no role or
  permission claim

#### Scenario: Role changes after sign-in

- **WHEN** an administrator changes a local account's role after it signed in
- **THEN** that account's next request with the same token uses the new role's permissions

#### Scenario: Local accounts are disabled

- **WHEN** local accounts are not enabled in the configuration
- **THEN** the sign-in operation is not available: an anonymous caller is refused as
  unauthenticated, as for any route that does not exist, an authenticated caller receives not
  found, and no token is issued

#### Scenario: Sign-in is logged

- **WHEN** a sign-in succeeds or fails
- **THEN** the log entry contains the correlation identifier and outcome, and contains neither the
  user name nor the password

### Requirement: Local accounts are seeded from deployment configuration

The deployment step that applies migrations SHALL create or update the local accounts listed in
deployment configuration. Each entry SHALL name a user name, display name, email, role and
password. A missing account SHALL be created active with the given role. An existing account whose
stored hash does not match the configured password SHALL have its hash replaced, so that changing
the configured password and redeploying rotates it. The step SHALL NOT change the role or active
flag of an account that already exists. Running the step repeatedly SHALL create no duplicates.

The step SHALL refuse to complete when a configured password is shorter than 12 characters, or
names a role that does not exist. In a production environment, start-up and the deployment step
SHALL refuse the development-only passwords and the development-only signing key committed to the
repository.

The deployment SHALL NOT require a password to be committed to source control for any shared
environment. Passwords and the signing key for shared environments SHALL come from deployment
secrets.

#### Scenario: Fresh database

- **WHEN** the deployment step runs against an empty database with two configured local accounts
- **THEN** both accounts exist, active, with their configured roles and hashed passwords

#### Scenario: Password is rotated

- **WHEN** the configured password of an existing account is changed and the deployment step runs
  again
- **THEN** the old password is refused, the new one succeeds, and the account keeps its identifier,
  role and active flag

#### Scenario: Administrator edits survive a redeploy

- **WHEN** an administrator changes a seeded account's role or deactivates it, and the deployment
  step runs again
- **THEN** the account keeps the administrator's role and active flag

#### Scenario: Short password is configured

- **WHEN** a configured local-account password has fewer than 12 characters
- **THEN** the deployment step fails with an explicit message and stores nothing for that account

#### Scenario: Development credentials reach production

- **WHEN** a production environment is configured with the repository's development-only signing key
  or passwords
- **THEN** start-up or the deployment step fails before any request is served
