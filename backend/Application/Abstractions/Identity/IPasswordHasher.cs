namespace KeplerTalento.Application.Abstractions.Identity;

/// <summary>
/// One-way password hashing for local accounts (KTL-45). The stored value names its own algorithm
/// and work factor, so a later change of parameters still verifies the hashes already stored.
/// </summary>
public interface IPasswordHasher
{
    /// <summary>Hashes with a fresh random salt: the same password never yields the same value.</summary>
    string Hash(string password);

    /// <summary>
    /// Whether <paramref name="password"/> matches <paramref name="storedHash"/>. A malformed or
    /// unrecognised hash is a mismatch, never an exception, so a corrupt row cannot be told apart
    /// from a wrong password.
    /// </summary>
    bool Verify(string password, string storedHash);
}
