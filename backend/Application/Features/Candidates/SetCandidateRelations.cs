using FluentValidation;
using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Application.Abstractions.RichText;
using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Domain.Candidates;
using KeplerTalento.Domain.Catalogs;
using MediatR;

namespace KeplerTalento.Application.Features.Candidates;

public sealed record CandidateLanguageInput(
    Guid? Id,
    string Language,
    string Level,
    string? Certification,
    string? Notes);

public sealed record CandidateProgramInput(
    Guid? Id,
    string Program,
    string Level,
    int? YearsExperience,
    string? Notes);

public sealed record CandidateEducationInput(
    Guid? Id,
    string EducationType,
    string Degree,
    string? Specialty,
    string Institution,
    string Status,
    int? EndYear,
    string? Notes);

public sealed record CandidateExperienceInput(
    Guid? Id,
    string Company,
    string Position,
    string? Sector,
    string? Functions,
    string? StartDate,
    string? EndDate,
    decimal? YearsExperience,
    bool IsCurrent,
    string? Notes);

public sealed record CandidateSkillInput(Guid? Id, string Skill, string Level, string? Notes);

public sealed record CandidateTagInput(Guid? Id, string Tag);

public sealed record SetCandidateLanguagesCommand(
    Guid Id,
    IReadOnlyList<CandidateLanguageInput> Languages,
    uint Version) : IRequest<CandidateResponse>;

public sealed record SetCandidateProgramsCommand(
    Guid Id,
    IReadOnlyList<CandidateProgramInput> Programs,
    uint Version) : IRequest<CandidateResponse>;

public sealed record SetCandidateEducationCommand(
    Guid Id,
    IReadOnlyList<CandidateEducationInput> Education,
    uint Version) : IRequest<CandidateResponse>;

public sealed record SetCandidateExperienceCommand(
    Guid Id,
    IReadOnlyList<CandidateExperienceInput> Experience,
    uint Version) : IRequest<CandidateResponse>;

public sealed record SetCandidateSkillsCommand(
    Guid Id,
    IReadOnlyList<CandidateSkillInput> Skills,
    uint Version) : IRequest<CandidateResponse>;

public sealed record SetCandidateTagsCommand(
    Guid Id,
    IReadOnlyList<CandidateTagInput> Tags,
    uint Version) : IRequest<CandidateResponse>;

/// <summary>
/// Text limits on relation items (KTL-33): the column widths the encrypted columns no longer
/// enforce.
/// </summary>
public sealed class SetCandidateLanguagesValidator : AbstractValidator<SetCandidateLanguagesCommand>
{
    public SetCandidateLanguagesValidator() =>
        RuleForEach(command => command.Languages).ChildRules(item =>
            item.RuleFor(language => language.Certification).MustFitWithin(CandidateTextLimits.Certification));
}

public sealed class SetCandidateEducationValidator : AbstractValidator<SetCandidateEducationCommand>
{
    public SetCandidateEducationValidator() =>
        RuleForEach(command => command.Education).ChildRules(item =>
        {
            item.RuleFor(education => education.Degree).MustHaveText().MustFitWithin(CandidateTextLimits.Degree);
            item.RuleFor(education => education.Specialty).MustFitWithin(CandidateTextLimits.Specialty);
            item.RuleFor(education => education.Institution).MustFitWithin(CandidateTextLimits.Institution);
        });
}

