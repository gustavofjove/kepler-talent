using KeplerTalento.Application.Features.Identity;
using KeplerTalento.Web.Identity;
using MediatR;

namespace KeplerTalento.Web.Features.Identity;

/// <summary>
/// Password sign-in for local accounts (KTL-45). Mapped only when
/// <c>Authentication:LocalAccounts:Enabled</c> is set; otherwise the route does not exist.
/// </summary>
/// <remarks>
/// Anonymous by necessity, like the development token endpoint: it is how a caller acquires the
/// token every other endpoint requires. Every refusal is the same 401, and the attempts are
/// rate-limited per client address before the password is ever checked (design D4, D5).
/// </remarks>
public static class PasswordSignInEndpoints
{
    public const string RateLimitPolicy = "password-sign-in";

    public sealed record SignInWithPasswordRequest(string? UserName, string? Password);

    public sealed record SignInWithPasswordResponse(string AccessToken, string TokenType, int ExpiresInSeconds);

    public static IEndpointRouteBuilder MapPasswordSignInEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/auth").WithTags("Identity").AllowAnonymous();

        group.MapPost("/token", async (
                SignInWithPasswordRequest request,
                ISender sender,
                LocalAccountTokenIssuer issuer,
                ILoggerFactory loggerFactory,
                CancellationToken cancellationToken) =>
            {
                var logger = loggerFactory.CreateLogger(typeof(PasswordSignInEndpoints));
                SignedInUser user;
                try
                {
                    user = await sender.Send(
                        new SignInWithPasswordCommand(request.UserName ?? string.Empty, request.Password ?? string.Empty),
                        cancellationToken);
                }
                catch (Application.Common.Errors.InvalidCredentialsException)
                {
                    // Outcome only: never the user name, which names a person, nor anything about
                    // which check failed.
                    logger.LogInformation("Password sign-in refused");
                    throw;
                }

                logger.LogInformation("Password sign-in succeeded for user {UserId}", user.Id);
                return Results.Ok(new SignInWithPasswordResponse(issuer.Issue(user), "Bearer", issuer.LifetimeSeconds));
            })
            .RequireRateLimiting(RateLimitPolicy)
            .WithName("SignInWithPassword")
            .Produces<SignInWithPasswordResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        return endpoints;
    }
}
