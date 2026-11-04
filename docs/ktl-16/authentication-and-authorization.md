# KTL-16 authentication and authorization

## Token contract

Production uses Microsoft Entra ID access tokens validated by ASP.NET Core JWT bearer authentication. The API validates issuer, audience, lifetime, signature, and signing key before dispatch; clock skew is 60 seconds. Signing keys come from the authority discovery document and refresh without an API restart.

The stable user key is the configured `Authentication:SubjectClaim`, `oid` by default. The external subject, token material, email, and display name are personal data and are redacted from logs. API responses expose the application-owned user UUID, never the external subject.

Local and e2e environments acquire a signed token from `POST /api/dev/token`. That endpoint is anonymous only in `Development` or `Testing`; configuration validation refuses the development issuer and `DevelopmentActor` in `Production`.

KTL-45 adds a third issuer: username and password sign-in at `POST /api/auth/token`. It is allowed in any environment, and its tokens go through the same pipeline and carry no permissions. The SPA chooses between the three with `AUTH_MODE`. See [docs/ktl-45/authentication-local-accounts.md](../ktl-45/authentication-local-accounts.md).

## Identity and effective permissions

After token validation, `IdentityResolutionMiddleware` resolves the subject to `ADM_Users`. An unknown subject is provisioned once with the `readonly` role; the bootstrap administrator is linked by email on first sign-in. An inactive user is treated as unauthenticated. An inactive role authenticates the user but grants no permissions.

Effective permissions are loaded from the user's active `ADM_Roles` row on every request and cached only for that request. Token claims never grant application permissions. Consequently, a role edit or user deactivation applies on the next request with the same token.

Every business endpoint requires authentication. Administration endpoint groups additionally require `users.manage` or `roles.manage`, and application handlers repeat the same guard before validation or dispatch. UI visibility is only presentation.

## Permission table

| Permission           | Enforcement state                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `candidates.read`    | API guard on candidate and search reads                                                               |
| `candidates.create`  | API guard on candidate creation                                                                       |
| `candidates.update`  | API guard on candidate updates and related data                                                       |
| `candidates.delete`  | API guard on logical deactivation and restoration; no physical delete                                 |
| `documents.download` | API guard on clean-document download                                                                  |
| `documents.upload`   | API guard on quarantined upload                                                                       |
| `catalogs.read`      | API guard on catalog reads                                                                            |
| `catalogs.manage`    | API guard on catalog writes                                                                           |
| `presets.manage`     | API guard on shared preset administration                                                             |
| `users.manage`       | API and handler guard on user administration                                                          |
| `roles.manage`       | API and handler guard on role administration                                                          |
| `candidates.import`  | API policy and handler guard on every `/api/import/batches` endpoint (KTL-17)                         |
| `candidates.export`  | Browser guard on the current client-side CSV export; a server export ticket must add the API boundary |
| `audit.read`         | API policy and handler guard on `GET /api/audit/events`; seeded on `system_admin` only (KTL-19)       |

**Permission pairing in the SPA (KTL-22).** Document upload, set-primary and removal are offered
only on the candidate edit page, whose route requires `candidates.update`. A role that holds
`documents.upload` without `candidates.update` therefore sees no upload control, although the API
would still accept its upload. Grant both when a role should upload CVs. None of the seeded roles
is affected. `documents.download` is unaffected: download and the CV preview stay on the read-only
detail page.

`view_all_candidates` was removed because KTL-10 has no ownership scope. The old underscore-style frontend vocabulary was replaced by the API's `<resource>.<action>` strings.
