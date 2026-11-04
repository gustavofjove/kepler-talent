namespace KeplerTalento.Web.Identity;

/// <summary>
/// How the API decides who a caller is. Bound from the <c>Authentication</c> section and
/// validated at start-up, so a misconfiguration is a refusal to boot rather than a request that
/// authenticates against nothing.
/// </summary>
public sealed class KeplerAuthenticationOptions
{
    public const string SectionName = "Authentication";

    /// <summary>
    /// The OIDC authority — the tenant's discovery document base. Signing keys come from it and
    /// refresh automatically, which is what survives a key rotation without a restart.
    /// </summary>
    public string? Authority { get; init; }

    /// <summary>The audience the token must carry: this API's application id or scope URI.</summary>
    public string? Audience { get; init; }

    /// <summary>
    /// The claim carrying the provider's stable subject. Entra's <c>oid</c> by default, never
    /// <c>sub</c>: <c>sub</c> is pairwise per application registration, so a <c>sub</c>-keyed
    /// user row breaks the day a second registration appears (design D2).
    /// </summary>
    public string SubjectClaim { get; init; } = "oid";

    /// <summary>The claim carrying the display name, tried in order against the token.</summary>
    public string[] NameClaims { get; init; } = ["name", "preferred_username"];

    /// <summary>The claim carrying the email address, tried in order against the token.</summary>
    public string[] EmailClaims { get; init; } = ["email", "preferred_username", "upn"];

    /// <summary>
    /// The role a user is provisioned into on first sign-in. Least-privileged by default: a new
    /// arrival can see the dashboard and nothing interesting (design D4).
    /// </summary>
    public string DefaultRoleName { get; init; } = "readonly";

    /// <summary>
    /// Whether an unknown but validly-authenticated subject is provisioned a user row. Turning
    /// it off makes the installation invitation-only; an unknown subject is then refused.
    /// </summary>
    public bool ProvisionUnknownSubjects { get; init; } = true;

    /// <summary>
    /// The administrator seeded by the <c>--migrate</c> entry point when the installation has
    /// none. An email address; the runbook uses it to recover a locked-out installation.
    /// </summary>
    public BootstrapAdministratorOptions? BootstrapAdministrator { get; init; }

    /// <summary>
    /// The development-only token issuer (design D8). Configuring it in Production is a start-up
    /// failure, not a warning.
    /// </summary>
    public DevelopmentIssuerOptions? DevelopmentIssuer { get; init; }

    /// <summary>
    /// The application's own user-name-and-password sign-in (KTL-45). Unlike the development
    /// issuer it is allowed in Production, because it checks a credential instead of minting a
    /// token for whoever asks.
    /// </summary>
    public LocalAccountsOptions? LocalAccounts { get; init; }
}

/// <summary>
/// Local accounts: a signing key, the issuer the sign-in endpoint mints tokens as, and the
/// accounts the migrator seeds. Validated at start-up (and the seed again in <c>--migrate</c>).
/// </summary>
public sealed class LocalAccountsOptions
{
    public bool Enabled { get; init; }

    /// <summary>Symmetric HS256 key, at least 32 bytes and never the development issuer's.</summary>
    public string? SigningKey { get; init; }

    public string Issuer { get; init; } = "https://kepler-talento.local/accounts";

    public string Audience { get; init; } = "kepler-talento-api";

    /// <summary>A working day. There is no refresh token: an expired session signs in again.</summary>
    public int TokenLifetimeMinutes { get; init; } = 480;

    /// <summary>Sign-in attempts allowed per client address per minute, without queueing.</summary>
    public int SignInAttemptsPerMinute { get; init; } = 10;

    /// <summary>Accounts the migrator creates or re-hashes; see <c>DatabaseInitializer</c>.</summary>
    public LocalAccountSeedOptions[] Seed { get; init; } = [];
}

public sealed class LocalAccountSeedOptions
{
    public string? UserName { get; init; }
    public string? DisplayName { get; init; }
    public string? Email { get; init; }
    public string? RoleName { get; init; }
    public string? Password { get; init; }
}

/// <summary>
/// The values committed to <c>docker-compose.yml</c> for local development. Production refuses
/// every one of them, as signing key or as password, so a copied compose file cannot open a real
/// installation with a credential anyone can read on GitHub.
/// </summary>
public static class LocalAccountDefaults
{
    public static readonly IReadOnlySet<string> DevelopmentOnlyValues = new HashSet<string>(StringComparer.Ordinal)
    {
        "development-only-local-accounts-key-change-me-32b",
        "KeplerLocal-Admin-2026",
        "KeplerLocal-User-2026",
    };

    /// <summary>
    /// Why the options are unsafe, or <see langword="null"/> when they are fine. Shared by start-up
    /// validation and the tests, so the two cannot drift.
    /// </summary>
    public static string? Problem(KeplerAuthenticationOptions options, bool isProduction)
    {
        var local = options.LocalAccounts;
        if (local?.Enabled != true)
        {
            return null;
        }
        var key = local.SigningKey ?? string.Empty;
        if (System.Text.Encoding.UTF8.GetByteCount(key) < DevelopmentIssuerOptions.MinimumSigningKeyBytes)
        {
            return $"Authentication:LocalAccounts:SigningKey must be at least {DevelopmentIssuerOptions.MinimumSigningKeyBytes} bytes.";
        }
        if (string.Equals(key, options.DevelopmentIssuer?.SigningKey, StringComparison.Ordinal))
        {
            return "Authentication:LocalAccounts:SigningKey must differ from the development issuer's key.";
        }
        if (string.Equals(local.Issuer, options.DevelopmentIssuer?.Issuer, StringComparison.Ordinal))
        {
            return "Authentication:LocalAccounts:Issuer must differ from the development issuer.";
        }
        if (local.TokenLifetimeMinutes is < 1 or > 24 * 60)
        {
            return "Authentication:LocalAccounts:TokenLifetimeMinutes must be between 1 and 1440.";
        }
        if (local.SignInAttemptsPerMinute is < 1 or > 1000)
        {
            return "Authentication:LocalAccounts:SignInAttemptsPerMinute must be between 1 and 1000.";
        }
        if (isProduction && DevelopmentOnlyValues.Contains(key))
        {
            return "Authentication:LocalAccounts:SigningKey is a development-only value and cannot be used in Production.";
        }
        return null;
    }
}

public sealed class BootstrapAdministratorOptions
{
    public string? Email { get; init; }
    public string? DisplayName { get; init; }
}

/// <summary>
/// A real token flow without the corporate tenant: a signing key from configuration, an endpoint
/// that mints a token, and the same validation pipeline checking its signature, issuer, audience
/// and lifetime. Only the issuer differs — there is no code path that skips validation.
/// </summary>
public sealed class DevelopmentIssuerOptions
{
    public bool Enabled { get; init; }

    /// <summary>Symmetric signing key. At least 32 bytes, so HS256 has a key worth the name.</summary>
    public string? SigningKey { get; init; }

    public string Issuer { get; init; } = "https://kepler-talento.local/dev";

    public string Audience { get; init; } = "kepler-talento-api";

    /// <summary>Bounded so a development token left behind cannot be a long-lived credential.</summary>
    public int TokenLifetimeMinutes { get; init; } = 60;

    public const int MinimumSigningKeyBytes = 32;
}
