using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Application.Abstractions.RichText;
using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Application.Features.Search;
using KeplerTalento.Domain.Positions;

namespace KeplerTalento.Application.Features.Positions;

public sealed record PositionResponse(
    Guid Id,
    string Title,
    string Description,
    string Location,
    string Status,
    SearchFiltersInput Requirements,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    uint Version);

public sealed record PositionListItemResponse(
    Guid Id, string Title, string Location, string Status, DateTimeOffset UpdatedAtUtc, uint Version, int CandidateCount,
    PositionStageCountsResponse StageCounts);

/// <summary>Per-stage link counts (KTL-40), named after <see cref="PositionCandidateStages"/>.</summary>
public sealed record PositionStageCountsResponse(int New, int Shortlisted, int Interview, int Hired, int Rejected)
{
    public static PositionStageCountsResponse From(PositionStageCounts counts) =>
        new(counts.New, counts.Shortlisted, counts.Interview, counts.Hired, counts.Rejected);
}

public sealed record PositionPageResponse(
    IReadOnlyList<PositionListItemResponse> Items, int Page, int PageSize, int TotalCount);

/// <summary>
/// A position's link to one candidate (KTL-30): the search result's contact columns, never
/// documents, notes or other candidate fields. <see cref="PrimaryCvPreviewable"/> follows the
/// candidate search rule and masking (KTL-35).
/// </summary>
public sealed record PositionCandidateResponse(
    Guid CandidateId,
    string FirstName,
    string LastName,
    string Email,
    string Phone,
    bool HasPrimaryCv,
    bool PrimaryCvPreviewable,
    bool PrimaryCvDownloadable,
    bool CandidateIsActive,
    string Stage,
    DateTimeOffset AddedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    uint Version);

/// <summary>A candidate's link to one position (KTL-30). No description or requirements.</summary>
public sealed record CandidatePositionResponse(
    Guid PositionId,
    string Title,
    string PositionStatus,
    string Stage,
    DateTimeOffset AddedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    uint Version);

public static class PositionErrors
{
    public const string CandidateAlreadyLinked = "position.candidate.already_linked";
    public const string CandidatePositionClosed = "position.candidate.position_closed";
    public const string CandidateInactive = "position.candidate.candidate_inactive";
    public const string CandidateLimitReached = "position.candidate.limit_reached";
    public const string CandidateStageInvalid = "position.candidate.stage_invalid";
    public const string CandidateRequired = "position.candidate.candidate_required";
    public const string CandidateLinkNotFound = "position.candidate.not_found";
    public const string CandidateConcurrencyConflict = "position.candidate.concurrency_conflict";
    public const string NotFound = "position.not_found";
    public const string TitleRequired = "position.title.required";
    public const string TitleTooLong = "position.title.too_long";
    public const string TitleConflict = "position.title.conflict";
    public const string LocationTooLong = "position.location.too_long";
    public const string DescriptionTooLong = "position.description.too_long";
    public const string StatusInvalid = "position.status.invalid";
    public const string RequirementsInvalid = "position.requirements.invalid";
    public const string VersionInvalid = "position.version.invalid";
    public const string ConcurrencyConflict = "position.concurrency.conflict";
    public const string PageInvalid = "position.page.invalid";
    public const string PageSizeInvalid = "position.page_size.invalid";
    public const string SortFieldInvalid = "position.sort_field.invalid";
    public const string SortDirectionInvalid = "position.sort_direction.invalid";
    public const string TextTooLong = "position.text.too_long";
}

internal static class PositionDescription
{
    public static string Sanitize(IRichTextSanitizer sanitizer, string? input)
    {
        var sanitized = sanitizer.Sanitize(input ?? string.Empty, RichTextProfile.PositionDescription);
        if (sanitized.Length > PositionText.MaximumDescriptionLength)
        {
            throw new RequestValidationException([new ValidationIssue(
                "Description",
                PositionErrors.DescriptionTooLong,
                "La descripción de la posición es demasiado larga.")]);
        }
        return sanitized;
    }
}

