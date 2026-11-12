using FluentValidation;
using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Domain.Candidates;
using MediatR;

namespace KeplerTalento.Application.Features.Candidates;

public sealed record UpdateCandidateCommand(
    Guid Id,
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
    uint Version) : IRequest<CandidateResponse>;

public sealed class UpdateCandidateValidator : AbstractValidator<UpdateCandidateCommand>
{
    public UpdateCandidateValidator()
    {
        RuleFor(command => command.FirstName)
            .Must(value => !string.IsNullOrWhiteSpace(value))
            .WithErrorCode(CandidateErrors.FirstNameRequired)
            .WithMessage(CandidateErrors.FirstNameRequiredMessage);
        RuleFor(command => command.LastName)
            .Must(value => !string.IsNullOrWhiteSpace(value))
            .WithErrorCode(CandidateErrors.LastNameRequired)
            .WithMessage(CandidateErrors.LastNameRequiredMessage);
        RuleFor(command => command.FirstName).MustFitWithin(CandidateTextLimits.FirstName);
        RuleFor(command => command.LastName).MustFitWithin(CandidateTextLimits.LastName);
        RuleFor(command => command.Phone).ContactLength(CandidateTextLimits.Phone);
        RuleFor(command => command.Email).ContactLength(CandidateTextLimits.Email).ValidEmail();
        CandidateContactRules.Phone(this, command => command.Phone);
        RuleFor(command => command.Location).MustFitWithin(CandidateTextLimits.Location);
        RuleFor(command => command.Province).MustFitWithin(CandidateTextLimits.Province);
        RuleFor(command => command.Country).MustFitWithin(CandidateTextLimits.Country);
        RuleFor(command => command.Source).MustFitWithin(CandidateTextLimits.Source);
        RuleFor(command => command.ReceivedAt).MustBeAWireDate();
        RuleFor(command => command.ConsentAt).MustBeAWireDate();
        RuleFor(command => command.ReviewDueAt).MustBeAWireDate();
    }
}

public sealed class UpdateCandidateHandler(
    ICandidateRepository candidates,
    ICatalogRepository catalogs,
    ICurrentActor actor)
    : IRequestHandler<UpdateCandidateCommand, CandidateResponse>
{
    public async Task<CandidateResponse> Handle(
        UpdateCandidateCommand request,
        CancellationToken cancellationToken)
    {
        CandidateGuards.RequireUpdate(actor);
        var candidate = await candidates.FindAsync(request.Id, cancellationToken)
            ?? throw CandidateGuards.NotFound();

        var now = DateTimeOffset.UtcNow;
        // The identifier and the creation timestamp are not in the writable set at all:
        // there is no setter for either, so an update cannot reach them.
        candidates.ExpectVersion(candidate, request.Version);
        candidate.UpdateDetails(
            request.FirstName,
            request.LastName,
            request.Phone,
            request.Email,
            request.Location,
            request.Province,
            request.Country,
            request.Source,
            request.Notes,
            now);
        // Absent and empty are different requests. A field the caller omitted entirely
        // leaves the stored metadata alone; an explicitly empty one clears it. Collapsing
        // the two would let an update that only changed a phone number silently drop a
        // consent date.
        candidate.SetConsent(
            Metadata(request.ReceivedAt, candidate.ReceivedAt),
            Metadata(request.ConsentAt, candidate.ConsentAt),
            Metadata(request.ReviewDueAt, candidate.ReviewDueAt),
            now);

        var outcome = await candidates.SaveAsync(
            CandidateAuditEvents.Updated,
            candidate.Id.ToString("N"),
            cancellationToken);
        if (outcome != CandidateSaveOutcome.Saved)
        {
            throw CandidateGuards.ToException(outcome);
        }
        var documents = await candidates.ListDocumentsAsync(candidate.Id, cancellationToken);
        return await CandidateProjection.ToResponseAsync(
            candidate,
            documents,
            new CandidateCatalogLookup(catalogs),
            cancellationToken);
    }

    private static DateOnly? Metadata(string? submitted, DateOnly? stored)
    {
        if (submitted is null)
        {
            return stored;
        }
        CandidateDates.TryFromWire(submitted, out var parsed);
        return parsed;
    }
}
