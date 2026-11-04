## Context

See `proposal.md` for the motivation and `specs/` for the required behaviour. The current state that
shapes the approach:

- `Program.cs` already runs a single JwtBearer pipeline that can trust two issuers: the Entra
  authority (discovery document) and, outside Production, the development issuer (HS256 key from
  configuration, `DevelopmentTokenIssuer`, `POST /api/dev/token`). There is no code path that skips
  validation.
- `IdentityResolutionMiddleware` → `TokenCurrentActor` → `CallerIdentityResolver` turns the
  validated subject into an `ADM_Users` row. It links an email-seeded row on first sign-in, or
  provisions an unknown subject into `readonly`, and loads permissions from `ADM_Roles` on every
  request. `IsActive = false` is refused as unauthenticated.
- `ADM_Users` has no credential columns. `ktl_runtime` holds `SELECT, INSERT, UPDATE` on it (no
  `DELETE`).
- The SPA picks its `TokenSource` from `APP_ENV`: `local`/`test` use `DevelopmentTokenSource`, and
  anything else uses `MsalTokenSource`. `env.template.js` carries no `ENTRA_*` keys yet, so the MSAL
  path is not wired in any deployment.
- `ktl.lan` runs `ASPNETCORE_ENVIRONMENT=Development` with `APP_ENV: test`. That is why every
  visitor is auto-signed-in.

## Goals / Non-Goals

**Goals:**

- Add password sign-in as a third issuer in the existing pipeline, without a second authentication
  scheme or a cookie session.
- Keep `CallerIdentityResolver`, the permission model and every endpoint guard untouched.
- No new NuGet or npm runtime dependency.

**Non-Goals:**

- Any API to set or change a password. The only writer of `PasswordHash` is the migrator.
- Persisting login attempts, lockout state, or refresh/revocation tokens.
- Changing how the Entra mode works.

## Decisions

### D1. A third JWT issuer, not a cookie scheme or ASP.NET Core Identity

`POST /api/auth/token` verifies the credentials and mints an HS256 JWT through a new
`LocalAccountTokenIssuer`, modelled on `DevelopmentTokenIssuer`. The issuer is
`https://kepler-talento.local/accounts` by default, the audience is the existing API audience, and
the key is `Authentication:LocalAccounts:SigningKey` (at least 32 bytes). `Program.cs` adds the
local issuer and key to the `ValidIssuers` and `IssuerSigningKeys` lists that the development issuer
already uses, so a token goes through exactly the same validation.

To make "a token validates only against the key of the issuer it names" hold, each issuer's key
gets a distinct `KeyId`, written into the token header. `IssuerSigningKeyResolver` returns only the
key registered for the token's `iss`. Start-up refuses equal local and development keys.

- **Alternative: cookie authentication.** It would need antiforgery, a second scheme in the fallback
  policy, and a different 401 path in the SPA. Rejected: the SPA's `TokenSource`/`ApiTransport`
  design already assumes a bearer token.
- **Alternative: ASP.NET Core Identity (`UserManager`, `SignInManager`).** It brings its own tables
  and schema conventions, which clash with the `ADM_` prefix and the existing `User` aggregate.
  Rejected.

### D2. The local account's subject is `local:<userName>`

The seed writes `ExternalSubject = local:<userName>` and the token carries it in the configured
`SubjectClaim`, so `CallerIdentityResolver` finds the row by subject exactly as for Entra.
Provisioning of unknown subjects cannot be triggered by this path, because the issuer only mints
tokens for rows it has just loaded. The `local:` prefix cannot collide with an Entra `oid` (a GUID)
or the development subjects (`dev-…`).

### D3. PBKDF2-HMAC-SHA256 from the BCL

`Pbkdf2PasswordHasher : IPasswordHasher` (Infrastructure) uses `Rfc2898DeriveBytes.Pbkdf2`:

