# KTL-45 — Username and password sign-in

## [original]

We need to set up authentication via username and password. For the moment this will be basic with encryption of the password in the database. No need to create user management for the moment, add just a generic rrhh user and tell me the password. This will be deployed to the local database and also to the uat env

## [enhanced]

### Decisions taken while enriching

| Topic             | Decision                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Relation to Entra | Password sign-in is a **third, configurable sign-in mode** next to Entra ID (MSAL) and the development token issuer. Entra stays supported for a future Production. The `identity-and-access-control` spec is amended, not rewritten.            |
| "UAT"             | The existing LAN server **`ktl.lan`** (`docs/deploy-lan-server.md`). It switches to password sign-in, and its anonymous auto-sign-in as «Administrador local» **stops**.                                                                         |
| Accounts          | Two generic accounts: **`rrhh_admin`** (role `rrhh_admin`: candidates, catalogs, import, users, roles) and **`rrhh_user`** (role `rrhh_user`: candidates and documents, no administration).                                                      |
| Passwords         | Local Compose uses documented **development-only** passwords committed next to the existing dev signing key. On `ktl.lan` the operator puts them in `/opt/apps/ktl-secrets/ktl.env`. The database stores only a salted hash, never the password. |
| "Encryption"      | Passwords are **hashed** (one-way, salted, slow), not encrypted: nothing, including the application, can recover them. The KTL-33 field-encryption keys are not involved.                                                                        |

### User story

As an **HR employee**, I want to sign in to Kepler Talento with a username and a password, so that only people who know the shared RRHH credentials can reach candidate data on the UAT server, without waiting for the corporate Entra ID integration.

As an **operator**, I want the accounts and their passwords to come from deployment configuration, so that I can set or rotate a password by editing a secret and redeploying, with no credential in Git.

### Scope

**In scope**

- `POST /api/auth/token`: exchanges a username and password for a signed access token.
- Password hash and username columns on `ADM_Users`, plus seeding of the two generic accounts by the migrator.
- A login form with username and password in the SPA when the password mode is configured.
- Configuration for local Compose and `ktl.lan`, and the demo-data seed script working against password-only environments.

**Out of scope (later tickets)**

- Creating users with a password, or changing or resetting a password, from the UI or API. The administration screens keep working for role and active-state changes.
- Self-service password change, password expiry, MFA, account lockout and refresh tokens.
- Recording sign-ins in the audit trail (`AUD_`).
- Removing Entra/MSAL support.

### Functional behaviour

1. The SPA reads a new runtime setting `AUTH_MODE` (`development` | `password` | `entra`). When it is absent, the current behaviour is kept: `APP_ENV` `local`/`test` → `development`, otherwise `entra`.
2. In `password` mode, `/login` shows **Usuario** and **Contraseña** fields and an **Entrar** button. On submit, the SPA calls `POST /api/auth/token`, keeps the token, then loads the profile from `GET /api/me` (unchanged) and navigates to `/app`.
3. Wrong username, wrong password, an inactive user, and a user without a password all produce **the same** refusal. The form shows «Usuario o contraseña incorrectos.», keeps the username, and clears the password.
4. Too many attempts from the same client produce «Demasiados intentos. Espera un minuto y vuelve a intentarlo.»
5. The session lasts until sign-out, until the tab is closed, or until the token expires (8 h). Any `401` from the API ends the local session and returns to `/login`. This is the existing `AuthService.handleUnauthorized` path.
6. Deactivating a password user takes effect on that user's next request, as it does today: identity resolution checks `IsActive` on every request.
7. The Vite dev server on :4300 also uses `password` mode. `development` mode is kept for the e2e browser only, and `entra` mode is unchanged.

### API and data contract

**Endpoint** — `backend/Web/Features/Identity/PasswordSignInEndpoints.cs`, mapped in `Program.cs` only when `Authentication:LocalAccounts:Enabled` is true.

