using FluentValidation;
using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Domain.Identity;
using MediatR;

namespace KeplerTalento.Application.Features.Identity;

/// <summary>Exchanges a local account's user name and password for the account (KTL-45).</summary>
public sealed record SignInWithPasswordCommand(string UserName, string Password) : IRequest<SignedInUser>;

/// <summary>What the token issuer needs, and nothing a response could leak: no hash, no role.</summary>
public sealed record SignedInUser(Guid Id, string ExternalSubject, string DisplayName, string Email);

/// <summary>
/// Shape only. A failure here depends on the input alone, never on whether an account exists, so
/// a 400 tells a caller nothing the 401 would not.
/// </summary>
public sealed class SignInWithPasswordValidator : AbstractValidator<SignInWithPasswordCommand>
{
    public const int MaximumPasswordLength = 256;

    public SignInWithPasswordValidator()
    {
        RuleFor(command => command.UserName).NotEmpty().MaximumLength(User.MaximumUserNameLength);
        RuleFor(command => command.Password).NotEmpty().MaximumLength(MaximumPasswordLength);
    }
}

/// <summary>
/// Anonymous by necessity: it is the step that produces an actor, so there is no
/// <see cref="ICurrentActor"/> to guard on. Its fail-closed equivalents are the single refusal
/// below, the equal cost of every outcome, and the endpoint's rate limit (design D4, D5).
/// </summary>
public sealed class SignInWithPasswordHandler(IUserRepository users, IPasswordHasher hasher)
    : IRequestHandler<SignInWithPasswordCommand, SignedInUser>
{
    // Verified against when there is no stored hash, so an unknown user name costs the same work
    // as a wrong password and the response time does not reveal which one it was.
    private static string? dummyHash;

    public async Task<SignedInUser> Handle(SignInWithPasswordCommand request, CancellationToken cancellationToken)
    {
        var user = await users.FindByUserNameAsync(request.UserName, cancellationToken);
        var storedHash = user?.PasswordHash;

        var verified = hasher.Verify(request.Password, storedHash ?? DummyHash());

        // Checked after the hash, so an inactive account costs the same as any other refusal.
        if (user is null || storedHash is null || !verified || !user.IsActive || user.ExternalSubject is null)
        {
            throw new InvalidCredentialsException();
        }

        return new SignedInUser(user.Id, user.ExternalSubject, user.DisplayName, user.Email);
    }

    private string DummyHash() => dummyHash ??= hasher.Hash(Guid.NewGuid().ToString("N"));
}