- SHA-256, 600 000 iterations (the current OWASP figure for PBKDF2-SHA256).
- A 16-byte salt from `RandomNumberGenerator` and a 32-byte subkey.
- Comparison with `CryptographicOperations.FixedTimeEquals`.
- Stored as `pbkdf2-sha256$600000$<salt b64>$<subkey b64>` (at most about 100 characters, column
  `varchar(256)`).

`Verify` parses the iterations from the stored value, so the work factor can be raised later
without invalidating existing hashes.

- **Alternative: Argon2id or bcrypt.** Better memory hardness, but they need a NuGet package
  (non-negotiable 2 requires a documented reason, and PBKDF2 is adequate for two seeded accounts).
- **Alternative: `PasswordHasher<T>` from `Microsoft.Extensions.Identity.Core`.** It pulls in the
  Identity package for one function. Rejected.

### D4. Uniform failure and timing

`SignInWithPasswordHandler` normalises the user name (trim, lower-case), then loads the row by
`UserName`. It always runs one `Verify`: against the stored hash, or against a fixed dummy hash
built once at start-up when the row is missing or has no hash. It throws one
`InvalidCredentialsException` (new, `Application/Common/Errors`) when any of these hold: no row, no
hash, verification fails, or the row is inactive. The inactive check comes after `Verify`, so it
costs the same as the other failures. `GlobalExceptionHandler` maps that exception to `401` with
code `auth.invalid_credentials` and a fixed Spanish title.

The validator (non-empty, user name at most 64 characters, password at most 256 characters) runs
before the handler. An oversized or empty body therefore gets a `400`. That does not reveal account
existence, because it depends only on the input's shape.

The endpoint is anonymous, so the "check `ICurrentActor` before validating" rule does not apply: it
is the operation that produces an actor. This is the only departure from that principle, and D5 and
D4 are its mitigations.

### D5. Rate limiting with the framework limiter

The endpoint uses `AddRateLimiter` with a partitioned fixed-window limiter: 10 permits per minute per
`RemoteIpAddress`, no queue. It runs after `UseForwardedHeaders`, so behind nginx the client IP
comes from the trusted `X-Forwarded-For`. The `OnRejected` callback writes the standard
ProblemDetails through `IProblemDetailsService` with code `auth.too_many_attempts` and status
`429`. That keeps the shape identical to `GlobalExceptionHandler` output, without hand-built JSON.
The limiter is attached only to this endpoint (`RequireRateLimiting`).

