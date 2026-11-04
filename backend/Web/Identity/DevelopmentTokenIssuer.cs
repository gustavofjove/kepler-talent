using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace KeplerTalento.Web.Identity;

/// <summary>
/// Mints signed tokens for local development and the e2e suite, so the sign-in path can be
/// exercised without the corporate tenant (design D8).
/// </summary>
/// <remarks>
/// <para>
/// This is a real token flow, not a bypass. The token it mints is signed, and the ordinary
/// JwtBearer pipeline checks its signature, issuer, audience and lifetime exactly as it checks a
/// tenant-issued one. Only the issuer differs, and there is no code path anywhere that skips
/// validation.
/// </para>
/// <para>
/// It is registered only outside Production, and configuring it in Production fails start-up
/// through the same <c>ValidateOnStart</c> mechanism that guards <see cref="DevelopmentActor"/>.
/// </para>
/// </remarks>
public sealed class DevelopmentTokenIssuer
{
    private readonly DevelopmentIssuerOptions options;
    private readonly KeplerAuthenticationOptions authentication;
    private readonly SigningCredentials credentials;

    public DevelopmentTokenIssuer(IOptions<KeplerAuthenticationOptions> authenticationOptions)
    {
        authentication = authenticationOptions.Value;
        options = authentication.DevelopmentIssuer
            ?? throw new InvalidOperationException("The development issuer is not configured.");
        credentials = new SigningCredentials(SigningKey(options), SecurityAlgorithms.HmacSha256);
    }

    /// <summary>
    /// Builds the key the issuer signs with and the bearer handler validates against, so the two
    /// cannot disagree about what a valid development token looks like.
    /// </summary>
    /// <summary>
    /// The <c>kid</c> this issuer signs with. Distinct from the local-account issuer's, so a token
    /// naming one issuer cannot validate against the other's key (KTL-45 design D1).
    /// </summary>
    public const string KeyId = "ktl-development";

    public static SymmetricSecurityKey SigningKey(DevelopmentIssuerOptions options)
    {
        var key = options.SigningKey ?? string.Empty;
        var bytes = Encoding.UTF8.GetBytes(key);
        if (bytes.Length < DevelopmentIssuerOptions.MinimumSigningKeyBytes)
        {
            throw new InvalidOperationException(
                $"Authentication:DevelopmentIssuer:SigningKey must be at least "
                + $"{DevelopmentIssuerOptions.MinimumSigningKeyBytes} bytes.");
        }
        return new SymmetricSecurityKey(bytes) { KeyId = KeyId };
    }

    /// <summary>
    /// Mints a token for a named subject. The subject is whatever the caller asks for, which is
    /// the point: a development token is not a credential check, it is a way to be a given
    /// person. What that person may then do is decided by their stored role, exactly as in
    /// production.
    /// </summary>
    public string Issue(string subject, string displayName, string email)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims:
            [
                new Claim(authentication.SubjectClaim, subject),
                new Claim("name", displayName),
                new Claim("email", email),
            ],
            notBefore: now,
            expires: now.AddMinutes(options.TokenLifetimeMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