```http
POST /api/auth/token            (anonymous, rate-limited)
Content-Type: application/json

{ "userName": "rrhh_user", "password": "…" }

200 { "accessToken": "…", "tokenType": "Bearer", "expiresInSeconds": 28800 }
401 ProblemDetails, type "invalid_credentials"   (one response for every failure cause)
429 ProblemDetails, type "too_many_attempts"
400 ProblemDetails only for a body that is not the expected JSON shape (no field-level detail)
```

- This is the only new anonymous business route. It cannot check `ICurrentActor` first, because it is the step that produces an actor. Its fail-closed equivalents are a generic refusal, a timing-equalised check (an unknown username still runs one hash verification against a fixed dummy hash), and the rate limit.
- The token is minted by a new `LocalAccountTokenIssuer` (`backend/Web/Identity/`), modelled on `DevelopmentTokenIssuer`. It uses an HS256 key from configuration, its own issuer (`https://kepler-talento.local/accounts`), the existing audience, and a lifetime of `TokenLifetimeMinutes` (default 480). Claims: the configured `SubjectClaim` = the user's `ExternalSubject` (`local:<userName>`), `name`, `email`. **No role or permission claims.** Permissions are still resolved from `ADM_Users` → `ADM_Roles` on every request.
- `Program.cs` adds the local issuer and key to `TokenValidationParameters` next to the development issuer. Signature, issuer, audience and lifetime validation stay on, with the same 60 s clock skew. `IdentityResolutionMiddleware` resolves the token unchanged.
- Rate limiting uses ASP.NET Core's built-in `Microsoft.AspNetCore.RateLimiting` (framework, no new NuGet). It applies a fixed window of 10 attempts per minute per client IP, after `UseForwardedHeaders`, on this endpoint only.

**Application** — `backend/Application/Features/Identity/SignInWithPassword.cs`: `sealed record SignInWithPasswordCommand(string UserName, string Password) : IRequest<SignedInUser>`, its validator (non-empty, bounded lengths), and its handler. The handler normalises the username to lower case, loads the user, verifies the hash, and throws a single `InvalidCredentialsException`. `GlobalExceptionHandler` maps that exception to the `401` problem. Abstraction: `IPasswordHasher` in `Application/Abstractions/Identity/`.

**Hashing** — `Pbkdf2PasswordHasher` in `backend/Infrastructure/Identity/`. It uses BCL `Rfc2898DeriveBytes.Pbkdf2` with HMAC-SHA256, 600 000 iterations, a 16-byte random salt and a 32-byte subkey, compared with `CryptographicOperations.FixedTimeEquals`. The self-describing format is `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`, so the parameters can be raised later. **No new NuGet dependency.** `Microsoft.Extensions.Identity.Core`'s `PasswordHasher<T>` was considered and rejected: it would pull in the Identity stack for one function.

**Schema** — one EF Core migration, `AddLocalAccountCredentials` (generated with `dotnet ef migrations add`, not hand-written SQL):

| Table       | Column         | Type                | Constraint                                               |
| ----------- | -------------- | ------------------- | -------------------------------------------------------- |
| `ADM_Users` | `UserName`     | `varchar(64)` null  | unique index; check `"UserName" ~ '^[a-z0-9._-]{3,64}$'` |
| `ADM_Users` | `PasswordHash` | `varchar(256)` null | check: `PasswordHash` set ⇒ `UserName` set               |

- Grants: `ktl_runtime` already holds `SELECT, INSERT, UPDATE` (no `DELETE`) on `ADM_Users`. No grant change is needed. The migration includes an integration assertion that this is still true.
- Domain: `User` gains `UserName`, `PasswordHash` and `SetLocalCredentials(userName, passwordHash, updatedAtUtc)`. `PasswordHash` is never mapped into any response record. `UserName` may appear in the admin user list. The hash must never appear there.

**Seeding** — `DatabaseInitializer.SeedLocalAccountsAsync`, run by `--migrate` **before** `SeedBootstrapAdministratorAsync`:

