# Deploying Kepler Talento on the LAN test server

**Scope:** run one Kepler Talento environment, `ktl.lan`, on the LAN server that already hosts the
HMS `dev` / `uat` / `test` stacks. Kepler reuses the server's PostgreSQL and Nginx Proxy Manager
(NPM) and adds nothing to the HMS stacks.

**What this environment is:** a test server for **fabricated demo data only**. Visitors sign in
with one of two generic accounts, `rrhh_admin` or `rrhh_user` (KTL-45), whose passwords live in
the server's secrets. The traffic is plain HTTP, so those passwords cross the LAN unencrypted.
Uploaded files are not scanned for malware (until a shared ClamAV exists), and nothing is backed
up. Never load real candidates into it.

**Effort:** about two hours for the first deploy, most of it the first image build.

---

## 1. Shape

```
             clients (hosts file: ktl.lan → <SERVER_IP>)
                              │ :80
                ┌─────────────▼─────────────┐
                │ hts-npm (Nginx Proxy Mgr) │   shared, owned by the HMS repo
                └─────────────┬─────────────┘
                      lan_edge_net (external)
                              │  alias ktl-nginx
     ┌────────────────────────▼───────────────────────┐ compose project: ktl
     │ nginx :8080 ── SPA + /api ──► api :8080         │ (/opt/apps/ktl)
     │                (ktl_edge)       │  documents    │
     │                     migrator ───┤  volume       │
     └─────────────────────────────────┼──────────────┘
                      lan_data_net (external)
                              │
                ┌─────────────▼─────────────┐
                │ hts-postgres (16)          │   shared; database kepler_talento,
                └───────────────────────────┘   roles ktl_migrator / ktl_runtime
```

Kepler is **one application**: its nginx container serves the React build and forwards `/api` to
the .NET API on the same origin. One hostname and one NPM proxy host are enough; there is no
separate API hostname.

| Piece         | Where                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| Compose files | `docker-compose.yml` + `deploy/lan/docker-compose.lan.yml`, project `ktl`     |
| Deploy script | `deploy/lan/deploy.sh` (cron, every 5 minutes)                                |
| Checkout      | `/opt/apps/ktl`, tracking `main`                                              |
| Secrets       | `/opt/apps/ktl-secrets/` (`ktl.env`, `field-keys.json`), outside the checkout |
| Containers    | `ktl-migrator-1` (runs and exits), `ktl-api-1`, `ktl-nginx-1`                 |
| Database      | `kepler_talento` in `hts-postgres`, owned by `ktl_migrator`                   |
| Documents     | Docker volume `ktl_documents`                                                 |

The overlay switches off the root file's own `postgres` and `clamav` services, removes the
published port, points the migrator and API at `hts-postgres`, turns on the scanner bypass, and
joins only nginx to `lan_edge_net` (under the alias `ktl-nginx`). The API stays off the proxy
network, so nginx's `api` upstream cannot resolve to another stack's container.

Everything Kepler adds is named `ktl-*`. Objects that HMS already owns keep their names
(`hts-npm`, `hts-postgres`, `lan_edge_net`, `lan_data_net`): renaming them means changing and
restarting the HMS stacks.

---

## 2. Prerequisites

Check these on the server before you start:

```bash
docker compose version         # 2.24.4 or later (the overlay uses !reset / !override)
id -nG | grep -qw docker && echo "in docker group"
docker network ls --format '{{.Name}}' | grep -E '^lan_(edge|data)_net$'   # both must exist
docker ps --format '{{.Names}}' | grep -E '^hts-(npm|postgres)$'           # both must be running
docker exec hts-postgres psql -U postgres -tAc 'select version()'           # superuser access
```

The server also needs outbound internet access during builds (npm, NuGet and the Docker base
images), as the HMS builds do. Capacity is not a concern: Kepler adds about 1 GiB of RAM, plus
2-3 GiB while a build runs.

---

## 3. First deploy

### Step 1: secrets

Generate the database passwords, the sign-in signing key and the two account passwords on the
server. Hex values keep the database passwords safe inside connection strings.

```bash
sudo install -d -m 700 -o "$USER" -g "$USER" /opt/apps/ktl-secrets
cat > /opt/apps/ktl-secrets/ktl.env <<EOF
KTL_MIGRATOR_PASSWORD=$(openssl rand -hex 24)
KTL_RUNTIME_PASSWORD=$(openssl rand -hex 24)
KTL_AUTH_SIGNING_KEY=$(openssl rand -hex 32)
KTL_RRHH_ADMIN_PASSWORD=$(openssl rand -base64 18)
KTL_RRHH_USER_PASSWORD=$(openssl rand -base64 18)
KTL_FIELD_KEYS_FILE=/opt/apps/ktl-secrets/field-keys.json
EOF
chmod 600 /opt/apps/ktl-secrets/ktl.env
```

