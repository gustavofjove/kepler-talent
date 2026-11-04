## 0. Create Feature Branch

- [ ] 0.1 Work on branch `feat/KTL-45` (the user creates the branch and commits; the agent does not)

## 1. Domain, schema and hashing

- [x] 1.1 `backend/Domain/Identity/User.cs`: add `UserName`, `PasswordHash` and `SetLocalCredentials(userName, passwordHash, at)`. The user name is trimmed, lower-cased and checked against `^[a-z0-9._-]{3,64}$`; the hash is non-blank and at most 256 characters (design D7).
- [x] 1.2 `UserConfiguration.cs`: map both columns with the unique index `IX_ADM_Users_UserName` and the checks `CK_ADM_Users_UserName` and `CK_ADM_Users_PasswordHash`. Generate `AddLocalAccountCredentials` with `dotnet ef migrations add`, then review the generated `Up`/`Down`. Confirm no grant change is needed: `ktl_runtime` already has `SELECT, INSERT, UPDATE` and no `DELETE`.
- [x] 1.3 Add `Application/Abstractions/Identity/IPasswordHasher.cs` (`Hash`, `Verify`) and `Infrastructure/Identity/Pbkdf2PasswordHasher.cs` (PBKDF2-SHA256, 600 000 iterations, 16-byte salt, 32-byte subkey, `FixedTimeEquals`, self-describing format, iterations parsed on verify). Register it in `Infrastructure/DependencyInjection.cs` (design D3).
- [x] 1.4 Unit tests in `backend/Tests/UnitTests/`: the hasher (round trip, wrong password, distinct salts, malformed or unknown-algorithm hash returns false, verifies a hash with different iterations), and the new `User` methods and their validation.

## 2. Sign-in use case and token issuer

- [x] 2.1 `Application/Common/Errors/ApplicationExceptions.cs`: add `InvalidCredentialsException` (code `auth.invalid_credentials`). Map it to `401` with a fixed Spanish title in `GlobalExceptionHandler`.
- [x] 2.2 `IUserRepository.FindByUserNameAsync` and its implementation in `Infrastructure/Persistence`.
- [x] 2.3 `Application/Features/Identity/SignInWithPassword.cs`: the command record, the validator (non-empty, user name ≤ 64, password ≤ 256), and the handler. The handler normalises the user name, always runs one `Verify` (against a dummy hash when the user is missing), and throws `InvalidCredentialsException` for a missing user, a missing hash, a failed verification or an inactive account. It returns `SignedInUser(Id, ExternalSubject, DisplayName, Email)` (design D4).
- [x] 2.4 `Web/Identity/AuthenticationOptions.cs`: add `LocalAccountsOptions` (`Enabled`, `SigningKey`, `Issuer`, `Audience`, `TokenLifetimeMinutes = 480`, `Seed[]`) and `LocalAccountDefaults.DevelopmentOnlyValues`. `Program.cs` validation must refuse a key under 32 bytes, a local key equal to the development key, and any development-only value in Production (design D6).
- [x] 2.5 Add `Web/Identity/LocalAccountTokenIssuer.cs`, modelled on `DevelopmentTokenIssuer`. Each key gets its own `KeyId`. Claims are the subject, `name` and `email` only.
- [x] 2.6 `Program.cs`: when local accounts are enabled, register the issuer and add its issuer, audience and key to `TokenValidationParameters`. Add an `IssuerSigningKeyResolver` that returns only the key for the token's `iss`, and keep `ClockSkew` at 60 s (design D1).
- [x] 2.7 `Program.cs`: `AddRateLimiter` with a per-IP fixed window of 10 per minute and no queue. `OnRejected` writes the `429` ProblemDetails (`auth.too_many_attempts`) through `IProblemDetailsService`. Add `UseRateLimiter()` after `UseForwardedHeaders` (design D5).
- [x] 2.8 Add `Web/Features/Identity/PasswordSignInEndpoints.cs`: `MapGroup("/api/auth")`, `POST /token` with `AllowAnonymous`, `RequireRateLimiting`, `.WithName("SignInWithPassword")`, and `.Produces` for 200, 400, 401 and 429. It dispatches via `ISender` and returns `{ accessToken, tokenType, expiresInSeconds }`. Map it in `Program.cs` only when local accounts are enabled.
- [x] 2.9 `Web/Observability/PersonalDataRedaction.cs`: add `userName`, `password` and `passwordHash` to `ProtectedNames`. The endpoint logs only the outcome and, on success, the user id (design D10).
- [x] 2.10 Unit tests:
  - The handler with hand-written doubles: each failure cause throws the same exception, and an unknown user still calls `Verify` once.
  - Options validation: short key, equal keys, development values in Production.
  - The token issuer: claims, no role or permission claim, lifetime, `kid`.

## 3. Seeding

- [x] 3.1 `DatabaseInitializer.SeedLocalAccountsAsync`:
  - Validate length ≥ 12 and that the role exists.
  - Create a missing account with `ExternalSubject = local:<userName>`, or re-hash an existing one when the stored hash does not verify or is null.
  - Never touch role or active flag.
  - Refuse development-only passwords in Production.

  Call it from the `--migrate` branch of `Program.cs` between `SeedCatalogsAsync` and `SeedBootstrapAdministratorAsync` (design D6).