public sealed class SetCandidateExperienceValidator : AbstractValidator<SetCandidateExperienceCommand>
{
    public SetCandidateExperienceValidator() =>
        RuleForEach(command => command.Experience).ChildRules(item =>
        {
            item.RuleFor(experience => experience.Company).MustHaveText().MustFitWithin(CandidateTextLimits.Company);
            item.RuleFor(experience => experience.Position).MustHaveText().MustFitWithin(CandidateTextLimits.Position);
            // KTL-46: one decimal at most. The domain refuses the same range, but only this rule
            // turns it into a validation problem instead of a server error.
            item.RuleFor(experience => experience.YearsExperience)
                .Must(years => years is null
                    || (years >= 0 && years <= ExperienceYears.Maximum && decimal.Round(years.Value, 1) == years.Value))
                .WithErrorCode(CandidateErrors.ExperienceYearsInvalid)
                .WithMessage(CandidateErrors.ExperienceYearsInvalidMessage);
            // KTL-46 follow-up: an experience cannot start or end in a month still to come.
            item.RuleFor(experience => experience.StartDate)
                .Must(NotAfterThisMonth)
                .WithErrorCode(CandidateErrors.ExperienceDateFuture)
                .WithMessage(CandidateErrors.ExperienceDateFutureMessage);
            item.RuleFor(experience => experience.EndDate)
                .Must(NotAfterThisMonth)
                .WithErrorCode(CandidateErrors.ExperienceDateFuture)
                .WithMessage(CandidateErrors.ExperienceDateFutureMessage);
        });

    /// <summary>Only the month counts: the form sends the first day of the chosen month.</summary>
    private static bool NotAfterThisMonth(string? value)
    {
        if (!CandidateDates.TryFromWire(value, out var date) || date is not { } day)
        {
            // Absent, or malformed, which the write reports on its own.
            return true;
        }
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return day.Year * 12 + day.Month <= today.Year * 12 + today.Month;
    }
}

/// <summary>
/// Shared execution for the five collection-replacement slices.
/// </summary>
/// <remarks>
/// Each collection is written as a complete set against the owning candidate's version,
/// never per item: a single relation has no concurrency token of its own, so two editors
/// submitting individual additions could interleave into a collection neither intended.
/// The candidate's row version is the token for everything it owns, which is what makes
/// the aggregate an aggregate.
/// </remarks>
internal static class CandidateRelationWrite
{
    public static async Task<CandidateResponse> ExecuteAsync(
        ICandidateRepository candidates,
        ICatalogRepository catalogs,
        ICurrentActor actor,
        Guid candidateId,
        uint version,
        Func<Candidate, CandidateCatalogLookup, CancellationToken, Task<IReadOnlyList<CandidateRelation>>> apply,
        CancellationToken cancellationToken,
        string auditEventType = CandidateAuditEvents.RelationsChanged)
    {
        CandidateGuards.RequireUpdate(actor);
        var candidate = await candidates.FindAsync(candidateId, cancellationToken)
            ?? throw CandidateGuards.NotFound();
        // A removed candidate is readable and restorable, but not editable: changing the
        // collections of a record someone deliberately withdrew would quietly undo part
        // of that decision.
        if (!candidate.IsActive)
        {
            throw CandidateGuards.Removed();
        }

        var lookup = new CandidateCatalogLookup(catalogs);
        // Resolution runs before anything is mutated, so an unresolvable name leaves the
        // previous collection exactly as it was.
        var removed = await apply(candidate, lookup, cancellationToken);
        candidates.RemoveRelations(removed);
        // Declared last, immediately before the save: resolving catalog names runs queries
        // on the same context in between, and the expected version must be the one the
        // save actually carries.
        candidates.ExpectVersion(candidate, version);

        var outcome = await candidates.SaveAsync(
            auditEventType,
            candidate.Id.ToString("N"),
            cancellationToken);
        if (outcome != CandidateSaveOutcome.Saved)
        {
            throw CandidateGuards.ToException(outcome);
        }
        var documents = await candidates.ListDocumentsAsync(candidate.Id, cancellationToken);
        return await CandidateProjection.ToResponseAsync(candidate, documents, lookup, cancellationToken);
    }

    /// <summary>
    /// Matches an incoming item to the row it replaces, so an edit keeps the row's
    /// identifier and its migration provenance instead of becoming a delete and an insert.
    /// </summary>
    public static TRelation? Existing<TRelation>(IReadOnlyList<TRelation> current, Guid? id)
        where TRelation : CandidateRelation =>
        id is null ? null : current.FirstOrDefault(relation => relation.Id == id.Value);

