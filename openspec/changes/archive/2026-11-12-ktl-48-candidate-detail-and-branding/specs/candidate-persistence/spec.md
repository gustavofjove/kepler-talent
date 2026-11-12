# Spec Delta

## ADDED Requirements

### Requirement: Education centre accepts encrypted empty text

Education writes SHALL accept blank or whitespace-only `institution`, trim it and return it as
an empty string. Existing non-empty centres SHALL remain intact unless changed. The stored
column SHALL remain non-null and encrypted, including for empty text. Length limits and all
other required education fields SHALL remain enforced.

#### Scenario: Blank centre round-trips

- **WHEN** an authorized editor writes valid education with `institution: "   "`
- **THEN** the returned and subsequently read centre is `""`, and its stored value is an
  encrypted envelope rather than plaintext or SQL null

#### Scenario: Existing centre is cleared

- **WHEN** an editor writes an empty institution for an existing education entry
- **THEN** the same entry reads back with an empty centre and preserves its other fields

#### Scenario: Non-empty and overlong centres

- **WHEN** a valid non-empty centre is resubmitted unchanged or an overlong centre is submitted
- **THEN** the former stays unchanged and readable, and the latter is refused without a partial write

### Requirement: Candidate contacts are optional and trimmed

Core candidate create/update SHALL accept blank email and phone, including whitespace-only
values, and trim supplied contact values before validation and storage. Accepted phone
formatting inside the trimmed value SHALL be preserved. Contact length limits SHALL remain
40 characters for phone and 255 for email. Contact data SHALL remain encrypted at rest.

#### Scenario: Empty contacts

- **WHEN** an authorized creator or editor supplies blank or whitespace-only contacts
- **THEN** the operation succeeds with empty contacts and does not invent contact information

#### Scenario: Trim and preserve formatting

- **WHEN** a core write supplies `  +34 (612) 345 678  ` and `ana.perez+rrhh@example.com`
- **THEN** both are accepted, outer whitespace is removed, and internal phone formatting is retained

#### Scenario: Length limits

- **WHEN** a trimmed phone exceeds 40 characters or a trimmed email exceeds 255 characters
- **THEN** the write is refused with a stable validation problem and no partial change

### Requirement: Supplied candidate email has single-address format

A non-empty email on core create/update SHALL contain exactly one `@`, non-empty local and
domain parts, and no embedded whitespace, display-name syntax or address list. Invalid email
SHALL be refused with a stable validation code without persistence. Validation SHALL NOT
require DNS access, ownership verification or a deliverability check.

#### Scenario: Ordinary and malformed addresses

- **WHEN** core create/update receives `ana.perez+rrhh@example.com`, `ana`, `ana@`,
  `@example.com`, `ana@@example.com` or `ana perez@example.com`
- **THEN** the first passes email validation and each of the remaining values is refused

#### Scenario: Display name and multiple addresses

- **WHEN** email is `Ana <ana@example.com>` or `ana@example.com,bob@example.com`
- **THEN** the write is refused as an invalid single email address

### Requirement: Supplied candidate phone has allowed characters and nine digits

A non-empty phone on core create/update SHALL contain only ASCII digits, `+`, parentheses and
whitespace and at least 9 digits, counting digits only. Unsupported characters and too few
digits SHALL produce distinct stable validation codes. Invalid characters SHALL NOT be stripped
to make input pass. Country-specific numbering or punctuation-position rules SHALL NOT be imposed.

#### Scenario: Plain and formatted phone

- **WHEN** phone is `612345678` or `+34 (612) 345 678`
- **THEN** phone validation passes

#### Scenario: Too few digits despite formatting

- **WHEN** phone is `61234567`, `+(12) 345 678` or `+++()`
- **THEN** validation fails with the minimum-digit error regardless of total character count

#### Scenario: Disallowed characters

- **WHEN** phone is `612-345-678`, `612.345.678` or `612345678 ext 1`
- **THEN** validation fails with the character error and no stripped version is stored

### Requirement: Contact and centre writes retain security and compatibility

Contact and education writes SHALL check authentication and the operation's permission before
validation or candidate lookup, preserve version conflicts and never expose submitted personal
values in errors, logs or audit payloads. Invalid legacy contacts SHALL remain readable; core
updates SHALL require correcting or clearing them. Relation writes SHALL NOT revalidate contacts.

#### Scenario: Authentication and permissions precede validation

- **WHEN** anonymous callers or actors lacking `candidates.create` or `candidates.update` invoke
  the corresponding core or education write, with valid or invalid values and existing or unknown ids
- **THEN** access is refused before validation or lookup and no data changes

#### Scenario: Valid write with a stale version

- **WHEN** an authorized core or education update supplies otherwise valid data and a stale version
- **THEN** the API returns 409 and the previous aggregate remains unchanged

#### Scenario: Legacy invalid contact

- **WHEN** an authorized editor changes main data while resubmitting an invalid old phone
- **THEN** the write is refused until the phone is corrected or cleared; reads and unrelated
  relation writes remain available

#### Scenario: Import keeps shared validation

- **WHEN** an import row passes its existing import-specific rules but has an invalid phone
- **THEN** it is rejected through the existing row-validation outcome without creating a candidate,
  weakening import-specific requirements or logging the supplied contact value

#### Scenario: Least privilege and private documents remain intact

- **WHEN** the runtime database role attempts DDL or an unauthorized actor requests a private document
- **THEN** both operations are denied and the contact/centre changes have not widened either boundary
