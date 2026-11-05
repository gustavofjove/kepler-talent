# Candidate Persistence Specification

## Purpose

Defines the PostgreSQL persistence contract for the candidate aggregate and its relation
collections — the field set, constrained values, consent and retention metadata, logical
deletion state, invariants, and access-path indexes that any writer of candidate data
relies on.

## Requirements

### Requirement: Candidate record field set

The candidate record SHALL persist identity (first name, last name), contact details
(phone, email), location (location, province, country), source, notes, the availability
check (value, check date, until date and checker), consent and retention metadata (received
date, consent date, review due date), active state, creation and update timestamps, and a
concurrency token. Identity, contact, location, country, source and notes SHALL be persisted
encrypted as defined by the personal-data-encryption capability. Because the database cannot
inspect an encrypted value, required identity SHALL be enforced by application validation before
any write, and the database SHALL still reject a missing value.

#### Scenario: Candidate is persisted and read back

- **WHEN** a candidate carrying every field is written and read back
- **THEN** every field round-trips with its stored value unchanged

#### Scenario: Required identity is missing

- **WHEN** a write omits first name or last name, or supplies only whitespace
- **THEN** the write is rejected with a stable validation problem and the previous valid
  state is preserved

#### Scenario: Required identity is missing in a direct database write

- **WHEN** a direct database write supplies no value for first name or last name
- **THEN** the database rejects the write

### Requirement: Consent and retention metadata integrity

Consent and retention metadata SHALL be stored as explicit date values with no permissive
default. A candidate record SHALL NOT acquire a consent date, received date, or review due
date that was not supplied by its writer.

#### Scenario: Consent metadata is supplied

- **WHEN** a candidate is written with received, consent, and review due dates
- **THEN** all three read back with exactly the supplied values

#### Scenario: Consent metadata is absent

- **WHEN** a candidate is written without a consent date
- **THEN** the stored consent date is absent, and no default date is substituted

### Requirement: Logical deletion state

Candidates SHALL carry an active flag and a deletion timestamp representing logical
deletion. The schema SHALL NOT require physical deletion for a candidate to be treated as
removed, and a logically deleted candidate SHALL remain retrievable by identifier.

#### Scenario: Candidate is logically deleted

- **WHEN** a candidate's active flag is cleared and its deletion timestamp is set
- **THEN** the row still exists and can be retrieved by its identifier with its history
  intact

### Requirement: Candidate relation collections

The schema SHALL persist the candidate's language, program, education, experience, skill, tag,
note, and document collections as separate records owned by exactly one candidate, each carrying
the fields its business form exposes.

#### Scenario: Relation is attached to a candidate

- **WHEN** a language, program, education, experience, skill, tag, note, or document record is
  written for an existing candidate
- **THEN** it is stored against that candidate and read back within that candidate's
  collection

#### Scenario: Relation references a missing candidate

- **WHEN** a relation record is written for a candidate identifier that does not exist
- **THEN** the database rejects the write

#### Scenario: Candidate with relations is logically deleted

- **WHEN** a candidate holding relation records is logically deleted
- **THEN** its relation records are preserved, not removed

### Requirement: Migration provenance

A record loaded from the legacy dataset SHALL carry both a stable source identifier and
the moment the migration last wrote it. A record that carries a load moment without a
source identifier SHALL be rejected by the database. Records the application created SHALL
carry neither.

#### Scenario: Migrated record carries its provenance

- **WHEN** the migration writes a record
- **THEN** the record carries its source identifier and the moment it was loaded

#### Scenario: Load moment without a source identifier

- **WHEN** a write sets a load moment on a record that has no source identifier
- **THEN** the database rejects the write

#### Scenario: Application-created record

- **WHEN** the application creates a record
- **THEN** it carries neither a source identifier nor a load moment

### Requirement: Application changes after loading are detectable

It SHALL be possible to determine, for any record loaded from the legacy dataset, whether
anything other than the migration has written it since the migration last did.

#### Scenario: Record untouched since loading

- **WHEN** a loaded record has not been written since the migration wrote it
- **THEN** it does not report application changes

#### Scenario: Record edited through the application

- **WHEN** a loaded record is subsequently written by the application
- **THEN** it reports application changes since loading

### Requirement: At most one primary document per candidate

The schema SHALL permit at most one document per candidate to be marked primary, enforced as
a database invariant rather than by writer discipline.

#### Scenario: A second document is marked primary

- **WHEN** a write marks a second document primary for a candidate that already has one
- **THEN** the database rejects the write

#### Scenario: Candidate has no primary document

- **WHEN** a candidate's documents are all non-primary
- **THEN** the writes succeed and no primary document is required to exist

### Requirement: Catalog-backed relation values

Relation fields that name a language, program, skill, proficiency level, education type,
education status, sector, or tag SHALL reference a business catalog entry rather than storing
an unvalidated free-text value.

