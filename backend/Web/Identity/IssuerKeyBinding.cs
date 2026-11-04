using Microsoft.IdentityModel.Tokens;

namespace KeplerTalento.Web.Identity;

/// <summary>
/// Ties each application-owned signing key to the one issuer allowed to use it (KTL-45 design D1).
/// </summary>
/// <remarks>
/// The bearer handler holds the development key and the local-account key side by side. Without
/// this, a token naming the local-account issuer but signed with the development key, whose value
/// sits in the compose file, would validate. Keys this class does not know (the provider's, from
/// its discovery document) are left to the normal validation.
/// </remarks>
public sealed class IssuerKeyBinding
{
    private readonly Dictionary<string, string> issuerByKeyId = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> keyIdByIssuer = new(StringComparer.Ordinal);

    public void Bind(string issuer, SecurityKey key)
    {
        var keyId = key.KeyId ?? throw new ArgumentException("A bound key needs a key id.", nameof(key));
        issuerByKeyId[keyId] = issuer;
        keyIdByIssuer[issuer] = keyId;
    }

    public bool IsEmpty => issuerByKeyId.Count == 0;

    /// <summary>Whether <paramref name="key"/> may vouch for a token naming <paramref name="tokenIssuer"/>.</summary>
    public bool Allows(SecurityKey key, string? tokenIssuer)
    {
        if (key.KeyId is { } keyId && issuerByKeyId.TryGetValue(keyId, out var boundIssuer))
        {
            return string.Equals(boundIssuer, tokenIssuer, StringComparison.Ordinal);
        }
        // A foreign key must not vouch for one of our issuers either.
        return tokenIssuer is null || !keyIdByIssuer.ContainsKey(tokenIssuer);
    }
}
