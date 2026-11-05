using FluentValidation;
using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Application.Abstractions.RichText;
using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Application.Features.Search;
using KeplerTalento.Domain.Positions;
using MediatR;

namespace KeplerTalento.Application.Features.Positions;

public sealed record CreatePositionCommand(string? Title, string? Description, string? Location, SearchFiltersInput? Requirements) : IRequest<PositionResponse>;
public sealed record UpdatePositionCommand(Guid Id, string? Title, string? Description, string? Location, string? Status, SearchFiltersInput? Requirements, uint Version) : IRequest<PositionResponse>;

public sealed class CreatePositionValidator : AbstractValidator<CreatePositionCommand>
{
    public CreatePositionValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithErrorCode(PositionErrors.TitleRequired).MaximumLength(PositionText.MaximumTitleLength).WithErrorCode(PositionErrors.TitleTooLong);
        RuleFor(x => x.Location).MaximumLength(PositionText.MaximumLocationLength).WithErrorCode(PositionErrors.LocationTooLong);
        RuleFor(x => x.Description).MaximumLength(PositionText.MaximumDescriptionLength).WithErrorCode(PositionErrors.DescriptionTooLong);
    }
}
public sealed class UpdatePositionValidator : AbstractValidator<UpdatePositionCommand>
{
    public UpdatePositionValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithErrorCode(PositionErrors.TitleRequired).MaximumLength(PositionText.MaximumTitleLength).WithErrorCode(PositionErrors.TitleTooLong);
        RuleFor(x => x.Location).MaximumLength(PositionText.MaximumLocationLength).WithErrorCode(PositionErrors.LocationTooLong);
        RuleFor(x => x.Description).MaximumLength(PositionText.MaximumDescriptionLength).WithErrorCode(PositionErrors.DescriptionTooLong);
        RuleFor(x => x.Status).Must(value => value is not null && PositionStatuses.IsKnown(value)).WithErrorCode(PositionErrors.StatusInvalid);
        RuleFor(x => x.Version).GreaterThan(0u).WithErrorCode(PositionErrors.VersionInvalid);
    }
}

public sealed class CreatePositionHandler(IPositionRepository positions, IRichTextSanitizer sanitizer, ICurrentActor actor) : IRequestHandler<CreatePositionCommand, PositionResponse>
{
    public async Task<PositionResponse> Handle(CreatePositionCommand request, CancellationToken cancellationToken)
    {
        PositionGuards.RequireManage(actor);
        var filters = SearchFilterNormalization.Normalize(request.Requirements, "Requirements");
        var now = DateTimeOffset.UtcNow;
        var position = new Position(Guid.CreateVersion7(), request.Title!, PositionDescription.Sanitize(sanitizer, request.Description), request.Location ?? string.Empty, SearchFilterDocument.Serialize(filters), SearchFilterNormalization.FilterSchemaVersion, now);
        positions.Add(position);
        await Save(positions, PositionAuditEvents.Created, cancellationToken);
        return position.ToResponse();
    }
    internal static async Task Save(IPositionRepository positions, string eventType, CancellationToken cancellationToken)
    {
        var outcome = await positions.SaveAsync(eventType, cancellationToken);
        if (outcome == PositionSaveOutcome.TitleConflict) throw new ConflictException(PositionErrors.TitleConflict, "Ya existe una posición con ese título.");
        if (outcome == PositionSaveOutcome.ConcurrencyConflict) throw new ConflictException(PositionErrors.ConcurrencyConflict, "La posición ha cambiado. Vuelva a cargarla.");
        if (outcome == PositionSaveOutcome.ConstraintViolation) throw new RequestValidationException([new("Position", PositionErrors.RequirementsInvalid, "La posición no es válida.")]);
    }
}

public sealed class UpdatePositionHandler(IPositionRepository positions, IRichTextSanitizer sanitizer, ICurrentActor actor) : IRequestHandler<UpdatePositionCommand, PositionResponse>
{
    public async Task<PositionResponse> Handle(UpdatePositionCommand request, CancellationToken cancellationToken)
    {
        PositionGuards.RequireManage(actor);
        var filters = SearchFilterNormalization.Normalize(request.Requirements, "Requirements");
        var position = await positions.FindAsync(request.Id, cancellationToken) ?? throw new NotFoundException(PositionErrors.NotFound, "Posición no encontrada.");
        var priorStatus = position.Status;
        positions.ExpectVersion(position, request.Version);
        position.Update(request.Title!, PositionDescription.Sanitize(sanitizer, request.Description), request.Location ?? string.Empty, request.Status!, SearchFilterDocument.Serialize(filters), SearchFilterNormalization.FilterSchemaVersion, DateTimeOffset.UtcNow);
        await CreatePositionHandler.Save(positions, priorStatus == position.Status ? PositionAuditEvents.Updated : PositionAuditEvents.StatusChanged, cancellationToken);
        return position.ToResponse();
    }
}