- Configuration: `Authentication:LocalAccounts:Seed:<n>:{UserName, DisplayName, Email, RoleName, Password}`.
- If the account is missing, the step creates it with `ExternalSubject = local:<userName>`, the given role, active.
- If the account exists and the stored hash does not verify against the configured password, the step re-hashes it. The configuration is the source of truth, so rotating a password means editing the secret and redeploying.
- The step never changes the role or active flag of an existing account. An administrator's edits survive redeploys.
- It refuses to run with a password shorter than 12 characters. In `Production` it also refuses the committed development-only passwords and signing key.
- Because `rrhh_admin` holds `users.manage`, a fresh database no longer needs the email-based bootstrap administrator. The existing step stays, and it still fails the deploy when nobody can administer.

**Configuration** — `KeplerAuthenticationOptions.LocalAccounts` (`Enabled`, `SigningKey` ≥ 32 bytes, `Issuer`, `Audience`, `TokenLifetimeMinutes`, `Seed[]`). It is validated with `ValidateOnStart`. **Unlike the development issuer, it is allowed in Production.**

### Environments

| Environment               | API                                                                                     | SPA `AUTH_MODE`              | Accounts                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| Local Compose (`:4200`)   | Development issuer **and** local accounts enabled; dev-only signing key in compose file | `password`                   | `rrhh_admin` / `KeplerLocal-Admin-2026`, `rrhh_user` / `KeplerLocal-User-2026` (dev-only) |
| Vite dev server (`:4300`) | same API                                                                                | `password` (`public/env.js`) | same as Local Compose; the e2e browser alone is served `development` by its helper        |
| `ktl.lan` (UAT)           | Development issuer **disabled**; local accounts enabled                                 | `password`                   | passwords from `ktl.env`                                                                  |

- **Local**: `docker-compose.yml` adds the variables to `migrator` and `api`, and `AUTH_MODE: password` to `nginx`. `frontend/public/env.template.js` gains `AUTH_MODE: '${AUTH_MODE}'`, and `docker-entrypoint.d/40-envsubst.sh` substitutes it.
- **`ktl.lan`**: `deploy/lan/docker-compose.lan.yml` sets `Authentication__DevelopmentIssuer__Enabled: 'false'` and `AUTH_MODE: password`. It replaces `KTL_DEV_SIGNING_KEY` with required `KTL_AUTH_SIGNING_KEY`, `KTL_RRHH_ADMIN_PASSWORD` and `KTL_RRHH_USER_PASSWORD` (`:?` guards).
- **Rollout order matters.** `deploy.sh` runs from cron on every push to `main`. The operator must add the three variables to `/opt/apps/ktl-secrets/ktl.env` **before** the merge. Otherwise the next tick fails the deploy, and the running containers keep the old build. Generate them with `openssl rand -hex 32` for the key and `openssl rand -base64 18` for each password, then read the passwords back from `ktl.env` to hand them to HR.
- The existing «Administrador local» row on `ktl.lan` stays, but it can no longer sign in (no dev issuer). This is expected; nothing deletes it.
- **Demo data**: `scripts/seed-demo-data.js` gains `--user`/`--password`, or `KTL_SEED_USER`/`KTL_SEED_PASSWORD`, which obtain the token from `/api/auth/token` instead of `/api/dev/token`. The `ktl.lan` Step 8 command passes the `rrhh_admin` credentials.

### Frontend changes (`frontend/`)

