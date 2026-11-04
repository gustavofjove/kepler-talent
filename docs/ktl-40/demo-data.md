# KTL-40 demo data

`scripts/seed-demo-data.js` loads a small, fixed, **fabricated** dataset into a local development
stack, so the home page («Inicio») and the position and search screens show realistic content.
It writes through the public API only, so validation, field encryption, permission checks and the
audit trail all apply as for data entered by hand.

```sh
cd frontend
npm run seed:demo                                    # http://localhost:4200 (or KTL_API_BASE)
npm run seed:demo -- --base-url http://localhost:4300
npm run seed:demo -- --no-cvs                        # skip the synthetic CV uploads
npm run seed:demo -- --remove                        # withdraw the dataset
```

The Compose stack must be running in Development (`docker compose up`).

## What it creates

| Records      | Content                                                                                                                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidates   | 24 with Spanish names and e-mails `nombre.apellido@demo.kepler-talento.local`. 22 stay active: 7 checked available and 5 unavailable (some with a «hasta» date), checks spread over the last 4 weeks, the rest unchecked. 2 are removed logically. |
| CVs          | A synthetic one-page PDF, uploaded as the primary CV, for 13 candidates. ClamAV scans them as usual; until it does they stay quarantined.                                                                                                          |
| Positions    | 7 open and 1 closed, with 26 candidate links spread over every stage. «Diseñador UX/UI» is open with no candidates.                                                                                                                                |
| Competencies | Languages, programs and skills (with levels and years) for all 22 active candidates, using the deployment catalog's names.                                                                                                                         |
| Background   | Education (1-2 entries) and work history (1-2 jobs, exactly one current) for all 22 active candidates, consistent with their competencies. Companies are invented; types, statuses and sectors use the deployment catalog's names.                 |
| Presets      | 5 shared presets. Four are used once, in a fixed order, on the run that creates them; «No disponibles con CV» is never used.                                                                                                                       |

The tables live in `scripts/seed-demo-data.lib.js`. `tests/unit/seed-demo-data.lib.spec.ts` checks
their invariants: the guard, distinct e-mails in the reserved domain, every stage present, no
13-digit number anywhere, and every language, program, skill and level present in
`CatalogSeedData.cs` (the API refuses a name the catalog does not hold).

### The «Inglés B2 + Navision + AutoCAD» demo

The competencies are built around one search, saved as the preset of the same name: «Inglés» at
B2 or above, and both «Navision» and «AutoCAD» (`ALL`). It returns 7 candidates: six with exactly
Inglés B2, and Sofía Romero Vidal with Inglés C1, which shows that a language level is a minimum.
Three candidates miss on exactly one criterion and are left out: Álvaro Castillo Peña (Inglés B1),
Elena Garrido Fuentes (no Navision) and Diego Santos Calvo (no AutoCAD).

## Re-running and removing

- **Idempotent.** Demo candidates are recognised by their e-mail domain, positions by their titles
  and presets by their names. A second run creates nothing and does not move the presets' last use.
- **Competencies and background fill only empty lists.** A run writes a candidate's languages,
  programs, skills, education or experience only while that list is empty. So a re-run completes candidates seeded before the competencies
  existed, and never overwrites what someone edited in the app.
- **`--remove`** removes the demo candidates logically, closes the demo positions and deletes the
  demo presets. It never deletes rows directly, and touches nothing outside the dataset.
- **Seeding after `--remove`** reactivates the candidates and reopens the positions meant to be
  active and open, and recreates the presets.
- **The e2e suite leaves it alone.** The Playwright teardown purges records carrying a 13-digit
  `Date.now()` marker; the dataset carries none.

The output is counts only; it never prints a name, an e-mail or an id.

## Guards

- The target must be `localhost`, `127.0.0.1` or `::1`; anything else is refused before a request
  is sent.
- By default it signs in through `POST /api/dev/token` as the development administrator. That
  endpoint is never mapped in Production, so by default the script cannot write anywhere else.
- KTL-45: given `KTL_SEED_USER` and `KTL_SEED_PASSWORD` (or `--user` and `--password`), it instead
  signs in through `POST /api/auth/token` as that account. This is for a target without the
  development issuer, such as the LAN server. It never does this unasked, and it never prints the
  password. The loopback rule above still applies.
- It needs no database credential, and it is not part of any image, migration or container
  start-up.

All of it is fabricated personal data. Never run it against a database that holds real candidates.
