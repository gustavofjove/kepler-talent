namespace KeplerTalento.Infrastructure.Persistence;

/// <summary>
/// One local account for <see cref="DatabaseInitializer.SeedLocalAccountsAsync"/> to create or
/// re-hash (KTL-45). The password is held only for as long as the seed needs to hash it.
/// </summary>
public sealed record LocalAccountSeed(
    string? UserName,
    string? DisplayName,
    string? Email,
    string? RoleName,
    string? Password)
{
    /// <summary>Shorter fails the deploy.</summary>
    public const int MinimumPasswordLength = 12;

    // Never the password, whatever logs or prints the record.
    public override string ToString() => $"LocalAccountSeed {{ UserName = {UserName}, RoleName = {RoleName} }}";
}
