# KTL-45 local accounts: username and password sign-in

Kepler Talento has three ways to sign in, chosen per environment by configuration:

| Mode          | SPA `AUTH_MODE` | API issuer                                             | Where                                                     |
| ------------- | --------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `entra`       | `entra`         | Microsoft Entra ID (KTL-16)                            | A future Production                                       |
| `password`    | `password`      | The API's own local-account issuer (this document)     | Local Compose on `:4200`, Vite on `:4300`, the LAN server |
| `development` | `development`   | The development issuer, `POST /api/dev/token` (KTL-16) | The e2e browser only                                      |

When `AUTH_MODE` is absent, the SPA keeps its previous behaviour: `APP_ENV` `local` or `test`
selects `development`, and anything else selects `entra`.

Every human-facing environment uses `password`. The e2e suite still needs to act as several roles
without a password each, so `tests/e2e/support/auth.ts` serves its browser its own `env.js` with
`AUTH_MODE: 'development'`. The local API keeps the development issuer enabled for that, and for
`npm run seed:demo`. Anyone on the machine can therefore still mint a token by calling
`/api/dev/token` directly; that is accepted locally, and the issuer is off on the LAN server and
refused in Production.

Password sign-in issues an ordinary bearer token. It goes through the same JwtBearer validation
as every other token (signature, issuer, audience, lifetime, 60 s clock skew). After that, the
caller is resolved to an `ADM_Users` row and their permissions are read from `ADM_Roles` on every
request, exactly as in KTL-16. Nothing about authorization changes.

## Endpoint contract

```http
POST /api/auth/token
Content-Type: application/json

{ "userName": "rrhh_user", "password": "…" }
```

| Status | Body                                                                       | When                                                                                                    |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `200`  | `{ "accessToken": "…", "tokenType": "Bearer", "expiresInSeconds": 28800 }` | Active local account, correct password                                                                  |
| `400`  | ProblemDetails, `code: validation.failed`                                  | Empty field, user name over 64 or password over 256 characters, or a body that is not JSON              |
| `401`  | ProblemDetails, `code: auth.invalid_credentials`                           | Unknown user name, wrong password, inactive account, account without a password: **one identical body** |
| `429`  | ProblemDetails, `code: auth.too_many_attempts`, `Retry-After: 60`          | More than `SignInAttemptsPerMinute` attempts from one client address                                    |

- **Anonymous by necessity.** The endpoint is how a caller acquires a token, so it cannot first
  check `ICurrentActor`. It compensates in three ways:
  - Every failure gets one refusal.
  - An unknown user name still costs one full hash verification, against a dummy hash, so timing
    does not reveal whether an account exists.
  - The rate limiter refuses an attempt before the password is ever checked.
- **Mapped only when `Authentication:LocalAccounts:Enabled` is `true`.** Otherwise the route does
  not exist. An anonymous caller then gets the fallback policy's `401`, as for any unknown route,
  and an authenticated caller gets `404`.
- **No account lockout.** The accounts are shared and generic, so a lockout would let anyone lock
  HR out. The per-IP rate limit is the brute-force control.
- **Single-instance limiter.** The rate limiter keeps its counters in memory, per API instance.
  Every current topology runs one instance; a multi-instance deployment needs a distributed
  limiter.

## Token

The token is HS256, signed with `Authentication:LocalAccounts:SigningKey`. Its header carries
`kid: ktl-local-accounts`.

| Claim                         | Value                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `iss`                         | `Authentication:LocalAccounts:Issuer` (default `https://kepler-talento.local/accounts`) |
| `aud`                         | `Authentication:LocalAccounts:Audience` (default `kepler-talento-api`)                  |
| `Authentication:SubjectClaim` | `local:<userName>`, the user's `ExternalSubject`                                        |
| `name`, `email`               | The stored display name and email                                                       |
| `nbf`, `exp`                  | Lifetime `TokenLifetimeMinutes`, default 480 (8 h)                                      |

The token carries **no role and no permission**. A role change or a deactivation applies on the
token's next request.

There is no refresh token: an expired session signs in again. The SPA keeps the token in
`sessionStorage` under `ktl.auth.session`, so the session lasts for that tab only and survives a
reload. The key is removed on sign-out and on any `401`.

**Each application-owned key vouches only for its own issuer.** The development key
(`kid: ktl-development`) and the local-account key are bound to their issuers. A token naming the
local issuer but signed with the development key, whose value is in `docker-compose.yml`, is
refused. Start-up also refuses equal keys or equal issuer names for the two.

## Storage