| File                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/core/services/app-config.model.ts`   | Add `AUTH_MODE`, with the fallback from `APP_ENV` described above.                                                                                                                                                                                                                                                                                                                                                 |
| `src/app/core/auth/token-source.ts`           | Add `PasswordTokenSource` and `signIn(credentials?: PasswordCredentials)` on `TokenSource`. Keep the token in `sessionStorage`, the same per-tab scope MSAL already uses here, under one key, removed on `signOut()`. `createTokenSource` switches on `AUTH_MODE`. Map `401`/`429` to `TranslatableError('auth.login.invalidCredentials')` / `('auth.login.tooManyAttempts')`.                                     |
| `src/app/core/auth/auth.service.ts`           | `signIn(credentials?)` passes the credentials through. The rest is unchanged.                                                                                                                                                                                                                                                                                                                                      |
| `src/app/core/auth/login-page.tsx` (+ `.css`) | In password mode, a controlled form: `<input name="username" autocomplete="username" data-testid="login-username">`, `<input type="password" name="password" autocomplete="current-password" data-testid="login-password">`, the existing `data-testid="sign-in"` button, and errors via `errorText(err, t)`. Labels are bound to inputs. Development mode is unchanged. Pure helpers go in `login-page.logic.ts`. |
| `src/assets/i18n/es.json`                     | Add `auth.login.username` «Usuario», `auth.login.passwordIntro` «Acceso interno. Introduce tu usuario y contraseña.», `auth.login.invalidCredentials` «Usuario o contraseña incorrectos.», and `auth.login.tooManyAttempts` «Demasiados intentos. Espera un minuto y vuelve a intentarlo.». Reuse the existing `auth.login.password` «Contraseña» and `auth.login.submit` «Entrar».                                |

### Acceptance criteria

1. **Successful sign-in.** Given password mode and the seeded `rrhh_user`, when the correct username and password are submitted, then the user lands on `/app` and the profile shows role `rrhh_user`.
2. **Role separation.** Signed in as `rrhh_user`, the Admin group (Catálogos management, Usuarios, Roles, Importación) is not offered. Navigating to `/app/admin/users` redirects, and `GET /api/admin/users` with that token returns `403`. Signed in as `rrhh_admin`, all of them are reachable.
3. **Generic refusal.** An unknown username, a wrong password, a deactivated account and an account without a password each return the identical `401` body. The UI shows «Usuario o contraseña incorrectos.» and the password field is cleared.
4. **Rate limit.** The 11th attempt within one minute from the same client returns `429`. The UI shows the «Demasiados intentos…» message.
5. **Token is the only credential.** Business endpoints called without the token return `401`. A token signed with another key, or carrying another issuer or audience, or expired beyond 60 s skew, returns `401`.
6. **No permission claims trusted.** A local-issued token for `rrhh_user`, after an admin changes that user's role, gets the new role's permissions on the next request without signing in again.
7. **Deactivation.** An admin deactivates `rrhh_user`. That user's next API call returns `401` and the SPA returns to `/login`.
8. **Hash at rest.** `ADM_Users.PasswordHash` for both accounts starts with `pbkdf2-sha256$600000$`. Two accounts with the same password have different hashes. The plaintext appears in no table, response or log.
9. **Rotation.** Changing `KTL_RRHH_USER_PASSWORD` and redeploying makes the old password fail and the new one succeed. The account's id, role and active flag are unchanged.
10. **Idempotent seed.** Running `--migrate` twice creates no duplicate accounts and leaves an admin-changed role intact.
11. **Production guards.** In `Production`, start-up or `--migrate` fails if local accounts use the committed development signing key or passwords, or if a seeded password is shorter than 12 characters. Local accounts with real secrets start normally in `Production`.
12. **`ktl.lan`.** After deploy, `http://ktl.lan` shows the username/password form rather than signing in automatically, and `POST /api/dev/token` issues no token (anonymous `401`, as for any route that does not exist).
13. **No regression.** On the Vite dev server (`:4300`), the existing e2e suite passes with its browser served `development` mode by the test helper.

### Test coverage