#### Scenario: Relation references an unknown catalog value

- **WHEN** a relation record is written referencing a catalog entry that does not exist
- **THEN** the database rejects the write

#### Scenario: Relation references a known catalog value

- **WHEN** a relation record references an existing catalog entry in the correct family
- **THEN** the write succeeds and the referenced value resolves on read

#### Scenario: Relation references a catalog value of the wrong family

- **WHEN** a tag record is written referencing a catalog entry that exists but belongs to
  another family
- **THEN** the database rejects the write

### Requirement: Candidate physical naming and invariants

Every candidate and candidate-relation table SHALL use an explicit quoted physical name
prefixed `CND_`, and SHALL declare its keys, required fields, uniqueness, and relationship
behavior in the schema.

#### Scenario: Naming validation runs

- **WHEN** automated naming validation inspects the candidate mappings
- **THEN** every physical name begins with `CND_` and preserves its configured case

#### Scenario: Application names are inspected

- **WHEN** the candidate entity and its relations are inspected in application code
- **THEN** their application-facing names carry no physical prefix

### Requirement: Candidate access-path indexes

The schema SHALL provide indexes for the access paths candidate reads use: lookup by
identifier, listing active candidates by update recency, and resolving a candidate's
relation collections.

#### Scenario: Relation collection is resolved

- **WHEN** a candidate's relation collections are queried by candidate identifier
- **THEN** the query is served by an index on the owning candidate reference rather than a
  full scan

### Requirement: Candidate least-privilege runtime grants

The migration that creates the candidate schema SHALL ship the runtime role's grants in
the same deployment action, and the runtime role SHALL NOT hold schema-modification
privileges on candidate tables.

#### Scenario: Runtime role attempts schema modification

- **WHEN** the runtime database role attempts to alter or drop a candidate table
- **THEN** PostgreSQL denies the operation

#### Scenario: Runtime role reads and writes candidate data

- **WHEN** the runtime database role performs permitted candidate reads and writes
- **THEN** the operations succeed

### Requirement: Candidate tag assignment uniqueness in the database

The schema SHALL prevent a candidate from holding the same tag more than once, enforced by the
database rather than by the writer, so that concurrent writes cannot produce a duplicate
assignment.

#### Scenario: Duplicate assignment is written directly

- **WHEN** the same tag is written twice for one candidate
- **THEN** the database rejects the second write

#### Scenario: Concurrent assignments of the same tag

- **WHEN** two writers assign the same tag to one candidate at the same time
- **THEN** exactly one succeeds and afterwards the candidate holds that tag once

### Requirement: Candidate note persistence and logical-retirement grants

The schema SHALL persist a candidate note with its body, nullable internal-user author reference,
creation timestamp, update timestamp, active flag and concurrency token, under the candidate
physical naming convention. A non-null author SHALL reference an existing internal user without
cascade deletion. The runtime database role SHALL hold the privileges needed to read, insert and
update notes, and SHALL NOT hold `DELETE` on the notes table, because a note is retired logically.
The migration that creates the table SHALL ship these grants in the same deployment action.

#### Scenario: Runtime role attempts to delete a note

- **WHEN** the runtime database role attempts to delete a row from the candidate notes table
- **THEN** PostgreSQL denies the operation

#### Scenario: Runtime role retires a note

- **WHEN** the runtime database role marks a note inactive
- **THEN** the operation succeeds and the row remains present

#### Scenario: Note references an unknown author

- **WHEN** a note is written with a non-null author identifier that does not name an internal user
- **THEN** the database rejects the write

#### Scenario: Grants are inspected

- **WHEN** the database catalog is queried for the runtime role's privileges on the candidate
  notes table
- **THEN** it holds select, insert and update, and holds no delete

### Requirement: Tag and note access-path indexes

The schema SHALL provide indexes for the access paths tags and notes are read through:
resolving a candidate's tags by candidate identifier, matching candidates by tag when search
filters on tags, and listing a candidate's active notes by recency.

#### Scenario: Candidate tags are resolved

- **WHEN** a candidate's tags are queried by candidate identifier
- **THEN** the query is served by an index on the owning candidate reference rather than a full
  scan

#### Scenario: Candidates are matched by tag

- **WHEN** search matches candidates by a tag value
- **THEN** the query is served by an index on the tag reference rather than a full scan

#### Scenario: Candidate notes are listed

- **WHEN** a candidate's active notes are queried newest first
- **THEN** the query is served by an index covering the owning candidate and creation time
  rather than a full scan

### Requirement: Constrained availability check

The availability check SHALL be constrained at the database level, not by application convention
alone:

- the value SHALL be `unknown`, `available` or `unavailable`, and SHALL default to `unknown`;
- an `unknown` check SHALL have no check date and no checker, and a known check SHALL have a check
  date;