Two columns on `ADM_Users` (migration `AddLocalAccountCredentials`):

| Column         | Type                | Constraint                                                                                     |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| `UserName`     | `varchar(64)` null  | Unique where present (`UX_ADM_Users_UserName`); `CK_ADM_Users_UserName`: `^[a-z0-9._-]{3,64}$` |
| `PasswordHash` | `varchar(256)` null | `CK_ADM_Users_PasswordHash`: a hash requires a user name                                       |

**Hash format.** `pbkdf2-sha256$<iterations>$<salt>$<subkey>`. Both the salt and the subkey are
Base64, 16 and 32 bytes, and the iteration count is 600 000.

- **Base class library only.** It uses `Rfc2898DeriveBytes.Pbkdf2`, so there is no new
  dependency.
- **Raising the work factor later is safe.** Verification reads the iteration count from the
  stored value, so existing hashes keep verifying.
- **A malformed or unknown hash fails verification.** It counts as a mismatch and never throws.

**Exposure.** The hash never appears in a response, and the user name and password never appear
in a log: `userName`, `password` and `passwordHash` are in `PersonalDataRedaction`. `ktl_runtime`
keeps `SELECT, INSERT, UPDATE` on `ADM_Users` and still has no `DELETE`; no grant changed.

## Configuration

```text
Authentication:LocalAccounts:Enabled                  API: maps the endpoint and trusts the issuer
Authentication:LocalAccounts:SigningKey               API: ≥ 32 bytes, ≠ the development key
Authentication:LocalAccounts:Issuer                   default https://kepler-talento.local/accounts
Authentication:LocalAccounts:Audience                 default kepler-talento-api
Authentication:LocalAccounts:TokenLifetimeMinutes     default 480, 1–1440
Authentication:LocalAccounts:SignInAttemptsPerMinute  default 10, 1–1000
Authentication:LocalAccounts:Seed:<n>:UserName        migrator
Authentication:LocalAccounts:Seed:<n>:DisplayName     migrator
Authentication:LocalAccounts:Seed:<n>:Email           migrator
Authentication:LocalAccounts:Seed:<n>:RoleName        migrator: must exist in ADM_Roles
Authentication:LocalAccounts:Seed:<n>:Password        migrator: ≥ 12 characters
```

The API needs the signing key and never the passwords. The migrator needs the passwords and
never the key. Seeding runs whenever `Seed` has entries.

**Production refusals.** In `Production`, start-up refuses the committed development-only signing
key, and `--migrate` refuses the committed development-only passwords. Both lists are in
`LocalAccountDefaults.DevelopmentOnlyValues`.

## Seeding rules

`--migrate` runs `SeedLocalAccountsAsync` on every deploy:

1. **Every entry is validated before anything is written.** The user name must be valid and
   unique, the password at least 12 characters and not forbidden, and the role must exist. A bad
   entry fails the deploy and stores nothing. The message names the account, never the password.
2. **A missing account is created active**, with the configured role and
   `ExternalSubject = local:<userName>`.
3. **An existing account whose stored hash does not verify** against the configured password is
   re-hashed.
4. **An existing account's role and active flag are never changed**, so an administrator's edits
   survive every deploy.

**Order with the bootstrap administrator.** When `Authentication:BootstrapAdministrator:Email` is
configured, that administrator is seeded first, as in KTL-16, and the local accounts follow.
Without it, the local accounts go first. The bootstrap step then only checks that someone holds
`users.manage`, and a seeded `rrhh_admin` satisfies that check.

### Rotating a password

1. Change the value in the environment's secret. On the LAN server that is
   `KTL_RRHH_ADMIN_PASSWORD` or `KTL_RRHH_USER_PASSWORD` in `/opt/apps/ktl-secrets/ktl.env`.
2. Redeploy (`deploy.sh --force`). The migrator re-hashes the account.

The old password is refused from then on. Tokens already issued stay valid until they expire,
at most 8 h. To cut a session short, deactivate the account in Usuarios.

## Accounts

| User name    | Role         | Local Compose password (development only) |
| ------------ | ------------ | ----------------------------------------- |
| `rrhh_admin` | `rrhh_admin` | `KeplerLocal-Admin-2026`                  |
| `rrhh_user`  | `rrhh_user`  | `KeplerLocal-User-2026`                   |

On the LAN server the passwords come from `ktl.env`. They are never in the repository.

## Not in this slice

- Creating a user with a password, or changing or resetting a password, through the API or UI.
- Self-service password change, expiry, MFA and refresh tokens.
- Sign-in audit events.