    /// <summary>Refuses the same value twice in one submitted collection.</summary>
    public static void RejectDuplicates(IEnumerable<Guid> values, string property, string code, string message)
    {
        var seen = new HashSet<Guid>();
        foreach (var value in values)
        {
            if (!seen.Add(value))
            {
                throw CandidateGuards.Duplicate(property, code, message);
            }
        }
    }

    public static DateOnly? Date(string? value)
    {
        CandidateDates.TryFromWire(value, out var parsed);
        return parsed;
    }
}

public sealed class SetCandidateLanguagesHandler(
    ICandidateRepository candidates,
    ICatalogRepository catalogs,
    ICurrentActor actor)
    : IRequestHandler<SetCandidateLanguagesCommand, CandidateResponse>
{
    public Task<CandidateResponse> Handle(
        SetCandidateLanguagesCommand request,
        CancellationToken cancellationToken) =>
        CandidateRelationWrite.ExecuteAsync(
            candidates,
            catalogs,
            actor,
            request.Id,
            request.Version,
            async (candidate, lookup, token) =>
            {
                var replacement = new List<CandidateLanguage>(request.Languages.Count);
                foreach (var input in request.Languages)
                {
                    var languageId = await lookup.ResolveAsync(
                        CatalogFamilies.Language, input.Language, "Language", token);
                    var levelId = await lookup.ResolveAsync(
                        CatalogFamilies.LanguageLevel, input.Level, "Level", token);
                    var existing = CandidateRelationWrite.Existing(candidate.Languages, input.Id);
                    if (existing is null)
                    {
                        existing = new CandidateLanguage(
                            Guid.CreateVersion7(), candidate.Id, languageId, levelId);
                        candidates.AddRelation(existing);
                    }
                    else
                    {
                        existing.SetValues(languageId, levelId);
                    }
                    existing.SetCertification(input.Certification);
                    existing.SetNotes(input.Notes);
                    replacement.Add(existing);
                }
                CandidateRelationWrite.RejectDuplicates(
                    replacement.Select(item => item.LanguageId),
                    "Language",
                    CandidateErrors.LanguageDuplicate,
                    "El candidato ya tiene este idioma registrado.");
                return candidate.ReplaceLanguages(replacement, DateTimeOffset.UtcNow);
            },
            cancellationToken);
}

public sealed class SetCandidateProgramsHandler(
    ICandidateRepository candidates,
    ICatalogRepository catalogs,
    ICurrentActor actor)
    : IRequestHandler<SetCandidateProgramsCommand, CandidateResponse>
{
    public Task<CandidateResponse> Handle(
        SetCandidateProgramsCommand request,
        CancellationToken cancellationToken) =>
        CandidateRelationWrite.ExecuteAsync(
            candidates,
            catalogs,
            actor,
            request.Id,
            request.Version,
            async (candidate, lookup, token) =>
            {
                var replacement = new List<CandidateProgram>(request.Programs.Count);
                foreach (var input in request.Programs)
                {
                    var programId = await lookup.ResolveAsync(
                        CatalogFamilies.Program, input.Program, "Program", token);
                    var levelId = await lookup.ResolveAsync(
                        CatalogFamilies.ProgramLevel, input.Level, "Level", token);
                    var existing = CandidateRelationWrite.Existing(candidate.Programs, input.Id);
                    if (existing is null)
                    {
                        existing = new CandidateProgram(
                            Guid.CreateVersion7(), candidate.Id, programId, levelId);
                        candidates.AddRelation(existing);
                    }
                    else
                    {
                        existing.SetValues(programId, levelId);
                    }
                    existing.SetYearsExperience(input.YearsExperience);
                    existing.SetNotes(input.Notes);
                    replacement.Add(existing);
                }
                CandidateRelationWrite.RejectDuplicates(
                    replacement.Select(item => item.ProgramId),
                    "Program",
                    CandidateErrors.ProgramDuplicate,
                    "El candidato ya tiene este programa registrado.");
                return candidate.ReplacePrograms(replacement, DateTimeOffset.UtcNow);
            },
            cancellationToken);
}