- an until date SHALL exist only on an `unavailable` check and SHALL NOT be earlier than its check
  date;
- the checker SHALL reference an existing application user, and that user SHALL NOT be deletable
  while referenced.

The value, dates and checker SHALL be stored in clear, because they are not free text. The
candidate record SHALL hold no status and no free-text availability column.

#### Scenario: Unknown value is written

- **WHEN** a direct database write sets an availability value outside the permitted set
- **THEN** the database rejects the write

#### Scenario: Inconsistent check is written

- **WHEN** a direct database write stores an `unknown` check with a check date, a known check
  without one, an until date on a non-`unavailable` check, or an until date before the check date
- **THEN** the database rejects the write

#### Scenario: Candidate is written without availability

- **WHEN** a candidate row is inserted without availability values
- **THEN** it is stored as `unknown` with no dates and no checker

### Requirement: Experience years hold one decimal

An experience entry's years SHALL be stored and exchanged as a decimal with at most one fraction
digit, from 0 to 100, and the database SHALL reject a value outside that range.

When a write carries a start date and an end date, or a start date on a current role, the API SHALL
store the years worked out from those dates instead of any value the caller sent. The years are
the months from the start month to the end month, both included, divided by 12, rounded to one
decimal, half away from zero; the day of a date does not count, and a current role counts up to the
month of the write. Otherwise the API SHALL store the caller's value, or none. Dates keep the day
they are written with.

#### Scenario: Years worked out from the dates

- **WHEN** an experience entry from 2019-03-01 to 2024-06-30 is written with 9 years
- **THEN** the entry is stored and returned with 5.3 years

#### Scenario: Years typed by hand

- **WHEN** an experience entry without a start date is written with 3.5 years
- **THEN** the entry is stored and returned with 3.5 years

#### Scenario: Years out of range

- **WHEN** an experience entry is written with -1 or 100.1 years, or with two fraction digits
- **THEN** the write is refused as a validation error and nothing changes

### Requirement: Experience sector is optional and dates are not in the future

An experience entry's sector SHALL be optional: an entry written with no sector, or a blank one,
SHALL be stored with no sector reference and returned with `sector: null`. A sector that is given
SHALL still reference an existing catalog entry of the sector family.

Neither an experience entry's start date nor its end date SHALL fall in a month after the current
month (UTC). A write holding such an entry SHALL be refused as a validation error with
`candidate.experience.date.future`, and nothing SHALL change. A date in the current month is
accepted.

#### Scenario: Entry without a sector

- **WHEN** an experience entry is written with no sector
- **THEN** it is stored with no sector reference and read back with `sector: null`

#### Scenario: Future start date

- **WHEN** a current experience entry is written with a start date in the next month
- **THEN** the write is refused with `candidate.experience.date.future` and nothing changes

#### Scenario: Current month

- **WHEN** a current experience entry is written with a start date in the current month
- **THEN** the write succeeds

### Requirement: Experience functions are sanitised rich text

An experience entry's functions SHALL be accepted as rich text and SHALL be reduced, before
storage, to paragraphs, line breaks, bold, italic, ordered lists, unordered lists and list items.
Underline SHALL be removed and its text kept. Scripts, event attributes, style attributes, links,
images, embedded content and every other element or attribute SHALL be neither stored nor returned
as active markup. A value stored with underline before it was removed MAY still be returned with
it.

The sanitised value SHALL be at most 20,000 characters, and a longer one SHALL be refused as a
validation error. Functions SHALL stay encrypted at rest.

A stored value that contains no paragraph or list element SHALL be returned as escaped text with
one paragraph per non-empty line. Every value returned SHALL contain only the allowed markup.
Validation messages, problem responses and logs SHALL NOT contain the value.

#### Scenario: Dangerous markup is removed

- **WHEN** an experience entry's functions contain a script, an `onclick` attribute, a `style`
  attribute, a link and an image
- **THEN** none of them is stored or returned, and the remaining text is kept

#### Scenario: Equivalent emphasis is normalised

- **WHEN** functions use `<b>`, `<i>` and `<u>`
- **THEN** they are returned as `<strong>` and `<em>`, and the underlined words as plain text

#### Scenario: Functions too long

- **WHEN** an experience entry's sanitised functions exceed 20,000 characters
- **THEN** the write is refused as a validation error that does not contain the text, and nothing
  changes

#### Scenario: Legacy plain text is returned safely

- **WHEN** a stored functions value is plain text with two lines, one of them containing `a < b`
- **THEN** the API returns two paragraphs with the `<` escaped

#### Scenario: Functions stay encrypted

- **WHEN** the experience table is read directly in the database after a rich-text write
- **THEN** the functions column holds ciphertext and not the text written
