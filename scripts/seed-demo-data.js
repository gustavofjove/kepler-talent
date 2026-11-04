#!/usr/bin/env node
// KTL-40: loads a fabricated demo dataset into a LOCAL development stack, through the public API
// only, so every panel of «Inicio» and the position and search screens shows realistic content.
//
//   npm run seed:demo                       (from frontend/; targets http://localhost:4200)
//   npm run seed:demo -- --base-url http://localhost:4300
//   npm run seed:demo -- --no-cvs           (skip the synthetic CV uploads)
//   npm run seed:demo -- --remove           (withdraw the dataset)
//   KTL_SEED_USER=rrhh_admin KTL_SEED_PASSWORD=... npm run seed:demo
//                                           (KTL-45: a target with password sign-in only)
//
// Guards: the target must be loopback, and it must issue a development token (never mapped in
// Production) unless a user name and password are given explicitly, in which case it signs in
// through /api/auth/token as that account. The password is never printed; prefer the
// environment variable to --password, which shows in the process list and shell history.
// Writes go through the normal permission checks, validation, encryption and audit.
// A re-run creates only what is missing. Nothing personal is printed - counts only.
// See docs/ktl-40/demo-data.md.
const { parseArgs } = require('node:util');
const lib = require('./seed-demo-data.lib.js');

const DEV_ADMIN = {
  subject: 'dev-admin-oid',
  displayName: 'Administrador local',
  email: 'admin@kepler-talento.local',
};

