using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

using KeplerTalento.Application.Features.Identity;

using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace KeplerTalento.Web.Identity;

/// <summary>
/// Mints the access token a successful password sign-in returns (KTL-45 design D1).
/// </summary>
/// <remarks>
/// <para>
/// The same JwtBearer pipeline that checks Entra and development tokens checks these: signature,
/// issuer, audience and lifetime. Only the issuer and key are this class's own.
/// </para>
/// <para>
/// The token names the account and nothing it may do. Roles and permissions are still read from
/// <c>ADM_Users</c> and <c>ADM_Roles</c> on every request, so a role change or a deactivation
/// applies to a token already issued.
/// </para>
/// </remarks>
public sealed class LocalAccountTokenIssuer
{
    /// <summary>The <c>kid</c> this issuer signs with; the bearer handler resolves keys by it.</summary>
    public const string KeyId = "ktl-local-accounts";

    private readonly LocalAccountsOptions options;
    private readonly KeplerAuthenticationOptions authentication;
    private readonly SigningCredentials credentials;

    public LocalAccountTokenIssuer(IOptions<KeplerAuthenticationOptions> authenticationOptions)
    {
        authentication = authenticationOptions.Value;
        options = authentication.LocalAccounts
            ?? throw new InvalidOperationException("Local accounts are not configured.");
        credentials = new SigningCredentials(SigningKey(options), SecurityAlgorithms.HmacSha256);
    }

    public int LifetimeSeconds => options.TokenLifetimeMinutes * 60;

    /// <summary>
    /// The key the issuer signs with and the bearer handler validates against, built in one place
    /// so the two cannot disagree. Start-up validation has already checked its length.
    /// </summary>
    public static SymmetricSecurityKey SigningKey(LocalAccountsOptions options) =>
        new(Encoding.UTF8.GetBytes(options.SigningKey ?? string.Empty)) { KeyId = KeyId };

    public string Issue(SignedInUser user)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims:
            [
                new Claim(authentication.SubjectClaim, user.ExternalSubject),
                new Claim("name", user.DisplayName),
                new Claim("email", user.Email),
            ],
            notBefore: now,
            expires: now.AddMinutes(options.TokenLifetimeMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