public sealed class SetCandidateEducationHandler(
    ICandidateRepository candidates,
    ICatalogRepository catalogs,
    ICurrentActor actor)
    : IRequestHandler<SetCandidateEducationCommand, CandidateResponse>
{
    public Task<CandidateResponse> Handle(
        SetCandidateEducationCommand request,
        CancellationToken cancellationToken) =>
        CandidateRelationWrite.ExecuteAsync(
            candidates,
            catalogs,
            actor,
            request.Id,
            request.Version,
            async (candidate, lookup, token) =>
            {
                var replacement = new List<CandidateEducation>(request.Education.Count);
                foreach (var input in request.Education)
                {
                    var typeId = await lookup.ResolveAsync(
                        CatalogFamilies.EducationType, input.EducationType, "EducationType", token);
                    var statusId = await lookup.ResolveAsync(
                        CatalogFamilies.EducationStatus, input.Status, "Status", token);
                    var existing = CandidateRelationWrite.Existing(candidate.Education, input.Id);
                    if (existing is null)
                    {
                        existing = new CandidateEducation(
                            Guid.CreateVersion7(),
                            candidate.Id,
                            typeId,
                            statusId,
                            input.Degree,
                            input.Institution);
                        candidates.AddRelation(existing);
                    }
                    else
                    {
                        existing.SetValues(typeId, statusId, input.Degree, input.Institution);
                    }
                    existing.SetSpecialty(input.Specialty);
                    existing.SetEndYear(input.EndYear);
                    existing.SetNotes(input.Notes);
                    replacement.Add(existing);
                }
                // Education records are genuinely repeatable — two degrees of the same
                // type from different institutions — so no duplicate rule applies here.
                return candidate.ReplaceEducation(replacement, DateTimeOffset.UtcNow);
            },
            cancellationToken);
}

public sealed class SetCandidateExperienceHandler(
    ICandidateRepository candidates,
    ICatalogRepository catalogs,
    IRichTextSanitizer sanitizer,
    ICurrentActor actor)
    : IRequestHandler<SetCandidateExperienceCommand, CandidateResponse>
{
    public Task<CandidateResponse> Handle(
        SetCandidateExperienceCommand request,
        CancellationToken cancellationToken) =>
        CandidateRelationWrite.ExecuteAsync(
            candidates,
            catalogs,
            actor,
            request.Id,
            request.Version,
            async (candidate, lookup, token) =>
            {
                var today = DateOnly.FromDateTime(DateTime.UtcNow);
                var replacement = new List<CandidateExperience>(request.Experience.Count);
                foreach (var input in request.Experience)
                {
                    // KTL-46: inside the relation write, so after its permission guard. The length
                    // that counts is the sanitised one, as for position descriptions.
                    var functions = SanitizeFunctions(input.Functions);
                    // The sector is optional (KTL-46 follow-up); a given one must still resolve.
                    Guid? sectorId = string.IsNullOrWhiteSpace(input.Sector)
                        ? null
                        : await lookup.ResolveAsync(CatalogFamilies.Sector, input.Sector, "Sector", token);
                    var existing = CandidateRelationWrite.Existing(candidate.Experience, input.Id);
                    if (existing is null)
                    {
                        existing = new CandidateExperience(
                            Guid.CreateVersion7(),
                            candidate.Id,
                            sectorId,
                            input.Company,
                            input.Position);
                        candidates.AddRelation(existing);
                    }
                    else
                    {
                        existing.SetValues(sectorId, input.Company, input.Position);
                    }
                    var startDate = CandidateRelationWrite.Date(input.StartDate);
                    var endDate = input.IsCurrent ? null : CandidateRelationWrite.Date(input.EndDate);
                    existing.SetPeriod(startDate, endDate, input.IsCurrent);
                    existing.SetFunctions(functions);
                    // Years the dates determine are the API's to work out (design D4); the
                    // caller's value counts only when they cannot be derived.
                    existing.SetYearsExperience(
                        ExperienceYears.From(startDate, endDate, input.IsCurrent, today) ?? input.YearsExperience);
                    existing.SetNotes(input.Notes);
                    replacement.Add(existing);
                }
                return candidate.ReplaceExperience(replacement, DateTimeOffset.UtcNow);
            },
            cancellationToken);

    private string? SanitizeFunctions(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return null;
        }
        var sanitized = sanitizer.Sanitize(input, RichTextProfile.ExperienceFunctions);
        if (sanitized.Length > CandidateTextLimits.Functions)
        {
            // The message names the limit, never the text.
            throw new RequestValidationException([new ValidationIssue(
                "Functions",
                CandidateErrors.FieldTooLong,
                CandidateErrors.FieldTooLongMessage)]);
        }
        return sanitized;
    }
}

