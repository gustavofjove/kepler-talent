# Spec Delta

## Purpose

Defines the product name and corporate browser icons users recognize across the login page
and authenticated application, including operation without external network access.

## ADDED Requirements

### Requirement: Consistent application display name

The application SHALL display the exact product name `Kepler Talent` in its initial document
title, login heading and authenticated shell brand. The product name SHALL be the same in all
translation resources. Other interface copy SHALL remain Spanish.

#### Scenario: Login and authenticated page

- **WHEN** a user opens login and subsequently a candidate page
- **THEN** the document title is `Kepler Talent` on both pages, the login heading and shell brand
  use that name where applicable, and no visible product-name label says `Kepler Talento`

#### Scenario: Direct route before application initialization

- **WHEN** a browser loads an application route before the application has initialized
- **THEN** the HTML document already declares the title `Kepler Talent`

### Requirement: Corporate browser icons are hosted locally

The application SHALL show the existing Jove Group favicon artwork, preserving its colors,
proportions and transparency. Icon declarations SHALL use same-origin assets with correct MIME
types and actual dimensions. Login and every application route SHALL use these icons without
contacting an external site at runtime.

#### Scenario: Published artwork is reused

- **WHEN** the icon assets are compared with the Jove Group artwork identified in KTL-48
- **THEN** they use the published 150×150 and 300×300 PNG artwork without a redesigned logo

#### Scenario: No external connectivity

- **WHEN** login or a direct candidate route loads with external network access blocked
- **THEN** its icon declarations resolve to successful local PNG responses, no icon request
  leaves the application origin, and a fresh browser load shows the corporate tab icon

#### Scenario: Production deployment

- **WHEN** the production application is built and served
- **THEN** its declared icon URLs return PNG images with dimensions matching their metadata,
  including any declared touch icon

### Requirement: Current product documentation uses the display name

The README heading and current product references in documentation updated with a branding
change SHALL use `Kepler Talent`. Historical ticket originals and archived specifications SHALL
retain their original wording. Changing the display name SHALL NOT require changing technical
identifiers or API contracts.

#### Scenario: Documentation and technical compatibility

- **WHEN** the product name change is delivered
- **THEN** the README heading uses `Kepler Talent`, its prose remains Spanish, and existing
  namespaces, project paths, configuration keys, API routes and permissions continue to work
