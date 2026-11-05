## ADDED Requirements

### Requirement: Experience years hold one decimal

An experience entry's years SHALL be stored and exchanged as a decimal with at most one fraction
digit, from 0 to 100, and the database SHALL reject a value outside that range.

When a write carries a start date and an end date, or a start date on a current role, the API SHALL
store the years worked out from those dates instead of any value the caller sent. The years are
the elapsed days divided by 365.25, rounded to one decimal, half away from zero, and a current role
counts up to the day of the write. Otherwise the API SHALL store the caller's value, or none.

#### Scenario: Years worked out from the dates

- **WHEN** an experience entry from 2019-03-01 to 2024-06-30 is written with 9 years
- **THEN** the entry is stored and returned with 5.3 years

#### Scenario: Years typed by hand

- **WHEN** an experience entry without a start date is written with 3.5 years
- **THEN** the entry is stored and returned with 3.5 years

#### Scenario: Years out of range

- **WHEN** an experience entry is written with -1 or 100.1 years, or with two fraction digits
- **THEN** the write is refused as a validation error and nothing changes

### Requirement: Experience functions are sanitised rich text

An experience entry's functions SHALL be accepted as rich text and SHALL be reduced, before
storage, to paragraphs, line breaks, bold, italic, underline, ordered lists, unordered lists and
list items. Scripts, event attributes, style attributes, links, images, embedded content and every
other element or attribute SHALL be neither stored nor returned as active markup.

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
- **THEN** they are returned as `<strong>`, `<em>` and `<u>`

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