public sealed class SetCandidateSkillsHandler(
    ICandidateRepository candidates,
    ICatalogRepository catalogs,
    ICurrentActor actor)
    : IRequestHandler<SetCandidateSkillsCommand, CandidateResponse>
{
    public Task<CandidateResponse> Handle(
        SetCandidateSkillsCommand request,
        CancellationToken cancellationToken) =>
        CandidateRelationWrite.ExecuteAsync(
            candidates,
            catalogs,
            actor,
            request.Id,
            request.Version,
            async (candidate, lookup, token) =>
            {
                var replacement = new List<CandidateSkill>(request.Skills.Count);
                foreach (var input in request.Skills)
                {
                    var skillId = await lookup.ResolveAsync(
                        CatalogFamilies.Skill, input.Skill, "Skill", token);
                    var levelId = await lookup.ResolveAsync(
                        CatalogFamilies.SkillLevel, input.Level, "Level", token);
                    var existing = CandidateRelationWrite.Existing(candidate.Skills, input.Id);
                    if (existing is null)
                    {
                        existing = new CandidateSkill(
                            Guid.CreateVersion7(), candidate.Id, skillId, levelId);
                        candidates.AddRelation(existing);
                    }
                    else
                    {
                        existing.SetValues(skillId, levelId);
                    }
                    existing.SetNotes(input.Notes);
                    replacement.Add(existing);
                }
                CandidateRelationWrite.RejectDuplicates(
                    replacement.Select(item => item.SkillId),
                    "Skill",
                    CandidateErrors.SkillDuplicate,
                    "El candidato ya tiene esta habilidad registrada.");
                return candidate.ReplaceSkills(replacement, DateTimeOffset.UtcNow);
            },
            cancellationToken);
}

public sealed class SetCandidateTagsHandler(
    ICandidateRepository candidates,
    ICatalogRepository catalogs,
    ICurrentActor actor)
    : IRequestHandler<SetCandidateTagsCommand, CandidateResponse>
{
    public Task<CandidateResponse> Handle(
        SetCandidateTagsCommand request,
        CancellationToken cancellationToken) =>
        CandidateRelationWrite.ExecuteAsync(
            candidates,
            catalogs,
            actor,
            request.Id,
            request.Version,
            async (candidate, lookup, token) =>
            {
                var replacement = new List<CandidateTag>(request.Tags.Count);
                foreach (var input in request.Tags)
                {
                    var tagId = await lookup.ResolveAsync(
                        CatalogFamilies.Tag, input.Tag, "Tag", token);
                    var existing = CandidateRelationWrite.Existing(candidate.Tags, input.Id);
                    if (existing is null)
                    {
                        existing = new CandidateTag(Guid.CreateVersion7(), candidate.Id, tagId);
                        candidates.AddRelation(existing);
                    }
                    else
                    {
                        existing.SetValue(tagId);
                    }
                    replacement.Add(existing);
                }
                CandidateRelationWrite.RejectDuplicates(
                    replacement.Select(item => item.TagId),
                    "Tag",
                    CandidateErrors.TagDuplicate,
                    "El candidato ya tiene esta etiqueta registrada.");
                return candidate.ReplaceTags(replacement, DateTimeOffset.UtcNow);
            },
            cancellationToken,
            CandidateAuditEvents.TagsChanged);
}