- [x] 3.2 Check that `SeedBootstrapAdministratorAsync` treats a seeded `rrhh_admin` as the active administrator. Update its failure message to mention seeded local accounts.

## 4. Backend integration tests and security evidence

- [x] 4.1 Review and update the existing tests affected by the change: `AdminApiTests`, `MigrationSecurityEvidenceTests`, and the identity, options and start-up tests that enumerate issuers or configuration. Run them and confirm they still pass.
- [x] 4.2 `backend/Tests/IntegrationTests/PasswordSignInApiTests.cs`:
  - Correct credentials, then `/api/me` returns the right role and permissions.
  - Unknown user, wrong password, inactive account and account without a hash all return byte-identical `401` bodies.
  - The 11th attempt returns `429`.
  - A token naming the local issuer but signed with the dev key is refused `401`, and the reverse too.
  - An expired token is refused `401`.
  - A role change after sign-in applies on the next request.
  - Deactivation means the next request is `401`.
  - When local accounts are disabled, the endpoint is absent: anonymous `401` (fallback policy), authenticated `404`, no token.
- [x] 4.3 Authorization evidence: with a `rrhh_user` token, `GET /api/admin/users`, `GET /api/admin/roles`, `/api/import/batches` and a catalog write return `403`. Without a token, business endpoints return `401`.
- [x] 4.4 `backend/Tests/IntegrationTests/LocalAccountSeedTests.cs`:
  - Fresh database: both accounts created with their roles.
  - A second run creates no duplicates.
  - Rotation: the old password fails, the new one succeeds, and the id, role and active flag are unchanged.
  - An admin role change or deactivation survives a reseed.
  - A short password fails the step.
  - An unknown role fails the step.
  - Development-only values are refused in Production.
- [x] 4.5 Schema and least-privilege evidence:
  - The checks and the unique index exist.
  - The stored hash starts with `pbkdf2-sha256$600000$`.
  - Two accounts with the same password have different hashes.
  - `ktl_runtime` still lacks `DELETE` on `ADM_Users`.
  - Every admin user response, serialised, contains no `passwordHash` or password.
- [x] 4.6 Log evidence: capture Serilog output during successful and failed sign-ins, and assert that neither the user name nor the password appears.
- [x] 4.7 Run `npm run test:backend` from `frontend/` (Docker running) and inspect the output. Then inspect the resulting PostgreSQL state (`ADM_Users` columns, constraints, seeded rows) in the Testcontainers run or the local stack.

## 5. Frontend

- [x] 5.1 `src/app/core/services/app-config.model.ts`: add `AUTH_MODE` with the fallback from `APP_ENV` (`local`/`test` → `development`, otherwise `entra`).
- [x] 5.2 `src/app/core/auth/token-source.ts`:
  - Add `PasswordCredentials`, the optional `signIn(credentials?)` parameter, and `PasswordTokenSource`.
  - `PasswordTokenSource` posts to `${API_BASE_URL}/auth/token`, keeps the token and its expiry in `sessionStorage` under `ktl.auth.session` (guarded with try/catch), and removes it on `signOut()`.
  - Map `401` and `429` to `TranslatableError`.
  - `createTokenSource` switches on `AUTH_MODE` (design D8).
- [x] 5.3 `src/app/core/auth/auth.service.ts`: `signIn(credentials?)` passes the credentials through. Add a way to resume from a stored token. `handleUnauthorized` clears the stored token even when no profile is loaded.
- [x] 5.4 `src/app/core/auth/login-page.tsx`, `login-page.css` and a new `login-page.logic.ts`.
  - Password mode renders a controlled form:
    - Labelled `username` input with `data-testid="login-username"` and `autocomplete="username"`.
    - `password` input with `data-testid="login-password"` and `autocomplete="current-password"`.
    - The existing `sign-in` button.
  - Errors render through `errorText(err, t)` and `FormError`, the user name is kept, and the password is cleared on failure.
  - On mount, it resumes a stored session.
  - Development mode is unchanged.
- [x] 5.5 `src/assets/i18n/es.json`: add `auth.login.username` («Usuario»), `auth.login.passwordIntro` («Acceso interno. Introduce tu usuario y contraseña.»), `auth.login.invalidCredentials` («Usuario o contraseña incorrectos.») and `auth.login.tooManyAttempts` («Demasiados intentos. Espera un minuto y vuelve a intentarlo.»). Add the English values to `en.json`.
- [x] 5.6 `frontend/public/env.template.js` and `frontend/docker-entrypoint.d/40-envsubst.sh`: add `AUTH_MODE`. Leave `public/env.js` as it is (development mode on `:4300`).

## 6. Frontend tests

