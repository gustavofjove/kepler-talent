using FluentValidation;
using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Domain.Candidates;
using KeplerTalento.Domain.Documents;

namespace KeplerTalento.Application.Features.Candidates;

/// <summary>
/// The candidate as the list screen sees it: core fields, no collections.
/// </summary>
public sealed record CandidateSummaryResponse(
    Guid Id,
    string FirstName,
    string LastName,
    string Phone,
    string Email,
    string Location,
    string Province,
    string Country,
    CandidateAvailabilityResponse Availability,
    string Source,
    string Notes,
    string ReceivedAt,
    string ConsentAt,
    string ReviewDueAt,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    uint Version,
    int DocumentCount,
    Guid? PrimaryDocumentId)
{
    public static CandidateSummaryResponse From(CandidateSummary summary) => new(
        summary.Id,
        summary.FirstName,
        summary.LastName,
        summary.Phone,
        summary.Email,
        summary.Location,
        summary.Province,
        summary.Country,
        new CandidateAvailabilityResponse(
            summary.AvailabilityState,
            CandidateDates.ToWire(summary.AvailabilityCheckedOn),
            CandidateDates.ToWire(summary.AvailabilityUntil),
            summary.AvailabilityCheckedByDisplayName),
        summary.Source,
        summary.Notes,
        CandidateDates.ToWire(summary.ReceivedAt),
        CandidateDates.ToWire(summary.ConsentAt),
        CandidateDates.ToWire(summary.ReviewDueAt),
        summary.IsActive,
        summary.CreatedAtUtc,
        summary.UpdatedAtUtc,
        summary.Version,
        summary.DocumentCount,
        summary.PrimaryDocumentId);

    public static CandidateSummaryResponse From(
        Candidate candidate,
        int documentCount,
        Guid? primaryDocumentId) => new(
        candidate.Id,
        candidate.FirstName,
        candidate.LastName,
        candidate.Phone,
        candidate.Email,
        candidate.Location,
        candidate.Province,
        candidate.Country,
        CandidateAvailabilityResponse.From(candidate),
        candidate.Source,
        candidate.Notes,
        CandidateDates.ToWire(candidate.ReceivedAt),
        CandidateDates.ToWire(candidate.ConsentAt),
        CandidateDates.ToWire(candidate.ReviewDueAt),
        candidate.IsActive,
        candidate.CreatedAtUtc,
        candidate.UpdatedAtUtc,
        candidate.Version,
        documentCount,
        primaryDocumentId);
}

/// <summary>
/// The latest availability check (KTL-36). Dates are <c>yyyy-MM-dd</c> or the empty string. The
/// checker is exposed as a display name only, as a note author is; never as a user id.
/// </summary>
public sealed record CandidateAvailabilityResponse(
    string State,
    string CheckedOn,
    string Until,
    string? CheckedByDisplayName)
{
    public static CandidateAvailabilityResponse From(Candidate candidate) => new(
        candidate.AvailabilityState,
        CandidateDates.ToWire(candidate.AvailabilityCheckedOn),
        CandidateDates.ToWire(candidate.AvailabilityUntil),
        candidate.CheckedBy?.DisplayName);
}

public sealed record CandidateLanguageResponse(
    Guid Id,
    string Language,
    string Level,
    string? Certification,
    string? Notes);

public sealed record CandidateProgramResponse(
    Guid Id,
    string Program,
    string Level,
    int? YearsExperience,
    string? Notes);

public sealed record CandidateEducationResponse(
    Guid Id,
    string EducationType,
    string Degree,
    string? Specialty,
    string Institution,
    string Status,
    int? EndYear,
    string? Notes);

public sealed record CandidateExperienceResponse(
    Guid Id,
    string Company,
    string Position,
    string? Sector,
    string? Functions,
    string? StartDate,
    string? EndDate,
    decimal? YearsExperience,
    bool IsCurrent,
    string? Notes);

public sealed record CandidateSkillResponse(
    Guid Id,
    string Skill,
    string Level,
    string? Notes);

public sealed record CandidateTagResponse(Guid Id, string Tag);

public sealed record CandidateNoteResponse(
    Guid Id,
    string Body,
    Guid? AuthorUserId,
    string? AuthorDisplayName,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    bool IsActive,
    uint Version)
{
    public static CandidateNoteResponse From(CandidateNote note) => new(
        note.Id,
        note.Body,
        note.AuthorUserId,
        note.Author?.DisplayName,
        note.CreatedAtUtc,
        note.UpdatedAtUtc,
        note.IsActive,
        note.Version);
}

/// <summary>
/// Document metadata as a caller sees it. There is deliberately no storage key, path or
/// scan-state field: the caller learns what the document is, never where it lives.
/// </summary>
public sealed record CandidateDocumentResponse(
    Guid Id,
    string DocumentType,
    string OriginalFilename,
    string MimeType,
    long SizeBytes,
    bool IsPrimary,
    DateTimeOffset UploadedAt)
{
    public static CandidateDocumentResponse From(CandidateDocument document) => new(
        document.Id,
        document.DocumentType,
        document.OriginalFileName,
        document.ContentType,
        document.Size,
        document.IsPrimary,
        document.CreatedAtUtc);
}

