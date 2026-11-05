using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Application.Features.Candidates;
using KeplerTalento.Application.Features.Candidates.Notes;
using MediatR;

namespace KeplerTalento.Web.Features.Candidates;

/// <summary>
/// The candidate aggregate. There is deliberately no DELETE verb anywhere in this group:
/// a candidate is removed logically, through the <c>active</c> sub-resource, and the
/// runtime database role holds no DELETE on the candidate tables either.
/// </summary>
/// <remarks>
/// Every route authorizes before dispatching. Doing it inside the handler would let an
/// unauthorized caller distinguish an existing candidate from a missing one by the shape
/// of the refusal, which is a disclosure the refusal exists to prevent.
/// </remarks>
public static class CandidateEndpoints
{
    public sealed record CandidateFieldsRequest(
        string FirstName,
        string LastName,
        string Phone,
        string Email,
        string Location,
        string Province,
        string Country,
        string Source,
        string Notes,
        string? ReceivedAt,
        string? ConsentAt,
        string? ReviewDueAt);

    public sealed record UpdateCandidateRequest(
        string FirstName,
        string LastName,
        string Phone,
        string Email,
        string Location,
        string Province,
        string Country,
        string Source,
        string Notes,
        string? ReceivedAt,
        string? ConsentAt,
        string? ReviewDueAt,
        uint Version);

    public sealed record SetCandidateActiveRequest(bool IsActive, uint Version);

    /// <summary>
    /// An availability check (KTL-36). There is no checker field: the server records the
    /// current actor, so a caller cannot attribute a check to someone else.
    /// </summary>
    public sealed record RecordAvailabilityRequest(string State, string? CheckedOn, string? Until, uint Version);

    public sealed record SetLanguagesRequest(IReadOnlyList<CandidateLanguageInput>? Languages, uint Version);

    public sealed record SetProgramsRequest(IReadOnlyList<CandidateProgramInput>? Programs, uint Version);

    public sealed record SetEducationRequest(IReadOnlyList<CandidateEducationInput>? Education, uint Version);

    public sealed record SetExperienceRequest(IReadOnlyList<CandidateExperienceInput>? Experience, uint Version);

    public sealed record SetSkillsRequest(IReadOnlyList<CandidateSkillInput>? Skills, uint Version);

    public sealed record SetTagsRequest(IReadOnlyList<CandidateTagInput>? Tags, uint Version);

    public sealed record AddNoteRequest(string? Body);

    public sealed record UpdateNoteRequest(string? Body, uint Version);

    public sealed record SetNoteActiveRequest(bool IsActive, uint Version);

    public static IEndpointRouteBuilder MapCandidateEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/candidates").WithTags("Candidates");

