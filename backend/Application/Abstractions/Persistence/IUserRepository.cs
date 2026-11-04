using KeplerTalento.Domain.Identity;

namespace KeplerTalento.Application.Abstractions.Persistence;

public enum UserSaveOutcome
{
    Saved,

    /// <summary>
    /// The unique index on the external subject or the lower-cased email refused the write.
    /// Under concurrency this is the authoritative answer: two requests can both find an email
    /// free and only one can store it.
    /// </summary>
    NaturalKeyConflict,

    /// <summary>The user changed or disappeared after the caller read the version it sent.</summary>
    ConcurrencyConflict,
}

public sealed record UserPage(IReadOnlyList<User> Items, int TotalCount);

/// <summary>Persistence for application users.</summary>
/// <remarks>
/// There is no <c>Remove</c>. Users are deactivated, never deleted (non-negotiable 5), and
/// <c>ktl_runtime</c> holds no <c>DELETE</c> on <c>ADM_Users</c> to make that structural rather
/// than a convention.
/// </remarks>
public interface IUserRepository
{
    /// <summary>Ordered by display name, paged, and active-only unless explicitly requested.</summary>
    Task<UserPage> ListAsync(
        bool includeInactive,
        int page,
        int pageSize,
        CancellationToken cancellationToken);

    Task<User?> FindAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>The per-request identity lookup. One indexed read on the unique subject index.</summary>
    Task<User?> FindByExternalSubjectAsync(string externalSubject, CancellationToken cancellationToken);

    /// <summary>
    /// Used to link a seeded bootstrap administrator to their provider subject on first sign-in,
    /// and to refuse a create that would duplicate an address.
    /// </summary>
    Task<User?> FindByEmailAsync(string email, CancellationToken cancellationToken);

    /// <summary>The password sign-in lookup (KTL-45), on the unique user-name index.</summary>
    Task<User?> FindByUserNameAsync(string userName, CancellationToken cancellationToken);

    /// <summary>
    /// How many active users hold a role that grants the given permission, excluding one user.
    /// The last-administrator invariant asks this inside the write transaction, so that two
    /// concurrent deactivations cannot both believe someone else is left (design D6).
    /// </summary>
    Task<int> CountActiveHoldersOfPermissionAsync(
        string permission,
        Guid? excludingUserId,
        CancellationToken cancellationToken);

    /// <summary>Whether any user — active or not — still holds the given role.</summary>
    Task<bool> AnyWithRoleAsync(string roleName, CancellationToken cancellationToken);

    /// <summary>
    /// How many active users hold this exact role. Subtracted from the administrator count to
    /// answer "would an administrator remain if this role stopped conferring administration?".
    /// </summary>
    Task<int> CountActiveHoldersOfRoleAsync(string roleName, CancellationToken cancellationToken);

    void Add(User user);

    /// <summary>
    /// Declares the version the caller read, so a write against a stale version is refused by
    /// the database rather than silently overwriting someone else's change.
    /// </summary>
    void ExpectVersion(User user, uint version);

    Task<UserSaveOutcome> SaveAsync(CancellationToken cancellationToken);
}