/// <summary>The complete aggregate, as the detail screen loads it.</summary>
public sealed record CandidateResponse(
    Guid Id,
    string FirstName,
    string LastName,
    string Phone,
    string Email,
    string Location,
    string Province,
    string Country,
    CandidateAvailabilityResponse Availability,
    string Source,
    string Notes,
    string ReceivedAt,
    string ConsentAt,
    string ReviewDueAt,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    uint Version,
    /// <summary>Derived from <c>Documents</c>; present so the aggregate is a superset of the summary.</summary>
    int DocumentCount,
    Guid? PrimaryDocumentId,
    IReadOnlyList<CandidateLanguageResponse> Languages,
    IReadOnlyList<CandidateProgramResponse> Programs,
    IReadOnlyList<CandidateEducationResponse> Education,
    IReadOnlyList<CandidateExperienceResponse> Experience,
    IReadOnlyList<CandidateSkillResponse> Skills,
    IReadOnlyList<CandidateTagResponse> Tags,
    IReadOnlyList<CandidateNoteResponse> CustomNotes,
    IReadOnlyList<CandidateDocumentResponse> Documents);

/// <summary>
/// Wire representations of the candidate's date-only metadata. An absent date is the
/// empty string on the wire and null in storage; it is never turned into today.
/// </summary>
public static class CandidateDates
{
    public static string ToWire(DateOnly? value) => value?.ToString("yyyy-MM-dd") ?? string.Empty;

    public static bool TryFromWire(string? value, out DateOnly? parsed)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            parsed = null;
            return true;
        }
        if (DateOnly.TryParse(value, System.Globalization.CultureInfo.InvariantCulture, out var date))
        {
            parsed = date;
            return true;
        }
        parsed = null;
        return false;
    }
}

/// <summary>Stable error codes for the candidate slices, with their Spanish messages.</summary>
public static class CandidateErrors
{
    public const string NotFound = "candidate.not_found";
    public const string FirstNameRequired = "candidate.first_name.required";
    public const string LastNameRequired = "candidate.last_name.required";
    public const string AvailabilityInvalid = "candidate.availability.invalid";
    public const string AvailabilityCheckedOnInvalid = "candidate.availability.checked_on.invalid";
    public const string AvailabilityUntilInvalid = "candidate.availability.until.invalid";
    public const string DateInvalid = "candidate.date.invalid";
    public const string ConcurrencyConflict = "candidate.concurrency.conflict";
    public const string CatalogValueUnknown = "candidate.catalog_value.unknown";
    public const string RelationDuplicate = "candidate.relation.duplicate";
    public const string LanguageDuplicate = "candidate.language.duplicate";
    public const string ProgramDuplicate = "candidate.program.duplicate";
    public const string SkillDuplicate = "candidate.skill.duplicate";
    public const string TagDuplicate = "candidate.tag.duplicate";
    public const string NoteBodyRequired = "candidate.note.body.required";
    public const string NoteBodyTooLong = "candidate.note.body.too_long";
    public const string NoteConcurrencyConflict = "candidate.note.concurrency.conflict";
    public const string RemovedCandidate = "candidate.removed";
    public const string DocumentPrimaryAmbiguous = "candidate.document.primary_ambiguous";
    public const string ConstraintViolation = "candidate.constraint.violation";
    public const string FieldTooLong = "candidate.field.too_long";
    public const string ExperienceYearsInvalid = "candidate.experience.years.invalid";
    public const string ExperienceDateFuture = "candidate.experience.date.future";

    public const string NotFoundMessage = "Candidato no encontrado.";
    public const string FirstNameRequiredMessage = "El nombre es obligatorio.";
    public const string LastNameRequiredMessage = "Los apellidos son obligatorios.";
    public const string AvailabilityInvalidMessage = "La disponibilidad indicada no es válida.";
    public const string AvailabilityCheckedOnInvalidMessage =
        "La fecha de comprobación es obligatoria, no puede ser futura y solo se indica si la disponibilidad está comprobada.";
    public const string AvailabilityUntilInvalidMessage =
        "La fecha «hasta» solo se indica con «No disponible» y no puede ser anterior a la fecha de comprobación.";
    public const string DateInvalidMessage = "La fecha no es válida.";
    public const string ConcurrencyConflictMessage =
        "El candidato ha cambiado desde que se cargó. Vuelva a cargarlo e inténtelo de nuevo.";
    public const string CatalogValueUnknownMessage =
        "El valor indicado no existe en el catálogo correspondiente.";
    public const string RelationDuplicateMessage = "El candidato ya tiene este valor registrado.";
    public const string RemovedCandidateMessage =
        "No se puede modificar un candidato desactivado. Reactívelo primero.";
    public const string DocumentPrimaryAmbiguousMessage =
        "Solo puede haber un documento principal por candidato.";
    public const string ConstraintViolationMessage = "La solicitud contiene datos no válidos.";
    public const string FieldTooLongMessage = "El valor supera la longitud máxima permitida.";
    public const string ExperienceYearsInvalidMessage =
        "Los años de experiencia deben estar entre 0 y 100, con un decimal como máximo.";
    public const string ExperienceDateFutureMessage =
        "Las fechas de una experiencia no pueden ser posteriores al mes actual.";
    public const string NoteConcurrencyConflictMessage =
        "La nota ha cambiado desde que se cargó. Vuelva a cargarla e inténtelo de nuevo.";
}

