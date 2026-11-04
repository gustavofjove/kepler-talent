namespace KeplerTalento.Domain.Identity;

/// <summary>
/// A person who may sign in. Identity itself belongs to the corporate provider; this row holds
/// what the application decides — which role they have, and whether they are still here.
/// </summary>
/// <remarks>
/// <para>
/// The display name, the email and the external subject are personal data (non-negotiable 1).
/// The subject never leaves the database: responses carry <see cref="Id"/>, and
/// <c>PersonalDataRedactionEnricher</c> keeps all three out of the logs.
/// </para>
/// <para>
/// Users are deactivated, never deleted. A deactivated user is refused as unauthenticated rather
/// than forbidden, because the point is that they have no standing at all — see the KTL-16
/// design (D3).
/// </para>
/// </remarks>
public sealed class User
{
    private User() { }

    /// <param name="externalSubject">
    /// The provider's subject, or <see langword="null"/> for a user seeded by address before
    /// anyone has signed in to reveal it — the bootstrap administrator's case.
    /// <see cref="LinkExternalSubject"/> attaches it on first sign-in.
    /// </param>
    public User(
        Guid id,
        string? externalSubject,
        string displayName,
        string email,
        string roleName,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        IsActive = true;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
        if (externalSubject is not null)
        {
            ApplyExternalSubject(externalSubject);
        }
        ApplyDisplayName(displayName);
        ApplyEmail(email);
        ApplyRoleName(roleName);
    }

    public Guid Id { get; private set; }

    /// <summary>
    /// The provider's stable per-tenant subject — Entra's <c>oid</c> by default (design D2).
    /// Nullable because the migration seeds the bootstrap administrator by email, before anyone
    /// has signed in to reveal their subject; <see cref="LinkExternalSubject"/> fills it then.
    /// </summary>
    public string? ExternalSubject { get; private set; }

    public string DisplayName { get; private set; } = string.Empty;

    /// <summary>Stored lower-cased; the unique index is on the lower-cased value.</summary>
    public string Email { get; private set; } = string.Empty;

    /// <summary>Foreign key to <c>ADM_Roles.Name</c>, which is why that name is immutable.</summary>
    public string RoleName { get; private set; } = string.Empty;

    /// <summary>
    /// The local account's sign-in name (KTL-45), or <see langword="null"/> for a user whose
    /// identity belongs to the provider. Stored lower-cased; the unique index is on the stored value.
    /// </summary>
    public string? UserName { get; private set; }

    /// <summary>
    /// A self-describing one-way hash of the local account's password, never the password itself.
    /// Written only by the migrator's seed, never mapped into a response, and redacted from logs.
    /// </summary>
    public string? PasswordHash { get; private set; }

    public DateTimeOffset? LastSignInAtUtc { get; private set; }

    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    /// <summary><c>xmin</c>, as the other aggregates use.</summary>
    public uint Version { get; private set; }

    /// <summary>
    /// Attaches the provider's subject to a row seeded by email. Refused once a subject is held:
    /// re-pointing an existing user at a different person is not an edit, it is impersonation.
    /// </summary>
    public void LinkExternalSubject(string externalSubject, DateTimeOffset updatedAtUtc)
    {
        if (!string.IsNullOrEmpty(ExternalSubject))
        {
            throw new InvalidOperationException("This user is already linked to a provider subject.");
        }
        ApplyExternalSubject(externalSubject);
        UpdatedAtUtc = updatedAtUtc;
    }

    /// <summary>
    /// Refreshes the claims the provider owns. Returns whether anything actually changed, so a
    /// request that finds them identical — which is almost every request — writes nothing.
    /// </summary>
    public bool RefreshFromClaims(string displayName, string email, DateTimeOffset updatedAtUtc)
    {
        var trimmedName = (displayName ?? string.Empty).Trim();
        var normalizedEmail = NormalizeEmail(email);

        var nameChanged = trimmedName.Length > 0 && !string.Equals(trimmedName, DisplayName, StringComparison.Ordinal);
        var emailChanged = normalizedEmail.Length > 0 && !string.Equals(normalizedEmail, Email, StringComparison.Ordinal);

        if (!nameChanged && !emailChanged)
        {
            return false;
        }

        if (nameChanged)
        {
            ApplyDisplayName(trimmedName);
        }
        if (emailChanged)
        {
            ApplyEmail(normalizedEmail);
        }
        UpdatedAtUtc = updatedAtUtc;
        return true;
    }