- [x] 6.1 Review and update the existing unit specs affected by the change: any spec that builds `AppConfig`, stubs `TokenSource` or `AuthService.signIn`, or renders `LoginPage`. Find them with `grep -rl "TokenSource\|signIn\|LoginPage\|readAppConfig" frontend/tests`.
- [x] 6.2 `frontend/tests/unit/token-source.spec.ts`: `PasswordTokenSource` posts the credentials, stores and clears the token, maps `401` and `429`, and `createTokenSource` picks the right source per `AUTH_MODE`. Add an `app-config` fallback spec.
- [x] 6.3 `frontend/tests/unit/login-page.spec.tsx`:
  - Password mode renders labelled fields and submits the credentials.
  - The invalid-credentials message comes from `es.json`, with the user name kept and the password cleared.
  - The too-many-attempts message renders.
  - A stored session resumes.
  - Development mode still shows only the button.
- [x] 6.4 `frontend/tests/security/`: no password, signing key or hash in `env.template.js` or the built config. A `401` from the API clears `ktl.auth.session` and returns to `/login`.
- [x] 6.5 Run `npx vitest run tests/unit/token-source.spec.ts tests/unit/login-page.spec.tsx` from `frontend/`, then the full `npm test`, and inspect the output.

## 7. Environments and scripts

- [x] 7.1 `docker-compose.yml`:
  - `migrator`: `Authentication__LocalAccounts__Seed__0__*` (`rrhh_admin`, role `rrhh_admin`, password `KeplerLocal-Admin-2026`) and `__1__*` (`rrhh_user`, role `rrhh_user`, password `KeplerLocal-User-2026`), with display names and `@kepler-talento.local` emails.
  - `api`: `Authentication__LocalAccounts__Enabled`, plus a development-only `SigningKey` distinct from the dev issuer's.
  - `nginx`: `AUTH_MODE: password`.
  - Mark every development-only value with a comment.
- [x] 7.2 `deploy/lan/docker-compose.lan.yml`:
  - Set `Authentication__DevelopmentIssuer__Enabled: 'false'` and drop the `KTL_DEV_SIGNING_KEY` requirement.
  - Add `KTL_AUTH_SIGNING_KEY`, `KTL_RRHH_ADMIN_PASSWORD` and `KTL_RRHH_USER_PASSWORD` with `:?` guards.
  - Set nginx `AUTH_MODE: password`.
  - Update the overlay comments.
- [x] 7.3 `.env.example`: document the new variables, with no real values.
- [x] 7.4 `scripts/seed-demo-data.js`: `--user`/`--password`, or `KTL_SEED_USER`/`KTL_SEED_PASSWORD`, authenticate via `/api/auth/token`. The default stays `/api/dev/token`. Keep the loopback guard, never print the password, and exit non-zero with nothing created on refusal. Update `scripts/e2e-cleanup.js` only if it is affected.

## 8. End to end

- [x] 8.1 Add `frontend/tests/e2e/password-sign-in.spec.ts`. It routes `**/env.js` to inject `AUTH_MODE: 'password'` and locates elements by `data-testid` and role only, with no Spanish selectors.
  - A wrong password shows the error, and the password field is empty.
  - `rrhh_user` signs in, sees no Admin group, and is redirected from `/app/admin/users`.
  - `rrhh_admin` signs in and reaches Usuarios.
  - Sign-out returns to `/login`.
- [ ] 8.2 Rebuild the stack (`docker compose up --build`) so the migrator seeds the local accounts, then run `npx playwright test tests/e2e/password-sign-in.spec.ts` from `frontend/` and inspect the result.
- [ ] 8.3 Run the full `npm run e2e` from `frontend/` to prove that development mode on `:4300` is unchanged, and inspect the results.
- [x] 8.4 Sign in manually on `http://localhost:4200` with both local accounts and confirm the form, the role separation and that `/api/dev/token` still works locally. Confirm that the global teardown left no marked test records.

## 9. Documentation

- [x] 9.1 Add `docs/ktl-45/authentication-local-accounts.md`: endpoint contract, error codes, token claims, hash format, configuration keys, seeding rules, password rotation procedure, rate-limit behaviour and the single-instance caveat.
- [x] 9.2 Add `docs/ktl-45/release-notes.md`. It covers the `ktl.lan` rollout order (secrets **before** merge), the end of auto-sign-in, the clear-text HTTP caveat, the orphaned «Administrador local» row, and rollback.
- [x] 9.3 `docs/deploy-lan-server.md`: update the intro ("every visitor is signed in…"), Step 1 (generate the new secrets), Step 2 notes, Step 7 (sign-in with the form), Step 8 (seed with `--user`/`--password`) and daily operations (rotating a password).
- [x] 9.4 `docs/ktl-16/authentication-and-authorization.md`: point to KTL-45 for the third sign-in mode. `README.md` (Spanish): local sign-in with the development-only credentials on `:4200`, and `AUTH_MODE`.
- [x] 9.5 Run `openspec validate ktl-45-password-sign-in --strict` and fix any finding.

## 10. Quality gates

- [x] 10.1 Run `npm run build:all` from `frontend/` (warnings are errors) and inspect the output.
- [x] 10.2 Run `npm run security:rls && npm run security:storage` from `frontend/` and inspect the output.
- [x] 10.3 Run `npm run lint` and `npm run format:check` from `frontend/` and fix any finding.
