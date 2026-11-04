## ADDED Requirements

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

## MODIFIED Requirements

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
