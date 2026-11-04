using KeplerTalento.Domain.Identity;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Domain;

public sealed class UserLocalCredentialsTests
{
    private static readonly DateTimeOffset Created = new(2026, 11, 4, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Setting_credentials_stores_the_normalized_user_name_and_the_hash()
    {
        var user = NewUser();

        user.SetLocalCredentials("  RRHH_User ", "pbkdf2-sha256$1$a$b", Created.AddMinutes(1));

        Assert.Equal("rrhh_user", user.UserName);
        Assert.Equal("pbkdf2-sha256$1$a$b", user.PasswordHash);
        Assert.Equal(Created.AddMinutes(1), user.UpdatedAtUtc);
    }

    [Fact]
    public void A_provider_user_has_no_local_credentials()
    {
        var user = NewUser();

        Assert.Null(user.UserName);
        Assert.Null(user.PasswordHash);
    }

    [Fact]
    public void The_hash_can_be_replaced_under_the_same_user_name()
    {
        var user = NewUser();
        user.SetLocalCredentials("rrhh_user", "first", Created);

        user.SetLocalCredentials("RRHH_USER", "second", Created.AddDays(1));

        Assert.Equal("second", user.PasswordHash);
    }

    [Fact]
    public void A_local_account_cannot_be_renamed()
    {
        var user = NewUser();
        user.SetLocalCredentials("rrhh_user", "first", Created);

        Assert.Throws<InvalidOperationException>(() => user.SetLocalCredentials("someone_else", "second", Created));
        Assert.Equal("rrhh_user", user.UserName);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("has space")]
    [InlineData("acentuación")]
    [InlineData("semi;colon")]
    [InlineData("")]
    public void An_invalid_user_name_is_refused(string userName)
    {
        var user = NewUser();

        Assert.Throws<ArgumentException>(() => user.SetLocalCredentials(userName, "hash", Created));
        Assert.Null(user.UserName);
    }

    [Fact]
    public void A_user_name_longer_than_64_characters_is_refused()
    {
        Assert.Throws<ArgumentException>(() => NewUser().SetLocalCredentials(new string('a', 65), "hash", Created));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void A_blank_hash_is_refused(string hash)
    {
        Assert.Throws<ArgumentException>(() => NewUser().SetLocalCredentials("rrhh_user", hash, Created));
    }

    [Fact]
    public void An_oversized_hash_is_refused()
    {
        Assert.Throws<ArgumentException>(() => NewUser().SetLocalCredentials("rrhh_user", new string('x', 257), Created));
    }

    [Fact]
    public void The_local_subject_is_prefixed_and_normalized()
    {
        Assert.Equal("local:rrhh_admin", User.LocalSubject(" RRHH_Admin "));
    }

    private static User NewUser() => new(
        Guid.CreateVersion7(),
        externalSubject: null,
        displayName: "RRHH",
        email: "rrhh@kepler-talento.local",
        roleName: "rrhh_user",
        createdAtUtc: Created);
}
