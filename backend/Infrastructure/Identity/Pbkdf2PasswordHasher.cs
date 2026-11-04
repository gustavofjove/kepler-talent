using System.Globalization;
using System.Security.Cryptography;
using System.Text;

using KeplerTalento.Application.Abstractions.Identity;

namespace KeplerTalento.Infrastructure.Identity;

/// <summary>
/// PBKDF2-HMAC-SHA256 from the base class library (KTL-45 design D3), so local accounts need no
/// new dependency. Stored as <c>pbkdf2-sha256$&lt;iterations&gt;$&lt;salt&gt;$&lt;subkey&gt;</c>, both
/// in Base64.
/// </summary>
public sealed class Pbkdf2PasswordHasher : IPasswordHasher
{
    public const string Algorithm = "pbkdf2-sha256";

    /// <summary>The OWASP figure for PBKDF2-HMAC-SHA256.</summary>
    public const int DefaultIterations = 600_000;

    private const int SaltBytes = 16;
    private const int SubkeyBytes = 32;

    // An upper bound on what Verify accepts from a stored value, so a corrupt row cannot make one
    // sign-in attempt cost minutes of CPU.
    private const int MaximumIterations = 10_000_000;

    private readonly int iterations;

    public Pbkdf2PasswordHasher()
        : this(DefaultIterations)
    {
    }

    /// <summary>Lower iteration counts exist for tests only; production code uses the default.</summary>
    public Pbkdf2PasswordHasher(int iterations)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(iterations, 1);
        this.iterations = iterations;
    }

    public string Hash(string password)
    {
        ArgumentNullException.ThrowIfNull(password);
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var subkey = Derive(password, salt, iterations);
        return string.Join(
            '$',
            Algorithm,
            iterations.ToString(CultureInfo.InvariantCulture),
            Convert.ToBase64String(salt),
            Convert.ToBase64String(subkey));
    }

    public bool Verify(string password, string storedHash)
    {
        if (password is null || string.IsNullOrEmpty(storedHash))
        {
            return false;
        }

        var parts = storedHash.Split('$');
        if (parts.Length != 4
            || !string.Equals(parts[0], Algorithm, StringComparison.Ordinal)
            || !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var storedIterations)
            || storedIterations is < 1 or > MaximumIterations)
        {
            return false;
        }

        byte[] salt;
        byte[] expected;
        try
        {
            salt = Convert.FromBase64String(parts[2]);
            expected = Convert.FromBase64String(parts[3]);
        }
        catch (FormatException)
        {
            return false;
        }
        if (salt.Length == 0 || expected.Length != SubkeyBytes)
        {
            return false;
        }

        var actual = Derive(password, salt, storedIterations);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    private static byte[] Derive(string password, byte[] salt, int iterations) =>
        Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            SubkeyBytes);
}