const { values: options } = parseArgs({
  options: {
    'base-url': { type: 'string', default: process.env.KTL_API_BASE || 'http://localhost:4200' },
    remove: { type: 'boolean', default: false },
    'no-cvs': { type: 'boolean', default: false },
    user: { type: 'string', default: process.env.KTL_SEED_USER || '' },
    password: { type: 'string', default: process.env.KTL_SEED_PASSWORD || '' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (options.help) {
  console.log(
    'Usage: node scripts/seed-demo-data.js [--base-url <url>] [--no-cvs] [--remove] [--user <name> --password <password>]',
  );
  process.exit(0);
}

if (Boolean(options.user) !== Boolean(options.password)) {
  console.error('A user name and a password go together: give both, or neither.');
  process.exit(1);
}

/** The checked target; set by `main` before any request is sent. */
let base;
let token = '';

/** One API call. Failures name the method, route and status, never a request or response body. */
async function api(method, route, body, { allow = [] } = {}) {
  const headers = { Accept: 'application/json, application/problem+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(new URL(route, base), { method, headers, body: payload });
  if (!response.ok && !allow.includes(response.status)) {
    let code = '';
    try {
      code = (await response.json()).code ?? '';
    } catch {
      // Not a problem document; the status says enough.
    }
    throw new Error(
      `${method} ${route.split('?')[0]} answered ${response.status}${code ? ` (${code})` : ''}.`,
    );
  }
  if (response.status === 204 || !(response.headers.get('content-type') ?? '').includes('json')) {
    return { status: response.status, data: undefined };
  }
  return { status: response.status, data: await response.json() };
}

async function signIn() {
  if (options.user) {
    try {
      const { data } = await api('POST', '/api/auth/token', {
        userName: options.user,
        password: options.password,
      });
      token = data.accessToken;
    } catch (error) {
      // The error names the route and status only; the credentials stay out of the message.
      throw new Error(`Password sign-in refused by ${base.origin} (${error.message})`);
    }
    return;
  }
  try {
    const { data } = await api('POST', '/api/dev/token', DEV_ADMIN);
    token = data.accessToken;
  } catch (error) {
    throw new Error(
      `No development token from ${base.origin} (${error.message}) Is the Compose stack running in Development?`,
    );
  }
}

/** A minimal valid one-page PDF about a fictitious person, built in memory. */
function syntheticCv(lines) {
  const escape = (text) => text.replace(/[\\()]/g, (character) => `\\${character}`);
  let y = 780;
  const content = lines
    .map(([text, size]) => {
      const operation = `BT /F1 ${size} Tf 50 ${y} Td (${escape(text)}) Tj ET`;
      y -= size + 8;
      return operation;
    })
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function demoCandidates() {
  const { data } = await api('GET', '/api/candidates?includeInactive=true');
  return data.filter((candidate) => candidate.email.toLowerCase().endsWith(`@${lib.DEMO_DOMAIN}`));
}

async function demoPositions() {
  const titles = new Set(lib.POSITIONS.map((position) => position.title));
  const found = [];
  for (let page = 1; ; page++) {
    const { data } = await api('GET', `/api/positions?status=all&pageSize=100&page=${page}`);
    found.push(...data.items.filter((item) => titles.has(item.title)));
    if (page * data.pageSize >= data.totalCount) return found;
  }
}

async function demoPresets() {
  const names = new Set(lib.PRESETS.map((preset) => preset.name));
  const { data } = await api('GET', '/api/search-presets');
  return data.filter((preset) => names.has(preset.name));
}

/** Opens or closes a position, re-sending its stored fields with the current version. */
async function setPositionStatus(id, status) {
  const { data: full } = await api('GET', `/api/positions/${id}`);
  return api('PUT', `/api/positions/${id}`, {
    title: full.title,
    description: full.description,
    location: full.location,
    status,
    requirements: full.requirements,
    version: full.version,
  });
}

const report = [];
/** «kind: N created, M already present» for what a run creates. */
const count = (kind, created, existing) =>
  report.push(`${kind}: ${created} created${existing ? `, ${existing} already present` : ''}`);

async function seedCandidates(today) {
  const existing = await demoCandidates();
  const byEmail = new Map(existing.map((candidate) => [candidate.email.toLowerCase(), candidate]));
  const ids = [];
  let created = 0;
  let restored = 0;
  let cvs = 0;
  let pendingScan = 0;
  for (const [index, candidate] of lib.CANDIDATES.entries()) {
    const email = lib.emailFor(candidate);
    const found = byEmail.get(email);
    if (found) {
      ids.push(found.id);
      // After --remove: bring back the ones that are meant to be active.
      if (!found.isActive && !candidate.removed) {
        await api('PUT', `/api/candidates/${found.id}/active`, {
          isActive: true,
          version: found.version,
        });
        restored++;
      }
      continue;
    }
    const { data: stored } = await api(
      'POST',
      '/api/candidates',
      lib.candidateBody(candidate, index, today),
    );
    created++;
    ids.push(stored.id);
    let version = stored.version;
    const availability = lib.availabilityBody(candidate, today);
    if (availability) {
      const { data } = await api('PUT', `/api/candidates/${stored.id}/availability`, {
        ...availability,
        version,
      });
      version = data.version;
    }
    if (candidate.cv && !options['no-cvs']) {
      const form = new FormData();
      const pdf = syntheticCv([
        [`${candidate.first} ${candidate.last}`, 20],
        [`${candidate.city} - perfil de demostración`, 12],
        ['Datos ficticios generados para la base de datos de desarrollo.', 10],
      ]);
      form.append('file', new Blob([pdf], { type: 'application/pdf' }), `cv-demo-${index + 1}.pdf`);
      form.append('documentType', 'CV');
      form.append('isPrimary', 'true');
      const { data: document } = await api('POST', `/api/candidates/${stored.id}/documents`, form);
      cvs++;
      if (document?.scanState && document.scanState !== 'Clean') pendingScan++;
    }
  }
  count('candidates', created, lib.CANDIDATES.length - created);
  if (restored > 0) report.push(`candidates reactivated: ${restored}`);
  if (cvs > 0) {
    const pending = pendingScan
      ? ` - ${pendingScan} pending scan, cleared by ClamAV once it is up`
      : '';
    report.push(`CVs uploaded as primary: ${cvs}${pending}`);
  }
  return ids;
}

/**
 * Languages, programs and skills. Only an empty collection is written, so a re-run adds them to
 * candidates seeded before this step existed and never overwrites what someone edited in the app.
 */
async function seedCompetencies(candidateIds) {
  let profiled = 0;
  let collections = 0;
  for (const [index, profile] of Object.entries(lib.COMPETENCIES)) {
    const { data: candidate } = await api('GET', `/api/candidates/${candidateIds[Number(index)]}`);
    if (!candidate.isActive) continue;
    const bodies = lib.competencyBodies(profile);
    let version = candidate.version;
    let wrote = false;
    for (const family of ['languages', 'programs', 'skills']) {
      if (candidate[family].length > 0 || bodies[family].length === 0) continue;
      const { data } = await api('PUT', `/api/candidates/${candidate.id}/${family}`, {
        [family]: bodies[family],
        version,
      });
      version = data.version;
      collections++;
      wrote = true;
    }
    if (wrote) profiled++;
  }
  report.push(
    `candidates given languages, programs and skills: ${profiled} (${collections} lists)`,
  );
}

/** Education and work history, under the same rule: only an empty collection is written. */
async function seedBackground(candidateIds, today) {
  let profiled = 0;
  let collections = 0;
  for (const [index, background] of Object.entries(lib.BACKGROUND)) {
    const { data: candidate } = await api('GET', `/api/candidates/${candidateIds[Number(index)]}`);
    if (!candidate.isActive) continue;
    const bodies = lib.backgroundBodies(background, today);
    let version = candidate.version;
    let wrote = false;
    for (const family of ['education', 'experience']) {
      if (candidate[family].length > 0 || bodies[family].length === 0) continue;
      const { data } = await api('PUT', `/api/candidates/${candidate.id}/${family}`, {
        [family]: bodies[family],
        version,
      });
      version = data.version;
      collections++;
      wrote = true;
    }
    if (wrote) profiled++;
  }
  report.push(`candidates given education and experience: ${profiled} (${collections} lists)`);
}

async function seedPositions(candidateIds) {
  const existing = new Map((await demoPositions()).map((position) => [position.title, position]));
  let created = 0;
  let reopened = 0;
  let links = 0;
  // Reverse, so the first position in the table is the most recently updated.
  for (const definition of [...lib.POSITIONS].reverse()) {
    let position = existing.get(definition.title);
    if (!position) {
      ({ data: position } = await api('POST', '/api/positions', {
        title: definition.title,
        description: lib.DESCRIPTION(definition.title),
        location: definition.location,
        requirements: {},
      }));
      created++;
    } else if (position.status === 'closed' && !definition.closed) {
      // After --remove: reopen the ones that are meant to be open.
      ({ data: position } = await setPositionStatus(position.id, 'open'));
      reopened++;
    }
    if (position.status === 'open') {
      const { data: current } = await api('GET', `/api/positions/${position.id}/candidates`);
      const linked = new Map(current.map((link) => [link.candidateId, link]));
      for (const [index, stage] of Object.entries(definition.links)) {
        const candidateId = candidateIds[Number(index)];
        let link = linked.get(candidateId);
        if (!link) {
          ({ data: link } = await api('POST', `/api/positions/${position.id}/candidates`, {
            candidateId,
          }));
          links++;
        }
        if (link.stage !== stage) {
          await api('PUT', `/api/positions/${position.id}/candidates/${candidateId}/stage`, {
            stage,
            version: link.version,
          });
        }
      }
      if (definition.closed) await setPositionStatus(position.id, 'closed');
    }
  }
  count('positions', created, lib.POSITIONS.length - created);
  if (reopened > 0) report.push(`positions reopened: ${reopened}`);
  report.push(`position links added: ${links}`);
}

async function seedPresets() {
  const existing = new Map((await demoPresets()).map((preset) => [preset.name, preset]));
  let created = 0;
  const ids = new Map();
  for (const definition of lib.PRESETS) {
    let preset = existing.get(definition.name);
    if (!preset) {
      ({ data: preset } = await api('POST', '/api/search-presets', {
        name: definition.name,
        filters: definition.filters,
      }));
      created++;
    }
    ids.set(definition.name, preset);
  }
  // Applied in a fixed order with a pause between, so their «Usada …» times differ. Only on the
  // run that created them: a re-run must not keep moving their last use.
  if (created > 0) {
    const used = lib.PRESETS.filter((preset) => preset.used !== null).sort(
      (a, b) => a.used - b.used,
    );
    for (const definition of used) {
      await api('POST', `/api/search-presets/${ids.get(definition.name).id}/use`, {});
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
  count('presets', created, lib.PRESETS.length - created);
}

async function removeCandidatesMarkedRemoved(candidateIds) {
  let removed = 0;
  for (const [index, candidate] of lib.CANDIDATES.entries()) {
    if (!candidate.removed) continue;
    const { data } = await api('GET', `/api/candidates/${candidateIds[index]}`);
    if (!data.isActive) continue;
    await api('PUT', `/api/candidates/${data.id}/active`, {
      isActive: false,
      version: data.version,
    });
    removed++;
  }
  if (removed > 0) report.push(`candidates removed logically: ${removed}`);
}

async function seed() {
  const today = new Date();
  const candidateIds = await seedCandidates(today);
  await seedCompetencies(candidateIds);
  await seedBackground(candidateIds, today);
  await seedPositions(candidateIds);
  await seedPresets();
  // Last: links to these candidates were made while they were still active.
  await removeCandidatesMarkedRemoved(candidateIds);
}

async function withdraw() {
  let candidates = 0;
  for (const candidate of await demoCandidates()) {
    if (!candidate.isActive) continue;
    await api('PUT', `/api/candidates/${candidate.id}/active`, {
      isActive: false,
      version: candidate.version,
    });
    candidates++;
  }
  let positions = 0;
  for (const position of await demoPositions()) {
    if (position.status !== 'open') continue;
    await setPositionStatus(position.id, 'closed');
    positions++;
  }
  let presets = 0;
  for (const preset of await demoPresets()) {
    await api('DELETE', `/api/search-presets/${preset.id}?version=${preset.version}`);
    presets++;
  }
  report.push(
    `candidates removed logically: ${candidates}`,
    `positions closed: ${positions}`,
    `presets deleted: ${presets}`,
  );
}

async function main() {
  base = lib.assertLoopback(options['base-url']);
  await signIn();
  if (options.remove) {
    await withdraw();
  } else {
    await seed();
  }
  console.log(`Demo data ${options.remove ? 'withdrawn from' : 'loaded into'} ${base.origin}:`);
  for (const line of report) console.log(`  ${line}`);
  console.log(
    'Every demo record is fabricated. Never load it into a database with real candidates.',
  );
}

main().catch((error) => {
  console.error(`seed-demo-data: ${error.message}`);
  process.exit(1);
});