internal static class CandidateGuards
{
    public static void RequireRead(ICurrentActor actor) => Require(actor, Permissions.CandidatesRead);

    public static void RequireCreate(ICurrentActor actor) => Require(actor, Permissions.CandidatesCreate);

    public static void RequireUpdate(ICurrentActor actor) => Require(actor, Permissions.CandidatesUpdate);

    /// <summary>Governs logical removal and restoration alike.</summary>
    public static void RequireDelete(ICurrentActor actor) => Require(actor, Permissions.CandidatesDelete);

    private static void Require(ICurrentActor actor, string permission)
    {
        if (!actor.IsAuthenticated || !actor.HasPermission(permission))
        {
            throw new ForbiddenException();
        }
    }

    public static NotFoundException NotFound() =>
        new(CandidateErrors.NotFound, CandidateErrors.NotFoundMessage);

    public static ConflictException Conflict() =>
        new(CandidateErrors.ConcurrencyConflict, CandidateErrors.ConcurrencyConflictMessage);

    public static ConflictException NoteConflict() =>
        new(CandidateErrors.NoteConcurrencyConflict, CandidateErrors.NoteConcurrencyConflictMessage);

    public static RequestValidationException Removed() =>
        new([new ValidationIssue("IsActive", CandidateErrors.RemovedCandidate, CandidateErrors.RemovedCandidateMessage)]);

    public static RequestValidationException UnknownCatalogValue(string property) =>
        new([new ValidationIssue(property, CandidateErrors.CatalogValueUnknown, CandidateErrors.CatalogValueUnknownMessage)]);

    public static RequestValidationException Duplicate(string property, string code, string message) =>
        new([new ValidationIssue(property, code, message)]);

    public static RequestValidationException PrimaryAmbiguous() =>
        new([new ValidationIssue(
            "Documents",
            CandidateErrors.DocumentPrimaryAmbiguous,
            CandidateErrors.DocumentPrimaryAmbiguousMessage)]);

    public static RequestValidationException ConstraintViolation() =>
        new([new ValidationIssue(
            "Request",
            CandidateErrors.ConstraintViolation,
            CandidateErrors.ConstraintViolationMessage)]);

    /// <summary>
    /// Translates a save outcome into the caller-visible refusal. A constraint violation
    /// becomes a generic validation failure: the database's own message would name
    /// columns and constraints, which is internal detail the caller must not receive.
    /// </summary>
    public static Exception ToException(CandidateSaveOutcome outcome) => outcome switch
    {
        CandidateSaveOutcome.ConcurrencyConflict => Conflict(),
        CandidateSaveOutcome.LanguageDuplicate => Duplicate(
            "Language", CandidateErrors.LanguageDuplicate, "El candidato ya tiene este idioma registrado."),
        CandidateSaveOutcome.ProgramDuplicate => Duplicate(
            "Program", CandidateErrors.ProgramDuplicate, "El candidato ya tiene este programa registrado."),
        CandidateSaveOutcome.SkillDuplicate => Duplicate(
            "Skill", CandidateErrors.SkillDuplicate, "El candidato ya tiene esta habilidad registrada."),
        CandidateSaveOutcome.TagDuplicate => Duplicate(
            "Tag", CandidateErrors.TagDuplicate, "El candidato ya tiene esta etiqueta registrada."),
        _ => ConstraintViolation(),
    };
}

internal static class CandidateValidators
{
    /// <summary>
    /// A text limit (KTL-33). The column width used to enforce it; once the column holds
    /// ciphertext the application must. Null is not this rule's concern.
    /// </summary>
    public static IRuleBuilderOptions<T, string?> MustFitWithin<T>(this IRuleBuilder<T, string?> rule, int maximum) =>
        rule.Must(value => value is null || value.Length <= maximum)
            .WithErrorCode(CandidateErrors.FieldTooLong)
            .WithMessage(CandidateErrors.FieldTooLongMessage);

    /// <summary>
    /// Replaces a <c>char_length(...) &gt; 0</c> check that cannot see through ciphertext
    /// (KTL-33). Keeps the code that check produced, so callers see the same refusal.
    /// </summary>
    public static IRuleBuilderOptions<T, string?> MustHaveText<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(value => !string.IsNullOrWhiteSpace(value))
            .WithErrorCode(CandidateErrors.ConstraintViolation)
            .WithMessage(CandidateErrors.ConstraintViolationMessage);

    public static IRuleBuilderOptions<T, string> MustBeAWireDate<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(value => CandidateDates.TryFromWire(value, out _))
            .WithErrorCode(CandidateErrors.DateInvalid)
            .WithMessage(CandidateErrors.DateInvalidMessage)!;
}