- **Alternative: per-user-name lockout.** It would let anyone lock HR out of the shared accounts.
  Rejected (see the spec's Non-Goals and Risks).

### D6. Seeding in `--migrate`, configuration as the source of truth

`DatabaseInitializer.SeedLocalAccountsAsync` runs after `SeedCatalogsAsync` and before
`SeedBootstrapAdministratorAsync`. For each `Authentication:LocalAccounts:Seed` entry:

1. Fail if the password has fewer than 12 characters, or the role does not exist in `ADM_Roles`.
2. If no row has that `UserName`, create one: `Guid.CreateVersion7()`,
   `ExternalSubject = local:<userName>`, the configured display name, email and role, active.
3. Otherwise, if `Verify(configured, stored)` is false or the stored hash is null, call
   `SetLocalCredentials` with a fresh hash.

Role and active flag are never touched on an existing row. Because a seeded `rrhh_admin` holds
`users.manage`, `HasActiveAdministratorAsync` is satisfied on a fresh database, and the email
bootstrap is skipped as it already is whenever an administrator exists.

Seeding runs as `ktl_migrator`. The runtime role never writes `PasswordHash`. It would still have the
privilege, because column-level grants are not used on `ADM_Users`, and adding them is out of scope.
No grant changes are needed.

The development-only values (signing key and the two local passwords) are kept in one
`LocalAccountDefaults.DevelopmentOnlyValues` set. In Production, both `ValidateOnStart` on
`KeplerAuthenticationOptions` and the seed step refuse any of them.

### D7. Data model

The EF Core migration `AddLocalAccountCredentials` (generated, applied by the migrator) adds:

- `ADM_Users."UserName"` `varchar(64)` null, with the unique index `IX_ADM_Users_UserName`. Values
  are stored lower-cased by the domain, so a plain unique index suffices, matching how `Email` is
  handled.
- Check `CK_ADM_Users_UserName`: `"UserName" IS NULL OR "UserName" ~ '^[a-z0-9._-]{3,64}$'`.
- `ADM_Users."PasswordHash"` `varchar(256)` null.
- Check `CK_ADM_Users_PasswordHash`: `"PasswordHash" IS NULL OR "UserName" IS NOT NULL`.

`User` gets `UserName`, `PasswordHash` and `SetLocalCredentials(userName, passwordHash, at)`.
`UserRepository` gets `FindByUserNameAsync`. No admin contract record maps `PasswordHash`. An
integration test serialises every admin user response to prove it. `UserName` is not added to the
admin contract in this change, which keeps the UI untouched.

### D8. Frontend: `AUTH_MODE` and `PasswordTokenSource`

- `AppConfig` gains `AUTH_MODE`. `readAppConfig` falls back to `development` for `APP_ENV`
  `local`/`test` and to `entra` otherwise, so existing deployments behave as before until they set
  it.
- `createTokenSource` switches on `AUTH_MODE`.
- `TokenSource.signIn` takes an optional `PasswordCredentials`, which only `PasswordTokenSource`
  reads.
- `PasswordTokenSource` posts to `${API_BASE_URL}/auth/token` with plain `fetch`, like
  `DevelopmentTokenSource`, because no token exists yet for `ApiTransport` to attach. It maps `401`
  to `TranslatableError('auth.login.invalidCredentials')` and `429` to
  `TranslatableError('auth.login.tooManyAttempts')`.
- The token and its expiry go in `sessionStorage` under `ktl.auth.session`, so a reload keeps the
  session in the same tab. That matches the per-tab scope MSAL is already configured with. The key
  is removed on `signOut()` and through `AuthService.handleUnauthorized`. This is a credential cache,
  not a new data path for application data (non-negotiable 2).
- **Alternative: memory only.** It forces a sign-in on every reload. Rejected for usability.
- **Alternative: `localStorage`.** It leaks across tabs and survives closing the browser. Rejected.

`AuthService.signIn(credentials?)` passes the credentials through. On a reload, `RequireAuth` sees
no profile, so the login page tries `tokenSource.getToken()`. If a stored token exists, it reads
`/me` and continues without showing the form; a `401` there clears the token. `LoginPage` reads the
mode through the existing config service and renders the form only in password mode. The
development mode button stays untouched, so the e2e suite's `sign-in` flow is unaffected.

### D9. Environments

- **Local `docker-compose.yml`:**
  - `api` and `migrator` get `Authentication__LocalAccounts__*`, with the development-only key and
    passwords.
  - `nginx` gets `AUTH_MODE: password`.
  - `env.template.js` and `40-envsubst.sh` substitute `AUTH_MODE`.
  - `public/env.js` (Vite, `:4300`) sets `AUTH_MODE: 'password'`, so every human-facing
    environment asks for a password. The e2e helper `tests/e2e/support/auth.ts` serves the test
    browser its own `env.js` with `AUTH_MODE: 'development'`, because the suite must act as
    several roles that have no password. The local API keeps the development issuer enabled for
    that and for `seed:demo`.
- **`deploy/lan/docker-compose.lan.yml`:**
  - `Authentication__DevelopmentIssuer__Enabled: 'false'`, so `/api/dev/token` is unmapped.
  - `Authentication__LocalAccounts__SigningKey: ${KTL_AUTH_SIGNING_KEY:?}`.
  - Migrator seed passwords from `${KTL_RRHH_ADMIN_PASSWORD:?}` and `${KTL_RRHH_USER_PASSWORD:?}`.
  - nginx `AUTH_MODE: password`.
  - `KTL_DEV_SIGNING_KEY` stops being required.
- **`scripts/seed-demo-data.js`:** `--user`/`--password`, or `KTL_SEED_USER`/`KTL_SEED_PASSWORD`,
  switch authentication to `/api/auth/token`. The loopback guard is unchanged, and the password is
  never printed.

### D10. Logging

Add `userName`, `password` and `passwordHash` to `PersonalDataRedaction.ProtectedNames`. The sign-in
endpoint logs only outcome and, on success, the user id. The request body is never logged, because
Serilog request logging does not capture bodies. An integration test captures logs during a sign-in
and asserts that neither the user name nor the password appears.

### Test strategy

- **xUnit unit tests:**
  - Hasher: round trip, salt uniqueness, malformed hash, iteration parsing.
  - Handler with doubles: every failure is the same exception, and an unknown user still calls
    `Verify`.
  - Options validation: key length, distinct keys, Production refusals.
- **xUnit integration tests (Testcontainers):**
  - `PasswordSignInApiTests`: success, the four failure causes with byte-identical bodies, 429, a
    cross-issuer key forgery refused, role change after sign-in, deactivation, endpoint absent when
    disabled.
  - `LocalAccountSeedTests`: fresh database, idempotence, rotation, admin edits preserved, short
    password, unknown role.
  - Schema and grant assertions; log capture.
- **Vitest:**
  - `token-source.spec.ts`, `app-config.spec.ts`, `login-page.spec.tsx`.
  - A security spec covering the `sessionStorage` clear on `401` and no secrets in `env.template.js`.
- **Playwright:** `password-sign-in.spec.ts` routes `**/env.js` to inject `AUTH_MODE: 'password'`
  and signs in with the development-only credentials. The existing suite proves that development
  mode is unchanged.

## Risks / Trade-offs

- **[Clear-text credentials on `ktl.lan` (plain HTTP)]** → Accepted for a demo-data server and
  recorded in the release notes. Using this mode with real candidate data requires TLS first. No code
  enforces that, so the release notes and runbook state it.
- **[Stateless tokens cannot be revoked before expiry]** → Deactivating the user refuses the token on
  the next request (resolution checks `IsActive`), and the lifetime is capped at 8 h.
- **[Rate-limit state is per API instance, in memory]** → There is a single API instance in every
  current topology. A multi-instance Production would need a distributed limiter, which the
  runbook notes.
- **[Shared generic accounts give no per-person accountability in the audit trail]** → Accepted
  until per-person user management. The audit rows still record which of the two accounts acted.
- **[The cron deploy on `ktl.lan` fails if the secrets are missing]** → The `:?` guards fail fast and
  the old containers keep running. The release notes put "add secrets" before "merge".
- **[The seeded password is in the migrator's environment]** → It lives in the secrets file
  (`chmod 600`) and in the container's environment, the same exposure as the database passwords
  already have. It is never logged.
- **[PBKDF2 CPU cost on each attempt (~100–300 ms)]** → Bounded by the rate limit, and negligible
  at this volume.

## Migration Plan

1. Merge to a feature branch and run the full local verification (`npm run build:all`, `npm test`,
   `npm run test:backend`, `npm run e2e`, lint and format, the security gates).
2. **Before merging to `main`:** on the server, append `KTL_AUTH_SIGNING_KEY` (`openssl rand -hex
32`), `KTL_RRHH_ADMIN_PASSWORD` and `KTL_RRHH_USER_PASSWORD` (`openssl rand -base64 18`) to
   `/opt/apps/ktl-secrets/ktl.env`.
3. Merge. The cron `deploy.sh` rebuilds. The migrator applies `AddLocalAccountCredentials` and seeds
   both accounts.
4. Verify:
   - `http://ktl.lan` shows the form.
   - `POST /api/dev/token` issues no token. The fallback authorization policy answers an
     anonymous `401` for any unmapped route, so the absent endpoint looks like any route that
     never existed.
   - Both accounts sign in, and `rrhh_user` gets `403` on `/api/admin/users`.
5. Reseed demo data with `--user rrhh_admin --password …` if needed.

**Rollback:** revert the merge. The migration's `Down` drops the two columns and their constraints.
The overlay change reverts to the development issuer, and `KTL_DEV_SIGNING_KEY` is still in
`ktl.env` because step 2 only appends.
