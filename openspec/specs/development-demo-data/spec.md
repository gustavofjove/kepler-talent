## Purpose

Provides a development-only, reproducible demo dataset of fabricated candidates, positions, links,
availability checks and shared presets, created through the API, so that a local stack shows every
feature of the home page and the position and search screens with realistic content.

## Requirements

### Requirement: Demo dataset content

The repository SHALL provide a demo data command that, run against a development stack, creates a
fixed, deterministic dataset through the public API only. The dataset SHALL contain at least:

- 20 active fabricated candidates with Spanish names and e-mail addresses in the reserved
  `demo.kepler-talento.local` domain, of which at least 6 are checked `available`, at least 4 are
  checked `unavailable` (some with an «hasta» date) and the rest are never checked, with check
  dates spread over the preceding 30 days;
- at least 2 logically removed demo candidates;
- a CV document for roughly half of the active candidates, so that both «Sin CV» and candidates with
  a primary CV appear;
- at least 6 open positions and 1 closed position, with candidates linked at every stage (`Nuevo`,
  `Preseleccionado`, `Entrevista`, `Contratado`, `Descartado`) in varied proportions, and at least
  one open position with no linked candidates;
- at least 4 shared search presets, of which at least 3 have been used in a known order and at least
  1 has never been used.

Every created value SHALL be fabricated. The dataset SHALL contain no 13-digit number in any name,
title, code, e-mail or file name, so the e2e teardown, which purges records by that marker, never
removes it.

#### Scenario: Seeding an empty development database

- **WHEN** a developer runs the demo data command against a freshly migrated development stack
- **THEN** the home page shows a populated candidate card, open positions with non-zero counts in
  every stage column, both recent candidate panels and the saved searches panel with used and unused
  presets

#### Scenario: The e2e teardown leaves demo data alone

- **WHEN** the Playwright suite runs and its global teardown completes after the demo data was
  seeded
- **THEN** every demo candidate, position and preset still exists

### Requirement: Demo data is idempotent and withdrawable

Running the command again SHALL NOT duplicate records: it SHALL recognise existing demo candidates
by their reserved e-mail domain, demo positions by their fixed titles and demo presets by their
fixed names, and create only what is missing. The command SHALL report how many records of each kind
it created and how many it found already present, without printing any candidate name, e-mail or
other personal value.

The command SHALL offer a remove mode that withdraws the dataset using the domain's normal
operations: demo candidates are removed logically, demo positions are closed and demo presets are
deleted. It SHALL NOT delete rows directly in the database.

#### Scenario: Second run creates nothing

- **WHEN** the command is run twice in a row
- **THEN** the second run creates no record and reports every demo record as already present

#### Scenario: Withdrawing the dataset

- **WHEN** the command is run in remove mode
- **THEN** demo candidates no longer appear among active candidates, demo positions are closed and
  demo presets are gone, and no record that is not demo data is touched

#### Scenario: Seeding again after a withdrawal

- **WHEN** the command is run normally after remove mode
- **THEN** the demo candidates meant to be active are reactivated, the demo positions meant to be
  open are reopened and the presets are recreated, without duplicating any record

### Requirement: Demo data stays out of non-development environments

The command SHALL refuse to run unless its target is a loopback host (`localhost`, `127.0.0.1` or
`::1`). It SHALL authenticate in one of two ways:

- **Development token endpoint (default).** It SHALL use this endpoint, which is never mapped in
  production.
- **Password sign-in.** It SHALL use the API's password sign-in operation only when a user name and
  password are given explicitly to the command, and SHALL never use one by default.

It SHALL NOT read or require any database credential. It SHALL write only through API endpoints
that apply the normal permission checks, validation, encryption and audit. It SHALL NOT be part of
any deployment, migration or container start-up. It SHALL NOT print or log the password it was
given.

#### Scenario: Non-loopback target

- **WHEN** the command is pointed at a host name that is not loopback
- **THEN** it exits with an error before sending any request

#### Scenario: Development token endpoint is absent

- **WHEN** no credentials are given and the target does not issue a development token
- **THEN** the command exits with an error and creates nothing

#### Scenario: Credentials are given for a password-only target

- **WHEN** a user name and password of an account holding the needed permissions are given and the
  target has no development token endpoint
- **THEN** the command signs in through password sign-in and seeds the dataset

#### Scenario: Given credentials are refused

- **WHEN** the given user name and password are refused by the target
- **THEN** the command exits with an error, creates nothing, and does not echo the password

#### Scenario: Audit and encryption apply

- **WHEN** the dataset has been seeded
- **THEN** demo candidate names are stored encrypted like any other candidate, and the writes appear
  in the audit trail attributed to the account the command signed in as
