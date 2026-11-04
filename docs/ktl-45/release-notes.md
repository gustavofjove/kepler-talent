# KTL-45 release notes

Adds username and password sign-in. One migration (`AddLocalAccountCredentials`) adds two nullable
columns to `ADM_Users`. No grant, role or permission changes. Contract:
[authentication-local-accounts.md](authentication-local-accounts.md).

## What changes

- **Sign in with a user name and password.**
  - `POST /api/auth/token` issues an ordinary bearer token. Authorization is unchanged:
    permissions still come from the stored user and role on every request.
  - In password mode, `/login` shows «Usuario» and «Contraseña».
  - A wrong attempt shows «Usuario o contraseña incorrectos.», keeps the user name and clears the
    password. It never says which field was wrong.
  - Repeated attempts show «Demasiados intentos. Espera un minuto y vuelve a intentarlo.»
- **Two generic accounts.**
  - `rrhh_admin` (role `rrhh_admin`: candidates, catalogs, import, users and roles).
  - `rrhh_user` (role `rrhh_user`: candidates and documents, no administration).
  - The migrator creates them on every deploy and re-hashes a password when the configured one
    changes. An administrator's role or deactivation edits are kept.
- **Passwords are hashed, never stored.** They are stored only as PBKDF2-HMAC-SHA256 hashes with
  600 000 iterations and a per-account salt. Neither the hash nor the password appears in a
  response or a log.
- **Sign-in mode is configuration.** A new runtime setting, `AUTH_MODE` (`development`,
  `password`, `entra`), selects the sign-in mode. When it is absent, every existing deployment
  behaves as before.
- **Local Compose.**
  - `http://localhost:4200` signs in with `rrhh_admin` / `KeplerLocal-Admin-2026` or `rrhh_user`
    / `KeplerLocal-User-2026`. These are development-only values, and Production refuses them.
  - The Vite dev server on `:4300` asks for the same user name and password. Only the e2e
    browser keeps the automatic development sign-in, through its own `env.js`.
- **Demo data seeding.** `npm run seed:demo` accepts `KTL_SEED_USER` and `KTL_SEED_PASSWORD` (or
  `--user` / `--password`) for a target without the development issuer.

## LAN server (`ktl.lan`): rollout order

The cron deploy rebuilds on every push to `main`, and the new overlay **requires three new
secrets**. Without them, `docker compose` fails the deploy, and the previous containers keep
running the old build.

1. **Before merging**, on the server, append the secrets to `/opt/apps/ktl-secrets/ktl.env`:

   ```bash
   cat >> /opt/apps/ktl-secrets/ktl.env <<EOF
   KTL_AUTH_SIGNING_KEY=$(openssl rand -hex 32)
   KTL_RRHH_ADMIN_PASSWORD=$(openssl rand -base64 18)
   KTL_RRHH_USER_PASSWORD=$(openssl rand -base64 18)
   EOF
   ```

2. Merge. The next cron tick applies the migration and seeds both accounts.
3. Read the two passwords from `ktl.env` and hand them to HR through the password manager.
4. Verify:
   - `http://ktl.lan` shows the form instead of signing in automatically.
   - `POST /api/dev/token` issues no token: an anonymous `401`, as for any route that does not
     exist.
   - Both accounts sign in.
   - `rrhh_user` has no Admin menu.

## Behaviour changes on `ktl.lan`

- **No more automatic sign-in.** The development issuer is off there, so visitors are no longer
  signed in as «Administrador local».
- **The «Administrador local» row stays but cannot be used.** Nothing signs in as it any more.
  Nothing deletes it, and it still counts as an administrator.
- **Plain HTTP.** The server still serves HTTP, so user names and passwords cross the LAN
  unencrypted. That is accepted for a server holding fabricated demo data only. Any environment
  with real candidate data needs TLS before it uses this mode.
- **Demo data.** Seed it with `KTL_SEED_USER=rrhh_admin KTL_SEED_PASSWORD=…`; see
  [deploy-lan-server.md](../deploy-lan-server.md).

## Rollback

Revert the merge and redeploy:

- The migration's `Down` drops both columns and their constraints.
- The previous overlay re-enables the development issuer. `KTL_DEV_SIGNING_KEY` is still in
  `ktl.env`, because step 1 only appends.
- The three new secrets can stay; nothing reads them after the revert.
