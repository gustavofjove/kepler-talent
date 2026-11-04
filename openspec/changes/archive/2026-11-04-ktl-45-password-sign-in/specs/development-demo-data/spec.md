## MODIFIED Requirements

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