        group.MapGet("/", async (
                bool? includeInactive,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesRead);
                var candidates = await sender.Send(
                    new ListCandidatesQuery(includeInactive ?? false),
                    cancellationToken);
                return Results.Ok(candidates);
            })
            .WithName("ListCandidates")
            .Produces<IReadOnlyList<CandidateSummaryResponse>>()
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapGet("/{id:guid}", async (
                Guid id,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesRead);
                var candidate = await sender.Send(new GetCandidateQuery(id), cancellationToken);
                return Results.Ok(candidate);
            })
            .WithName("GetCandidate")
            .Produces<CandidateResponse>()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/", async (
                CandidateFieldsRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesCreate);
                var created = await sender.Send(
                    new CreateCandidateCommand(
                        request.FirstName,
                        request.LastName,
                        request.Phone,
                        request.Email,
                        request.Location,
                        request.Province,
                        request.Country,
                        request.Source,
                        request.Notes,
                        request.ReceivedAt,
                        request.ConsentAt,
                        request.ReviewDueAt),
                    cancellationToken);
                return Results.Created($"/api/candidates/{created.Id}", created);
            })
            .WithName("CreateCandidate")
            .Produces<CandidateResponse>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapPut("/{id:guid}", async (
                Guid id,
                UpdateCandidateRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                var updated = await sender.Send(
                    new UpdateCandidateCommand(
                        id,
                        request.FirstName,
                        request.LastName,
                        request.Phone,
                        request.Email,
                        request.Location,
                        request.Province,
                        request.Country,
                        request.Source,
                        request.Notes,
                        request.ReceivedAt,
                        request.ConsentAt,
                        request.ReviewDueAt,
                        request.Version),
                    cancellationToken);
                return Results.Ok(updated);
            })
            .WithName("UpdateCandidate")
            .Produces<CandidateResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        // Removal and restoration are the same transition, and candidates.delete governs
        // both: restoring a withdrawn record is as consequential as withdrawing it.
        group.MapPut("/{id:guid}/active", async (
                Guid id,
                SetCandidateActiveRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesDelete);
                var updated = await sender.Send(
                    new SetCandidateActiveCommand(id, request.IsActive, request.Version),
                    cancellationToken);
                return Results.Ok(updated);
            })
            .WithName("SetCandidateActive")
            .Produces<CandidateResponse>()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        // Every availability write is a check, reconfirmation and undo included (KTL-36).
        // The body is read by hand, after the permission check: framework binding would parse it
        // first, so a malformed body would answer differently from a valid one for a caller
        // who may not write at all (fail closed before validation, KTL-36 criterion 11).
        group.MapPut("/{id:guid}/availability", async (
                Guid id,
                HttpRequest http,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                var request = await ReadAvailabilityAsync(http, cancellationToken);
                return Results.Ok(await sender.Send(
                    new RecordCandidateAvailabilityCommand(
                        id,
                        request.State,
                        request.CheckedOn,
                        request.Until,
                        request.Version),
                    cancellationToken));
            })
            .WithName("RecordCandidateAvailability")
            .Accepts<RecordAvailabilityRequest>("application/json")
            .Produces<CandidateResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        // The six collection routes share a shape — PUT the complete set with the
        // candidate's version — but each is mapped with its own concrete request type.
        // A generic helper cannot stand in for them: minimal APIs do not infer a body
        // binding for a generic type parameter, and the request silently arrives with
        // default values instead.
        group.MapPut("/{id:guid}/languages", async (
                Guid id,
                SetLanguagesRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                return Results.Ok(await sender.Send(
                    new SetCandidateLanguagesCommand(id, request.Languages ?? [], request.Version),
                    cancellationToken));
            })
            .WithName("SetCandidateLanguages")
            .WithCollectionResponses();

        group.MapPut("/{id:guid}/programs", async (
                Guid id,
                SetProgramsRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                return Results.Ok(await sender.Send(
                    new SetCandidateProgramsCommand(id, request.Programs ?? [], request.Version),
                    cancellationToken));
            })
            .WithName("SetCandidatePrograms")
            .WithCollectionResponses();

        group.MapPut("/{id:guid}/education", async (
                Guid id,
                SetEducationRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                return Results.Ok(await sender.Send(
                    new SetCandidateEducationCommand(id, request.Education ?? [], request.Version),
                    cancellationToken));
            })
            .WithName("SetCandidateEducation")
            .WithCollectionResponses();

        // Read by hand after the permission check, as availability is (KTL-46): functions carry
        // rich text, so a malformed body must answer an unauthorised caller exactly as a valid
        // one does.
        group.MapPut("/{id:guid}/experience", async (
                Guid id,
                HttpRequest http,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                var request = await ReadRequestAsync<SetExperienceRequest>(http, cancellationToken);
                return Results.Ok(await sender.Send(
                    new SetCandidateExperienceCommand(id, request.Experience ?? [], request.Version),
                    cancellationToken));
            })
            .WithName("SetCandidateExperience")
            .Accepts<SetExperienceRequest>("application/json")
            .WithCollectionResponses();

        group.MapPut("/{id:guid}/skills", async (
                Guid id,
                SetSkillsRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                return Results.Ok(await sender.Send(
                    new SetCandidateSkillsCommand(id, request.Skills ?? [], request.Version),
                    cancellationToken));
            })
            .WithName("SetCandidateSkills")
            .WithCollectionResponses();

        group.MapPut("/{id:guid}/tags", async (
                Guid id,
                SetTagsRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                return Results.Ok(await sender.Send(
                    new SetCandidateTagsCommand(id, request.Tags ?? [], request.Version),
                    cancellationToken));
            })
            .WithName("SetCandidateTags")
            .WithCollectionResponses();

        group.MapGet("/{id:guid}/notes", async (
                Guid id,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesRead);
                return Results.Ok(await sender.Send(new ListCandidateNotesQuery(id), cancellationToken));
            })
            .WithName("ListCandidateNotes")
            .Produces<IReadOnlyList<CandidateNoteResponse>>()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/{id:guid}/notes", async (
                Guid id,
                AddNoteRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                var note = await sender.Send(
                    new AddCandidateNoteCommand(id, request.Body),
                    cancellationToken);
                return Results.Created($"/api/candidates/{id}/notes/{note.Id}", note);
            })
            .WithName("AddCandidateNote")
            .Produces<CandidateNoteResponse>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}/notes/{noteId:guid}", async (
                Guid id,
                Guid noteId,
                UpdateNoteRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                return Results.Ok(await sender.Send(
                    new UpdateCandidateNoteCommand(id, noteId, request.Body, request.Version),
                    cancellationToken));
            })
            .WithName("UpdateCandidateNote")
            .Produces<CandidateNoteResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPut("/{id:guid}/notes/{noteId:guid}/active", async (
                Guid id,
                Guid noteId,
                SetNoteActiveRequest request,
                ISender sender,
                ICurrentActor actor,
                CancellationToken cancellationToken) =>
            {
                Require(actor, Permissions.CandidatesUpdate);
                return Results.Ok(await sender.Send(
                    new SetCandidateNoteActiveCommand(
                        id,
                        noteId,
                        request.IsActive,
                        request.Version),
                    cancellationToken));
            })
            .WithName("SetCandidateNoteActive")
            .Produces<CandidateNoteResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        return endpoints;
    }

    private static RouteHandlerBuilder WithCollectionResponses(this RouteHandlerBuilder builder) =>
        builder
            .Produces<CandidateResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

    private static async Task<RecordAvailabilityRequest> ReadAvailabilityAsync(
        HttpRequest http,
        CancellationToken cancellationToken)
    {
        try
        {
            return await http.ReadFromJsonAsync<RecordAvailabilityRequest>(cancellationToken)
                ?? throw UnreadableAvailability();
        }
        catch (Exception exception) when (exception is System.Text.Json.JsonException
            or InvalidOperationException
            or BadHttpRequestException)
        {
            throw UnreadableAvailability();
        }
    }

    /// <summary>Reads a body that framework binding would otherwise parse before authorization.</summary>
    private static async Task<T> ReadRequestAsync<T>(HttpRequest http, CancellationToken cancellationToken)
        where T : class
    {
        try
        {
            return await http.ReadFromJsonAsync<T>(cancellationToken) ?? throw CandidateRequestUnreadable();
        }
        catch (Exception exception) when (exception is System.Text.Json.JsonException
            or InvalidOperationException
            or BadHttpRequestException)
        {
            throw CandidateRequestUnreadable();
        }
    }

    private static RequestValidationException CandidateRequestUnreadable() =>
        new([new ValidationIssue(
            "Request",
            CandidateErrors.ConstraintViolation,
            CandidateErrors.ConstraintViolationMessage)]);

    private static RequestValidationException UnreadableAvailability() =>
        new([new ValidationIssue(
            "Request",
            CandidateErrors.AvailabilityInvalid,
            CandidateErrors.AvailabilityInvalidMessage)]);

    private static void Require(ICurrentActor actor, string permission)
    {
        if (!actor.IsAuthenticated || !actor.HasPermission(permission))
        {
            throw new ForbiddenException();
        }
    }
}
