# Spec Delta

## ADDED Requirements

### Requirement: Contact validation errors use Spanish translation resources

Candidate email and phone validation failures SHALL use stable translation keys and Spanish
messages identifying the field and reason. API contact-validation codes SHALL resolve through
the existing Spanish error presentation. Messages SHALL NOT interpolate submitted contact values.
Unsupported phone characters and fewer than 9 digits SHALL have distinguishable messages.

#### Scenario: Email format error

- **WHEN** candidate email validation fails in the service or API
- **THEN** the form shows `Introduce un correo electrónico válido.` through translation resources

#### Scenario: Phone character error

- **WHEN** candidate phone contains an unsupported character
- **THEN** the translated error reads `El teléfono solo puede contener dígitos, +, paréntesis y espacios.`

#### Scenario: Phone digit-count error

- **WHEN** a non-empty phone has only allowed characters but fewer than 9 digits
- **THEN** the translated error reads `El teléfono debe contener al menos 9 dígitos.`

## MODIFIED Requirements

### Requirement: Hardcoded copy is rejected outside the legacy list

The frontend lint check SHALL fail when a source file that is not on the explicit legacy list contains hardcoded user-facing JSX text. Files on the legacy list SHALL NOT fail the check for existing hardcoded copy. The legacy list SHALL NOT gain entries.

The application shell SHALL source all its user-facing copy, including accessible labels, from
translation resources and SHALL NOT remain exempt from the hardcoded-copy check. Its brand SHALL
use the shared product-name translation; its other existing Spanish wording SHALL remain unchanged.

#### Scenario: New component with hardcoded text

- **WHEN** a new `.tsx` file renders a literal Spanish string as JSX text and `npm run lint` runs
- **THEN** lint fails and reports the file and line

#### Scenario: Legacy component unchanged

- **WHEN** `npm run lint` runs against an unmigrated component on the legacy list
- **THEN** lint does not fail because of that component's hardcoded copy

#### Scenario: Migrated component

- **WHEN** a component is removed from the legacy list after its copy moves to keys
- **THEN** lint fails if any hardcoded JSX text remains in it

#### Scenario: Shell copy after the brand change

- **WHEN** a user opens the authenticated application after the shell migration
- **THEN** its brand uses the product-name translation and the skip link, tagline, sign-out,
  notification label and dismiss action retain their existing Spanish wording and accessible names