    public void Rename(string displayName, DateTimeOffset updatedAtUtc)
    {
        ApplyDisplayName(displayName);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void AssignRole(string roleName, DateTimeOffset updatedAtUtc)
    {
        ApplyRoleName(roleName);
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Deactivate(DateTimeOffset updatedAtUtc)
    {
        IsActive = false;
        UpdatedAtUtc = updatedAtUtc;
    }

    public void Reactivate(DateTimeOffset updatedAtUtc)
    {
        IsActive = true;
        UpdatedAtUtc = updatedAtUtc;
    }

    /// <summary>
    /// Records a sign-in. Like applying a preset this is not a content change, but the version
    /// is <c>xmin</c> so the row does move; administration writes therefore send the version
    /// they read and retry on conflict rather than assuming it is stable.
    /// </summary>
    public void MarkSignedIn(DateTimeOffset signedInAtUtc) => LastSignInAtUtc = signedInAtUtc;

    /// <summary>
    /// Makes this user a local account, or replaces its password hash. The user name is fixed once
    /// set: renaming a local account would orphan the <c>local:</c> subject its tokens carry.
    /// </summary>
    public void SetLocalCredentials(string userName, string passwordHash, DateTimeOffset updatedAtUtc)
    {
        var normalized = NormalizeUserName(userName);
        if (!IsValidUserName(normalized))
        {
            throw new ArgumentException(
                "A user name is 3-64 lowercase letters, digits, dots, underscores or hyphens.", nameof(userName));
        }
        if (UserName is not null && !string.Equals(UserName, normalized, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("A local account's user name cannot be changed.");
        }
        if (string.IsNullOrWhiteSpace(passwordHash) || passwordHash.Length > MaximumPasswordHashLength)
        {
            throw new ArgumentException("A password hash is non-blank and bounded.", nameof(passwordHash));
        }

        UserName = normalized;
        PasswordHash = passwordHash;
        UpdatedAtUtc = updatedAtUtc;
    }

    public const int MaximumUserNameLength = 64;

    public const int MaximumPasswordHashLength = 256;

    /// <summary>The subject a local account's tokens carry, which identity resolution keys on.</summary>
    public static string LocalSubject(string userName) => $"local:{NormalizeUserName(userName)}";

    public static string NormalizeUserName(string? userName) => (userName ?? string.Empty).Trim().ToLowerInvariant();

    /// <summary>Mirrors <c>CK_ADM_Users_UserName</c>.</summary>
    public static bool IsValidUserName(string normalizedUserName) =>
        normalizedUserName.Length is >= 3 and <= MaximumUserNameLength
        && normalizedUserName.All(character =>
            character is (>= 'a' and <= 'z') or (>= '0' and <= '9') or '.' or '_' or '-');

    public static string NormalizeEmail(string? email) => (email ?? string.Empty).Trim().ToLowerInvariant();

    private void ApplyExternalSubject(string externalSubject)
    {
        var trimmed = (externalSubject ?? string.Empty).Trim();
        if (trimmed.Length is 0 or > 200)
        {
            throw new ArgumentException("An external subject is non-blank and bounded.", nameof(externalSubject));
        }
        ExternalSubject = trimmed;
    }

    private void ApplyDisplayName(string displayName)
    {
        var trimmed = (displayName ?? string.Empty).Trim();
        if (trimmed.Length is 0 or > 200)
        {
            throw new ArgumentException("A user needs a non-blank, bounded display name.", nameof(displayName));
        }
        DisplayName = trimmed;
    }

    private void ApplyEmail(string email)
    {
        var normalized = NormalizeEmail(email);
        // Shape only. The provider owns the address; this guards against a blank or absurd
        // value reaching the unique index, not against an unroutable mailbox.
        if (normalized.Length is 0 or > 320 || !normalized.Contains('@', StringComparison.Ordinal))
        {
            throw new ArgumentException("A user needs a bounded email address.", nameof(email));
        }
        Email = normalized;
    }

    private void ApplyRoleName(string roleName)
    {
        // Fully qualified: the RoleName property shadows the RoleName static class here.
        if (!KeplerTalento.Domain.Identity.RoleName.IsValid(roleName))
        {
            throw new ArgumentException("A user's role name is lowercase letters, digits and underscores.", nameof(roleName));
        }
        RoleName = roleName;
    }
}
