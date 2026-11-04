## Why

The only shared environment, the LAN server `ktl.lan`, signs every visitor in automatically as the
bootstrap administrator through the development token issuer. Anyone who can reach the host can
read and change everything, and HR cannot use it as a UAT environment with distinct access levels.
The corporate Entra ID integration that KTL-16 targets is not available yet, so a username and
password sign-in owned by the application is needed now (`openspec/KTL-45.md`).

## What Changes

- New **local accounts** sign-in mode, selected by configuration next to the existing Entra ID and
  development-issuer modes. `POST /api/auth/token` exchanges a username and password for an access
  token signed by the API's own local-account issuer. The token goes through the same JwtBearer
  validation (signature, issuer, audience, lifetime) as every other token.
- Passwords are stored only as salted PBKDF2-HMAC-SHA256 hashes, in a new nullable
  `ADM_Users.PasswordHash` column, next to a new unique `ADM_Users.UserName`. No new runtime
  dependency: hashing uses the .NET base class library, and rate limiting uses the ASP.NET Core
  framework.
- Every sign-in failure (unknown username, wrong password, inactive user, account without a
  password) returns one identical `401` and costs the same work. Attempts are rate-limited per client
  IP (`429`). There is no account lockout, because the accounts are shared and generic.
- The migrator seeds two generic accounts from deployment configuration: `rrhh_admin` (role
  `rrhh_admin`) and `rrhh_user` (role `rrhh_user`). The configured password is the source of truth,
  so rotation is "edit the secret, redeploy". An administrator's role or active-flag edits survive
  redeploys.
- The SPA gains a runtime `AUTH_MODE` setting (`development` | `password` | `entra`). Password mode
  renders a username and password form on `/login`. When `AUTH_MODE` is absent, today's behaviour
  is kept, derived from `APP_ENV`.
- **BREAKING (ktl.lan only)** The LAN server disables the development token issuer and switches to
  password mode, so the anonymous auto-sign-in ends there. Three new secrets are required in
  `ktl.env` before the change reaches `main`, or the cron deploy fails.
- Local Compose enables local accounts with committed development-only credentials, served on
  `:4200`, and the Vite dev server (`:4300`) asks for the same password. Only the e2e browser is
  served development mode, by its own test helper.
- `scripts/seed-demo-data.js` can authenticate with a username and password, so demo data can still
  be loaded on a server without the development issuer.
- Out of scope: password creation, change or reset through the API or UI; self-service; MFA;
  lockout; refresh tokens; sign-in audit events; removal of Entra support.

**Actors:**

- HR staff signing in with a shared generic account (`rrhh_user` for daily work, `rrhh_admin` for
  catalogs, import, users and roles).
- Operators who set and rotate the account passwords through deployment secrets.
- Anonymous callers, who reach only the sign-in endpoint and are refused everywhere else.

**Key entities:**

- **User** (existing `ADM_Users`) gains an optional **user name** and an optional **password hash**.
  A local account's external subject is `local:<userName>`, so identity resolution is unchanged.
- **Local-account token**: an HS256 JWT carrying only subject, name and email, never roles or
  permissions.

**Assumptions:**

- "UAT" in the brief is the existing `ktl.lan` server, which holds fabricated demo data only.
- `ktl.lan` stays plain HTTP. Credentials crossing the LAN in clear text are accepted there and
  recorded in the release notes; real candidate data requires TLS first.
- Generic shared accounts are acceptable until per-person user management ships.

**Edge cases:**

- A token from the local issuer outlives a deactivation: refused on the next request, because
  resolution checks `IsActive` every time.
- An existing user whose role was changed by an administrator: the seed must not revert it.
- An existing `ktl.lan` database still holds the «Administrador local» row. It stays, but nothing
  can sign in as it any more.
- An e2e or local run where both the development issuer and local accounts are enabled. The two
  issuers use distinct keys and issuer names.

**Success criteria:**

- On `ktl.lan`, an anonymous visitor reaches no business data. `POST /api/dev/token` issues no token.
- `rrhh_user` and `rrhh_admin` sign in and receive exactly their role's permissions. `rrhh_user` is
  refused `403` on every administration endpoint.
- No table, response or log contains a plaintext password. Stored hashes start with
  `pbkdf2-sha256$`.
- Rotating a password by redeploying makes the old password fail and the new one succeed.
- The existing e2e suite passes unchanged.

**Personal data, roles and storage (principles 1 and 3):**

- This change touches identity data (`ADM_Users`) and credentials, but not candidate data, document
  storage or role definitions. The seeded roles are reused unchanged, and no RLS policies apply.
- Principle 1 holds: the username is redacted from logs like email and display name. Neither the
  hash nor the password appears in any response or log, and responses keep exposing only the
  internal user id.
- Principle 3 holds:
  - Every business endpoint still requires a validated token and a stored permission.
  - The one new anonymous route only issues tokens: it gives a generic refusal and is
    rate-limited.
  - `ktl_runtime` keeps `SELECT, INSERT, UPDATE` on `ADM_Users` without `DELETE`, and needs no new
    grant.
  - The signing key and secrets never reach the browser.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `identity-and-access-control`:
  - Token authentication now accepts the application's own local-account issuer next to the OIDC
    provider.
  - New requirements cover local-account credentials, sign-in and seeding.
  - Browser sign-in now allows a username and password form in password mode.
  - The bootstrap administrator's "no password" rule now applies to the email-seeded administrator
    only.
- `development-demo-data`: the seed command may authenticate with a username and password instead
  of the development token endpoint. The loopback-only guard is kept.

## Impact

- **Backend:**
  - `Domain/Identity/User.cs`.
  - New `Application/Features/Identity/SignInWithPassword.cs` and
    `Application/Abstractions/Identity/IPasswordHasher.cs`.
  - New `Infrastructure/Identity/Pbkdf2PasswordHasher.cs`.
  - `Infrastructure/Persistence/DatabaseInitializer.cs` (seed) and `UserConfiguration.cs`.
  - A new EF Core migration `AddLocalAccountCredentials`.
  - `Web/Identity/AuthenticationOptions.cs` and new `Web/Identity/LocalAccountTokenIssuer.cs`.
  - New `Web/Features/Identity/PasswordSignInEndpoints.cs`.
  - `Web/Program.cs`: issuer registration, rate limiter, `--migrate` seed, Production guards.
  - `GlobalExceptionHandler`, which maps the new invalid-credentials error.
- **Frontend:**
  - `core/services/app-config.model.ts`, `core/auth/token-source.ts`, `core/auth/auth.service.ts`.
  - `core/auth/login-page.tsx` (+ `.css`, new `login-page.logic.ts`).
  - `assets/i18n/es.json`, `public/env.template.js`, `docker-entrypoint.d/40-envsubst.sh`.
- **Deployment:** `docker-compose.yml`, `deploy/lan/docker-compose.lan.yml`, `.env.example`, and the
  `ktl.lan` secrets file (`KTL_AUTH_SIGNING_KEY`, `KTL_RRHH_ADMIN_PASSWORD`,
  `KTL_RRHH_USER_PASSWORD`).
- **Scripts:** `scripts/seed-demo-data.js`.
- **Docs:**
  - `docs/ktl-45/` (contract, rotation, release notes).
  - `docs/deploy-lan-server.md`, `docs/ktl-16/authentication-and-authorization.md`, `README.md`.
- **Tests:**
  - xUnit unit and integration tests (hasher, handler, API, seed, schema, grants, log redaction).
  - Vitest unit and security tests (token source, config, login page).
  - A new Playwright spec, `password-sign-in.spec.ts`.