| Layer                                                                 | Tests                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| xUnit unit (`backend/Tests/UnitTests/`)                               | `Pbkdf2PasswordHasher`: round trip, wrong password, salt uniqueness, malformed hash rejected, parameters parsed from the stored format. `SignInWithPasswordHandler` with hand-written doubles: each failure cause throws the same exception, and an unknown user still invokes the hasher. Options validation: key length, Production guards. |
| xUnit integration (`backend/Tests/IntegrationTests/`, Testcontainers) | `PasswordSignInApiTests`: AC 1–7 against the real pipeline. `LocalAccountSeedTests`: AC 8–10. Schema test: check constraints, unique index, and `ktl_runtime` still lacks `DELETE` on `ADM_Users`. Admin user responses contain no `PasswordHash`. Logs captured during sign-in contain neither the username nor the password.                |
| Vitest unit (`frontend/tests/unit/`)                                  | `token-source.spec.ts`: `PasswordTokenSource` posts credentials, stores and clears the token, and maps `401`/`429` to `TranslatableError`. `app-config` fallback from `APP_ENV`. `login-page.spec.tsx`: password mode renders labelled fields, submits, shows the generic error and clears the password; development mode is unchanged.       |
| Vitest security (`frontend/tests/security/`)                          | The bundle and `env.js` carry no password, signing key or hash. Every API request carries the bearer token, and a `401` clears `sessionStorage`.                                                                                                                                                                                              |
| Playwright (`frontend/tests/e2e/`)                                    | `password-sign-in.spec.ts` forces `AUTH_MODE=password` by routing `**/env.js`. It signs in as `rrhh_user` and as `rrhh_admin` with the dev-only passwords and asserts the Admin group's visibility, the wrong-password message, and sign-out. It locates elements by `data-testid` and role, with no hardcoded Spanish in selectors.          |

Security evidence is mandatory before marking done: tests showing unauthenticated (`401`) and unauthorized (`403`) refusals, plus the grant inspection above.

### Documentation

- `openspec/specs/identity-and-access-control/spec.md` (via the change's delta spec):
  - Amend _Token-based caller authentication_ to allow the application's own local-account issuer next to the OIDC provider.
  - Amend _Browser sign-in and profile_ (scenario "Browser is asked for credentials it would validate") and _Bootstrap administrator and recovery_ ("SHALL hold no password") so they hold for Entra mode only.
  - Add a _Local accounts_ requirement covering hashing, generic refusal, rate limiting and seeding.
- `openspec/specs/development-demo-data/spec.md`: the seed script can authenticate with a password.
- `docs/ktl-45/authentication-local-accounts.md`: contract, configuration keys, hash format, rotation procedure. `docs/ktl-45/release-notes.md`: the `ktl.lan` rollout order.
- `docs/ktl-16/authentication-and-authorization.md`: point to KTL-45 for the third mode.
- `docs/deploy-lan-server.md`: update the intro paragraph ("every visitor is signed in…"), Step 1 (new secrets), Step 7 (sign-in), Step 8 (seed with credentials) and the daily-operations note on rotating a password.
- `README.md` (Spanish): local Compose credentials marked as development-only, and how to sign in at `:4200`.

### Non-functional requirements

- **Security.**
  - Passwords are never logged, returned, or stored reversibly. The username counts as identifying data and goes through `PersonalDataRedactionEnricher`.
  - Sign-in logs carry only the correlation id, the outcome and, on success, the internal user id.
  - The signing key reaches neither the browser nor a response.
  - `Authentication:LocalAccounts:SigningKey` must differ from `Authentication:DevelopmentIssuer:SigningKey`.
  - No account lockout, on purpose: with shared generic accounts it would let anyone lock HR out. The per-IP rate limit is the brute-force control.
- **Transport.** `ktl.lan` is plain HTTP, so credentials cross the LAN in clear text. This is accepted for a demo-data UAT server and recorded in the release notes. Any environment with real candidate data needs TLS before it uses this mode.
- **Performance.** One PBKDF2 verification takes about 100–300 ms of CPU. That is acceptable at this request volume, and the rate limit bounds abuse.
- **Accessibility.** Visible `<label>`s bound to the inputs, correct `autocomplete` values, the error announced via the existing `FormError` (live region), and the form usable by keyboard only.
- **Responsive.** The login panel keeps working at the shell's 768 px breakpoint and on narrow phones, with no horizontal scroll.
- **Language.** All new copy is in Spanish with correct accents, in `es.json`. Nothing is hardcoded in JSX.