internal static class PositionGuards
{
    public static void RequireRead(ICurrentActor actor) => Require(actor, Permissions.PositionsRead);
    public static void RequireManage(ICurrentActor actor) => Require(actor, Permissions.PositionsManage);

    // KTL-30: a link names the people a position is considering, so every link operation also
    // needs candidates.read. Neither permission implies the other.
    public static void RequireReadCandidates(ICurrentActor actor) => Require(actor, Permissions.PositionsRead, Permissions.CandidatesRead);
    public static void RequireManageCandidates(ICurrentActor actor) => Require(actor, Permissions.PositionsManage, Permissions.CandidatesRead);

    private static void Require(ICurrentActor actor, params string[] permissions)
    {
        if (!actor.IsAuthenticated || !permissions.All(actor.HasPermission)) throw new ForbiddenException();
    }
}

internal static class PositionCandidateChecks
{
    public static async Task RequireOpenPosition(IPositionRepository positions, Guid positionId, CancellationToken cancellationToken)
    {
        var open = await positions.IsPositionOpenAsync(positionId, cancellationToken)
            ?? throw new NotFoundException(PositionErrors.NotFound, "Posición no encontrada.");
        if (!open) throw new ConflictException(PositionErrors.CandidatePositionClosed, "La posición está cerrada; reábrela para modificar sus candidatos.");
    }

    public static async Task<PositionCandidate> RequireLink(IPositionRepository positions, Guid positionId, Guid candidateId, CancellationToken cancellationToken) =>
        await positions.FindLinkAsync(positionId, candidateId, cancellationToken)
            ?? throw new NotFoundException(PositionErrors.CandidateLinkNotFound, "El candidato no está en esta posición.");

    public static async Task Save(IPositionRepository positions, string eventType, PositionCandidate link, CancellationToken cancellationToken)
    {
        var outcome = await positions.SaveLinkAsync(eventType, link, cancellationToken);
        if (outcome == PositionSaveOutcome.AlreadyLinked) throw new ConflictException(PositionErrors.CandidateAlreadyLinked, "El candidato ya está en esta posición.");
        if (outcome == PositionSaveOutcome.ConcurrencyConflict) throw new ConflictException(PositionErrors.CandidateConcurrencyConflict, "El candidato ha cambiado en esta posición. Vuelva a cargarla.");
        // A reference violation means the position or candidate vanished between check and save.
        if (outcome == PositionSaveOutcome.ConstraintViolation) throw new NotFoundException(PositionErrors.CandidateLinkNotFound, "El candidato no está en esta posición.");
    }

    /// <summary>
    /// Maps a link for <paramref name="actor"/>. The previewable flag is only exposed to actors who
    /// can download documents (KTL-35), so every caller goes through this one masking point.
    /// The downloadable flag follows the same rule.
    /// </summary>
    public static PositionCandidateResponse ToResponse(this PositionCandidateItem item, ICurrentActor actor)
    {
        var canDownload = actor.HasPermission(Permissions.DocumentsDownload);
        return new(
            item.CandidateId, item.FirstName, item.LastName, item.Email, item.Phone, item.HasPrimaryCv,
            item.PrimaryCvPreviewable && canDownload,
            item.PrimaryCvDownloadable && canDownload,
            item.CandidateIsActive, item.Stage, item.AddedAtUtc, item.UpdatedAtUtc, item.Version);
    }
}

internal static class PositionMapping
{
    public static PositionResponse ToResponse(this Position position)
    {
        var filters = SearchFilterDocument.Parse(
            position.Requirements,
            PositionErrors.RequirementsInvalid,
            "Los requisitos de la posición almacenados no son válidos.");
        return new PositionResponse(
            position.Id, position.Title, position.Description, position.Location, position.Status,
            filters.ToInput(), position.CreatedAtUtc, position.UpdatedAtUtc, position.Version);
    }
}