`KTL_RRHH_ADMIN_PASSWORD` and `KTL_RRHH_USER_PASSWORD` are the passwords of the two accounts HR
signs in with (KTL-45). Each must have at least 12 characters, or the migrator refuses to finish.
Read them back with `grep RRHH /opt/apps/ktl-secrets/ktl.env`, store them in the password manager,
and hand them to HR from there. The database only ever holds their hashes.

An installation set up before KTL-45 has `KTL_DEV_SIGNING_KEY` instead. Append the three new
lines before the KTL-45 change reaches `main`
([release notes](ktl-45/release-notes.md)); the old line can stay.

Create and edit `ktl.env` on the server only. A copy edited on Windows ends its lines in CR:
Compose strips it but the shell in Step 2 keeps it, so the roles get passwords the API never
sends (`28P01: password authentication failed`). `deploy.sh` refuses such a file. To repair it,
run `sed -i 's/\r$//' /opt/apps/ktl-secrets/ktl.env`, then the `ALTER ROLE` block in Step 2.

Generate the field-encryption key file (KTL-33) on a developer machine, where the .NET SDK is
installed, and copy it over:

```powershell
dotnet run --project backend/Tools/DataMigration -- encryption generate-keys --out D:\ktl-secrets\field-keys-lan.json
scp D:\ktl-secrets\field-keys-lan.json <user>@<SERVER_IP>:/opt/apps/ktl-secrets/field-keys.json
```

On the server, make it readable by the API container. The API runs as the image's `app` user,
not as your account; the `700` directory still keeps other host accounts out.

```bash
chmod 644 /opt/apps/ktl-secrets/field-keys.json
```

Store a copy of `field-keys.json` in the password manager and delete the local copy. Without the
file the API refuses to start and the database cannot be read; with demo data the way out is to
drop the database and reseed, but it is easier not to lose it. See
[docs/ktl-33/key-runbook.md](ktl-33/key-runbook.md).

### Step 2: database and roles

Kepler needs its own two roles: `ktl_migrator` owns the database and runs the migrations;
`ktl_runtime` is what the API connects as, with the data access the migrations grant it. Neither
is a superuser. Create both before the first deploy: the migrations grant to `ktl_runtime` only
if it already exists.

```bash
. /opt/apps/ktl-secrets/ktl.env
docker exec -i hts-postgres psql -v ON_ERROR_STOP=1 -U postgres \
  -v migrator_password="$KTL_MIGRATOR_PASSWORD" -v runtime_password="$KTL_RUNTIME_PASSWORD" <<'SQL'
CREATE ROLE ktl_migrator LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE ktl_runtime LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE DATABASE kepler_talento OWNER ktl_migrator;
REVOKE ALL ON DATABASE kepler_talento FROM PUBLIC;
GRANT CONNECT ON DATABASE kepler_talento TO ktl_runtime;
\connect kepler_talento
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
```

The roles must hold exactly the passwords in `ktl.env`. If the file is regenerated or repaired
later, set them again, check both logins over the network the way the containers connect, and
redeploy with `deploy.sh --force`:

```bash
. /opt/apps/ktl-secrets/ktl.env
docker exec -i hts-postgres psql -v ON_ERROR_STOP=1 -U postgres \
  -v migrator_password="$KTL_MIGRATOR_PASSWORD" -v runtime_password="$KTL_RUNTIME_PASSWORD" <<'SQL'
ALTER ROLE ktl_migrator PASSWORD :'migrator_password';
ALTER ROLE ktl_runtime PASSWORD :'runtime_password';
SQL
for role in migrator runtime; do   # prints ktl_migrator, then ktl_runtime
  var="KTL_$(echo $role | tr a-z A-Z)_PASSWORD"; eval pw=\$$var
  docker run --rm --network lan_data_net -e PGPASSWORD="$pw" postgres:16-alpine \
    psql -h hts-postgres -U ktl_$role -d kepler_talento -tAc 'select current_user'
done
```

Kepler is developed against PostgreSQL 17 but runs on the server's 16: it uses no 17-only
feature, and its one extension, `pg_trgm`, is a trusted extension the database owner can install.
HMS connects as the `postgres` superuser and can therefore read this database; that is accepted
for demo data.

### Step 3: code

Clone with the same access method as the HMS checkout (deploy key or token):

```bash
sudo install -d -o "$USER" -g "$USER" /opt/apps/ktl
git clone https://github.com/gustavofjove/kepler-talento.git /opt/apps/ktl
```

### Step 4: build and start

```bash
/opt/apps/ktl/deploy/lan/deploy.sh --force
```

