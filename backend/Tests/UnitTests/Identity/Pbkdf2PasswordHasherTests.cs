using KeplerTalento.Infrastructure.Identity;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Identity;

public sealed class Pbkdf2PasswordHasherTests
{
    // Low on purpose: these tests exercise the format, not the work factor.
    private readonly Pbkdf2PasswordHasher hasher = new(iterations: 1_000);

    [Fact]
    public void A_hash_verifies_the_password_it_was_made_from()
    {
        var hash = hasher.Hash("correct horse battery");

        Assert.True(hasher.Verify("correct horse battery", hash));
    }

    [Fact]
    public void A_wrong_password_does_not_verify()
    {
        var hash = hasher.Hash("correct horse battery");

        Assert.False(hasher.Verify("correct horse batterY", hash));
        Assert.False(hasher.Verify(string.Empty, hash));
    }

    [Fact]
    public void The_same_password_hashes_differently_each_time()
    {
        Assert.NotEqual(hasher.Hash("same password here"), hasher.Hash("same password here"));
    }

    [Fact]
    public void The_stored_value_names_its_algorithm_and_iterations_and_holds_no_plaintext()
    {
        var hash = new Pbkdf2PasswordHasher().Hash("visible-password");

        Assert.StartsWith("pbkdf2-sha256$600000$", hash, StringComparison.Ordinal);
        Assert.DoesNotContain("visible-password", hash, StringComparison.Ordinal);
        Assert.True(hash.Length <= 256);
    }

    [Fact]
    public void A_hash_made_with_other_iterations_still_verifies()
    {
        var older = new Pbkdf2PasswordHasher(iterations: 2_000).Hash("rotated parameters");

        Assert.True(hasher.Verify("rotated parameters", older));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-hash")]
    [InlineData("bcrypt$1000$AAAA$AAAA")]
    [InlineData("pbkdf2-sha256$abc$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")]
    [InlineData("pbkdf2-sha256$0$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")]
    [InlineData("pbkdf2-sha256$99999999$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")]
    [InlineData("pbkdf2-sha256$1000$***$AAAA")]
    [InlineData("pbkdf2-sha256$1000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA")]
    public void A_malformed_or_unknown_hash_is_a_mismatch_not_an_exception(string stored)
    {
        Assert.False(hasher.Verify("anything at all", stored));
    }
}
