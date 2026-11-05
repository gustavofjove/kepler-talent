## MODIFIED Requirements

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
the request as unauthenticated SHALL NOT be presented as a generic failure:

- When the page holds no unsaved changes, the browser SHALL end the local session and return the
  user to sign-in.
- When the page holds unsaved changes, the browser SHALL keep the page and offer to sign in again in
  place, using the same mode and the same rules as the sign-in screen.
- A sign-in again in place SHALL replace the session token and reload the caller profile.
- If the profile belongs to a different user, the unsaved changes SHALL be discarded and the browser
  SHALL continue as after a fresh sign-in.

In password mode, the token SHALL be kept only for the browser tab's session and SHALL be removed on
sign-out or on such a refusal.

Permissions held in the browser SHALL be used only to decide what to render. Every guarded
destination SHALL remain protected by its route guard and by the API independently.

#### Scenario: User signs in

- **WHEN** a user completes sign-in with the identity provider
- **THEN** the application reads their profile from the caller profile endpoint and renders the
  destinations their permissions allow

#### Scenario: Browser is asked for credentials it would validate

- **WHEN** the sign-in screen or the sign-in dialog is inspected in any mode
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

- **WHEN** an API request is refused as unauthenticated and the page holds no unsaved changes
- **THEN** the local session is cleared and the user is returned to sign-in

#### Scenario: Session expires while changes are unsaved

- **WHEN** an API request is refused as unauthenticated while the page holds unsaved changes
- **THEN** the page and its changes are kept and the user can sign in again without leaving it

#### Scenario: Signing in again as the same user

- **WHEN** a user signs in again in place as the same user
- **THEN** the new token replaces the old one, the profile is reloaded, and the page is unchanged

#### Scenario: Signing in again as another user

- **WHEN** a user signs in again in place as a different user
- **THEN** the unsaved changes are discarded and the application continues as that user's fresh
  sign-in

#### Scenario: User signs out

- **WHEN** a user signs out
- **THEN** the local session is ended (and, in identity-provider mode, the provider session too), and
  no profile or token remains in browser storage

#### Scenario: Rendered permissions are not the control

- **WHEN** a user without a permission reaches its destination by URL
- **THEN** the route guard redirects them, and the API refuses the underlying request independently