The first build takes several minutes. `deploy.sh` runs one `docker compose up -d --build`: the
migrator applies the migrations, seeds the catalogs, the bootstrap administrator and the two
local accounts, and exits;
the API starts only after it succeeds, and nginx only after the API is healthy. The migrator log
shows one `Failed executing DbCommand` on `__EFMigrationsHistory` on a brand-new database. That
is EF Core probing for a table that does not exist yet; the migrations follow.

### Step 5: verify

```bash
ktl_compose() { docker compose -p ktl --env-file /opt/apps/ktl-secrets/ktl.env \
  -f /opt/apps/ktl/docker-compose.yml -f /opt/apps/ktl/deploy/lan/docker-compose.lan.yml "$@"; }

ktl_compose ps -a                                       # migrator Exited (0), api healthy, nginx up
docker inspect -f '{{.State.ExitCode}}' ktl-migrator-1  # 0

# Through the proxy network, as NPM will reach it
for path in /api/health/live /api/health/ready /api/health/scanner; do
  docker run --rm --network lan_edge_net alpine:3.22.1 \
    sh -c "wget -S -qO /dev/null http://ktl-nginx:8080$path 2>&1 | head -1; echo '  $path'"
done
# Expected: 200, 200, and 503 for the scanner while the bypass is on.

# nginx must resolve `api` to exactly one address: Kepler's own API
docker exec ktl-nginx-1 nslookup api 127.0.0.11
docker logs ktl-api-1 2>&1 | grep 'ClamAv:Bypass is on'
```

Add the `ktl_compose` function to `~/.bashrc` for day-to-day use (section 4).

### Step 6: NPM proxy host

In the NPM admin UI (`http://<SERVER_IP>:81`), add a proxy host:

| Field                 | Value       |
| --------------------- | ----------- |
| Domain names          | `ktl.lan`   |
| Scheme                | `http`      |
| Forward hostname / IP | `ktl-nginx` |
| Forward port          | `8080`      |

`8080`, not `80`: the image runs an unprivileged nginx. Leave no trailing spaces in the hostname
field.

- **Cache Assets: off.** NPM would cache `.js` files, including `env.js`, which carries the
  runtime settings and is served as never-cache. Kepler's nginx already sets cache headers.
- **Block Common Exploits: off.** Not needed on the LAN; its pattern matching can refuse
  legitimate requests with a `403`.
- **Websockets Support: off.** Kepler does not use them.
- **SSL: None.** The site is plain HTTP; `.lan` names cannot get a public certificate.

Under _Advanced_, match Kepler's own nginx so the proxy is never stricter than the app (20 MB CV
uploads, 120 s for slow API calls):

```nginx
client_max_body_size 25m;
proxy_read_timeout 120s;
```

Kepler's own nginx needs no configuration; it is built into the image.

### Step 7: client name resolution

Add to each client's `C:\Windows\System32\drivers\etc\hosts`:

```
<SERVER_IP>  ktl.lan
```

With a LAN DNS server (router, Pi-hole, dnsmasq), one record `ktl.lan → <SERVER_IP>` replaces the
hosts-file edits. Then open `http://ktl.lan`: it shows the «Usuario» / «Contraseña» form.

- **`rrhh_admin`:** everything, including Catálogos, Usuarios, Roles and Importación.
- **`rrhh_user`:** candidates and documents, with no Admin menu.

`POST /api/dev/token` issues no token on this server, because the development issuer is off.

### Step 8: demo data

`npm run seed:demo` only writes to a loopback address, and the server publishes no Kepler port.
Run it in a Node container that shares nginx's network namespace, where `127.0.0.1:8080` _is_
Kepler's nginx. The server has no development issuer, so the script signs in as `rrhh_admin`,
with the password passed through the environment rather than the command line:

```bash
. /opt/apps/ktl-secrets/ktl.env
docker run --rm --network container:ktl-nginx-1 -v /opt/apps/ktl/scripts:/scripts:ro \
  -e KTL_SEED_USER=rrhh_admin -e KTL_SEED_PASSWORD="$KTL_RRHH_ADMIN_PASSWORD" \
  node:22.18.0-alpine3.22 node /scripts/seed-demo-data.js --base-url http://127.0.0.1:8080
```

It creates candidates, CVs, positions and presets, and can be repeated. Add `--remove` to withdraw
the dataset. The CVs show as pending for a few seconds until the background worker promotes them.
See [docs/ktl-40/demo-data.md](ktl-40/demo-data.md).

### Step 9: auto-deploy

```bash
sudo touch /var/log/ktl-sync.log && sudo chown "$USER" /var/log/ktl-sync.log
crontab -e
```

```
2-59/5 * * * * /opt/apps/ktl/deploy/lan/deploy.sh >> /var/log/ktl-sync.log 2>&1
```

HMS syncs at minutes 0, 5, 10…; this runs at 2, 7, 12…, so the two rarely build at once.
`deploy.sh` rebuilds only when `origin/main` has new commits, and skips a tick while a previous
deploy is still running (lock file `/tmp/ktl-sync.lock`). After each build it removes dangling
images. The log shows `up to date at <sha>` on quiet ticks.

