using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Domain.Candidates;
using KeplerTalento.Domain.Catalogs;

namespace KeplerTalento.Application.Features.Candidates;

/// <summary>
/// Projects the stored aggregate onto the wire contract, resolving catalog references
/// back to the names the contract speaks.
/// </summary>
/// <remarks>
/// Every write slice returns the whole projected aggregate, not just the part it changed,
/// so the browser cache can replace its entry from the response rather than compute a
/// guess about what the server did.
/// </remarks>
internal static class CandidateProjection
{
    /// <summary>The families any candidate projection needs, loaded in one pass.</summary>
    private static readonly string[] RelationFamilies =
    [
        CatalogFamilies.Language,
        CatalogFamilies.LanguageLevel,
        CatalogFamilies.Program,
        CatalogFamilies.ProgramLevel,
        CatalogFamilies.Skill,
        CatalogFamilies.SkillLevel,
        CatalogFamilies.EducationType,
        CatalogFamilies.EducationStatus,
        CatalogFamilies.Sector,
        CatalogFamilies.Tag,
    ];

    public static async Task<CandidateResponse> ToResponseAsync(
        Candidate candidate,
        IReadOnlyList<Domain.Documents.CandidateDocument> documents,
        CandidateCatalogLookup lookup,
        CancellationToken cancellationToken)
    {
        await lookup.PreloadAsync(RelationFamilies, cancellationToken);

        var languages = new List<CandidateLanguageResponse>(candidate.Languages.Count);
        foreach (var language in candidate.Languages)
        {
            languages.Add(new CandidateLanguageResponse(
                language.Id,
                await lookup.NameAsync(CatalogFamilies.Language, language.LanguageId, cancellationToken),
                await lookup.NameAsync(CatalogFamilies.LanguageLevel, language.LevelId, cancellationToken),
                language.Certification,
                language.Notes));
        }

        var programs = new List<CandidateProgramResponse>(candidate.Programs.Count);
        foreach (var program in candidate.Programs)
        {
            programs.Add(new CandidateProgramResponse(
                program.Id,
                await lookup.NameAsync(CatalogFamilies.Program, program.ProgramId, cancellationToken),
                await lookup.NameAsync(CatalogFamilies.ProgramLevel, program.LevelId, cancellationToken),
                program.YearsExperience,
                program.Notes));
        }

        var education = new List<CandidateEducationResponse>(candidate.Education.Count);
        foreach (var record in candidate.Education)
        {
            education.Add(new CandidateEducationResponse(
                record.Id,
                await lookup.NameAsync(CatalogFamilies.EducationType, record.EducationTypeId, cancellationToken),
                record.Degree,
                record.Specialty,
                record.Institution,
                await lookup.NameAsync(CatalogFamilies.EducationStatus, record.StatusId, cancellationToken),
                record.EndYear,
                record.Notes));
        }

        var experience = new List<CandidateExperienceResponse>(candidate.Experience.Count);
        foreach (var record in candidate.Experience)
        {
            experience.Add(new CandidateExperienceResponse(
                record.Id,
                record.Company,
                record.Position,
                record.SectorId is { } sectorId
                    ? await lookup.NameAsync(CatalogFamilies.Sector, sectorId, cancellationToken)
                    : null,
                RichTextLegacy.ToSafeHtml(record.Functions),
                record.StartDate?.ToString("yyyy-MM-dd"),
                record.EndDate?.ToString("yyyy-MM-dd"),
                record.YearsExperience,
                record.IsCurrent,
                record.Notes));
        }

        var skills = new List<CandidateSkillResponse>(candidate.Skills.Count);
        foreach (var skill in candidate.Skills)
        {
            skills.Add(new CandidateSkillResponse(
                skill.Id,
                await lookup.NameAsync(CatalogFamilies.Skill, skill.SkillId, cancellationToken),
                await lookup.NameAsync(CatalogFamilies.SkillLevel, skill.LevelId, cancellationToken),
                skill.Notes));
        }

        var tags = new List<CandidateTagResponse>(candidate.Tags.Count);
        foreach (var tag in candidate.Tags)
        {
            tags.Add(new CandidateTagResponse(
                tag.Id,
                await lookup.NameAsync(CatalogFamilies.Tag, tag.TagId, cancellationToken)));
        }

        var customNotes = candidate.CustomNotes
            .Where(note => note.IsActive)
            .OrderByDescending(note => note.CreatedAtUtc)
            .Select(CandidateNoteResponse.From)
            .ToArray();

        return new CandidateResponse(
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
            documents.Count,
            documents.FirstOrDefault(document => document.IsPrimary)?.Id,
            languages,
            programs,
            education,
            experience,
            skills,
            tags,
            customNotes,
            [.. documents.Select(CandidateDocumentResponse.From)]);
    }

    /// <summary>
    /// Loads the aggregate, projects it, and returns it. Used by every slice that must
    /// answer with the candidate as it now stands.
    /// </summary>
    public static async Task<CandidateResponse> ReloadAsync(
        ICandidateRepository candidates,
        CandidateCatalogLookup lookup,
        Guid id,
        CancellationToken cancellationToken)
    {
        var candidate = await candidates.FindAsync(id, cancellationToken)
            ?? throw CandidateGuards.NotFound();
        var documents = await candidates.ListDocumentsAsync(id, cancellationToken);
        return await ToResponseAsync(candidate, documents, lookup, cancellationToken);
    }
}
