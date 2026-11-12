# Frontend Localization Specification

## Purpose

Defines how user-facing frontend copy is sourced, so the interface can later gain additional languages without rewriting components, while Spanish remains the only language shipped today.

## Requirements

### Requirement: Spanish is the single active interface language

The frontend SHALL render user-facing copy in Spanish, and SHALL NOT offer any control to change the interface language. The active language SHALL NOT depend on browser language, stored preferences or query parameters.

#### Scenario: Browser configured for English

- **WHEN** a user whose browser prefers English opens the application
- **THEN** all interface copy is rendered in Spanish

#### Scenario: No language control

- **WHEN** a user views any screen, including login and primary navigation
- **THEN** no language selector or switch is present

### Requirement: Translation resources ship with the build

The production build SHALL include the Spanish translation resources, so copy is available on first render without any additional network request for translations.

#### Scenario: First render without translation requests

- **WHEN** the built application is loaded
- **THEN** translated copy is rendered on first paint and no request is made for a translation file

### Requirement: Migrated screens keep their rendered copy

Screens whose copy is sourced from translation resources SHALL render the same Spanish text, with correct accents, that they rendered before migration.

#### Scenario: Candidate languages section

- **WHEN** a user with edit permission opens a candidate profile with no languages
- **THEN** the section shows the heading "Idiomas", the empty state "Sin idiomas asociados." and the button "Añadir idioma"

#### Scenario: Login page

- **WHEN** an unauthenticated user opens the login page
- **THEN** the page shows the fields "Email", "Contraseña" and "Rol local" and the button "Entrar"

### Requirement: Relation validation errors are rendered from translation resources

Candidate relation validation failures SHALL identify the failure with a stable message key, and the interface SHALL render the Spanish copy for that key, including any interpolated values.

#### Scenario: Duplicate language

- **WHEN** a user adds a language the candidate already has
- **THEN** the section shows "El candidato ya tiene este idioma registrado." and the entered values are not persisted

#### Scenario: Invalid experience range

- **WHEN** a user submits an experience whose end date is before its start date
- **THEN** the section shows "La fecha de fin no puede ser anterior a la fecha de inicio."

### Requirement: Missing translation keys are detectable

A copy key that has no Spanish value SHALL be reported during development and SHALL fail the unit test run, rather than passing silently.

#### Scenario: Key missing in a unit test

- **WHEN** a component under test renders a key absent from the Spanish resources
- **THEN** the test run fails, naming the missing key

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