---

## 4. Daily operations

Each app keeps its own deploy scripts in its own repo. Kepler has a single environment, so it has
one script and no environment argument:

```bash
# HMS (unchanged)
cd /opt/apps/hts/deploy/lan-multi
./deploy-env.sh uat              # redeploy one environment
./deploy-env.sh uat --migrate    # redeploy and run EF Core migrations
./deploy-all.sh                  # redeploy dev, uat and test

# Kepler
cd /opt/apps/ktl/deploy/lan
./deploy.sh                      # deploy if main has new commits (what cron runs)
./deploy.sh --force              # rebuild and restart even without new commits
```

Kepler needs no `--migrate`: the migrator container runs on every deploy, applies only the
pending migrations, and the API does not start unless it succeeds.

`deploy.sh` finds the checkout from its own location and uses its own compose project (`ktl`) and
lock file (`/tmp/ktl-sync.lock`), so it only rebuilds `ktl-*` containers. The HMS `hts-*`
containers are not touched, and the HMS scripts do not touch Kepler's.

Useful checks:

```bash
# Status of both apps' containers
docker ps -a --filter "name=hts-" --filter "name=ktl-" --format "table {{.Names}}\t{{.Status}}"

# Auto-deploy logs
tail -f /var/log/hts-sync.log
tail -f /var/log/ktl-sync.log

# Kepler's container logs (ktl_compose from Step 5)
ktl_compose logs -f api          # or nginx, migrator
```

| Task            | Command                                  |
| --------------- | ---------------------------------------- |
| Restart the API | `ktl_compose restart api`                |
| Stop / start    | `ktl_compose stop` / `ktl_compose up -d` |

If a single entry point is preferred, the optional wrapper from the HMS guide
(`/usr/local/bin/deploy`, called as `deploy hts uat`) can map `deploy ktl` to
`/opt/apps/ktl/deploy/lan/deploy.sh --force`.

Things to know:

- **`ktl_compose down --volumes` deletes every uploaded document** (the database, in
  `hts-postgres`, survives). Use plain `down`.
- `hts-postgres` and `hts-npm` belong to the HMS `lan` project. Stopping that project
  (`docker compose down` in `/opt/apps/hts/deploy/lan`) takes Kepler down too; it recovers when
  they return (`restart: unless-stopped`).
- Changing a database password needs both `ALTER ROLE ... PASSWORD` in `hts-postgres` and the new
  value in `ktl.env`, then `deploy.sh --force`.
- Changing an account password (`KTL_RRHH_ADMIN_PASSWORD`, `KTL_RRHH_USER_PASSWORD`) needs only
  the new value in `ktl.env` and `deploy.sh --force`.
  - The migrator re-hashes it, and the old password stops working.
  - Sessions already open last until their token expires, at most 8 hours. Deactivate the account
    in Usuarios to end them sooner.
  - See [docs/ktl-45/authentication-local-accounts.md](ktl-45/authentication-local-accounts.md).
- Changing `KTL_AUTH_SIGNING_KEY` signs everyone out at the next deploy.

---

## 5. Malware scanning

There is no ClamAV on the server yet, so the overlay sets `ClamAv:Bypass`. With it on:

- every upload is promoted to available without a scan, recorded with the outcome
  `scanner.bypassed` and the signature `scanner-bypass`;
- `/api/health/scanner` reports `503` (`scanner_bypassed`); readiness is unaffected;
- the API logs a warning at start-up;
- start-up **fails in Production**, so the setting cannot reach a real deployment.

When the shared ClamAV is available, add to `ktl.env`:

```
KTL_CLAMAV_BYPASS=false
KTL_CLAMAV_HOST=<clamav container name or alias>
```

The API must share a network with it. It already joins `lan_data_net`; if ClamAV lives on another
network, add that network to the `api` service in `deploy/lan/docker-compose.lan.yml`. Then run
`deploy.sh --force` and check that `/api/health/scanner` returns `200`. Files uploaded during the
bypass are not rescanned; reseed the demo data (`--remove`, then load again) to start clean. They
can be listed with:

```sql
SELECT "Id" FROM "CND_Documents" WHERE "ScannerSignature" = 'scanner-bypass';
```

---

## 6. Removal

```bash
ktl_compose down --volumes
docker exec -i hts-postgres psql -U postgres \
  -c 'DROP DATABASE kepler_talento' -c 'DROP ROLE ktl_runtime' -c 'DROP ROLE ktl_migrator'
docker image rm ktl-api ktl-migrator ktl-nginx
```

Then delete the NPM proxy host, the cron line, the hosts-file entries, `/opt/apps/ktl` and
`/opt/apps/ktl-secrets`. HMS is not affected.
