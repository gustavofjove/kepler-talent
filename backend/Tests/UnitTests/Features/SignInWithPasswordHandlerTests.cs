using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Application.Features.Identity;
using KeplerTalento.Domain.Identity;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Features;

public sealed class SignInWithPasswordHandlerTests
{
    private const string Password = "Correct-Password-1";

    [Fact]
    public async Task Correct_credentials_return_the_account_without_its_hash()
    {
        var user = LocalUser();
        var handler = new SignInWithPasswordHandler(new StubUsers(user), new StubHasher());

        var signedIn = await handler.Handle(new SignInWithPasswordCommand("RRHH_User", Password), CancellationToken.None);

        Assert.Equal(user.Id, signedIn.Id);
        Assert.Equal("local:rrhh_user", signedIn.ExternalSubject);
        Assert.DoesNotContain(
            typeof(SignedInUser).GetProperties(),
            property => property.Name.Contains("Password", StringComparison.OrdinalIgnoreCase)
                || property.Name.Contains("Role", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Every_failure_cause_throws_the_same_exception()
    {
        var inactive = LocalUser();
        inactive.Deactivate(DateTimeOffset.UtcNow);
        var withoutPassword = new User(
            Guid.CreateVersion7(), "local:no_password", "Sin clave", "nopass@kepler-talento.local", "rrhh_user", DateTimeOffset.UtcNow);

        var causes = new (User? Stored, string Password)[]
        {
            (null, Password),
            (LocalUser(), "Wrong-Password-1"),
            (inactive, Password),
            (withoutPassword, Password),
        };

        var messages = new List<string>();
        foreach (var (stored, password) in causes)
        {
            var handler = new SignInWithPasswordHandler(new StubUsers(stored), new StubHasher());
            var refused = await Assert.ThrowsAsync<InvalidCredentialsException>(() =>
                handler.Handle(new SignInWithPasswordCommand("rrhh_user", password), CancellationToken.None));
            Assert.Equal("auth.invalid_credentials", refused.Code);
            messages.Add(refused.Message);
        }
        Assert.Single(messages.Distinct());
    }

    [Fact]
    public async Task An_unknown_user_still_costs_one_verification()
    {
        var hasher = new StubHasher();
        var handler = new SignInWithPasswordHandler(new StubUsers(null), hasher);

        await Assert.ThrowsAsync<InvalidCredentialsException>(() =>
            handler.Handle(new SignInWithPasswordCommand("nobody_here", Password), CancellationToken.None));

        Assert.Equal(1, hasher.VerifyCalls);
    }

    [Fact]
    public async Task An_inactive_account_is_verified_before_it_is_refused()
    {
        var inactive = LocalUser();
        inactive.Deactivate(DateTimeOffset.UtcNow);
        var hasher = new StubHasher();
        var handler = new SignInWithPasswordHandler(new StubUsers(inactive), hasher);

        await Assert.ThrowsAsync<InvalidCredentialsException>(() =>
            handler.Handle(new SignInWithPasswordCommand("rrhh_user", Password), CancellationToken.None));

        Assert.Equal(1, hasher.VerifyCalls);
    }

    [Theory]
    [InlineData("", Password)]
    [InlineData("rrhh_user", "")]
    public void The_validator_refuses_an_empty_field(string userName, string password)
    {
        var result = new SignInWithPasswordValidator().Validate(new SignInWithPasswordCommand(userName, password));

        Assert.False(result.IsValid);
    }

    [Fact]
    public void The_validator_refuses_oversized_input()
    {
        var validator = new SignInWithPasswordValidator();

        Assert.False(validator.Validate(new SignInWithPasswordCommand(new string('a', 65), Password)).IsValid);
        Assert.False(validator.Validate(new SignInWithPasswordCommand("rrhh_user", new string('p', 257))).IsValid);
        Assert.True(validator.Validate(new SignInWithPasswordCommand("rrhh_user", Password)).IsValid);
    }

    private static User LocalUser()
    {
        var user = new User(
            Guid.CreateVersion7(), "local:rrhh_user", "RRHH Usuario", "rrhh.user@kepler-talento.local", "rrhh_user", DateTimeOffset.UtcNow);
        user.SetLocalCredentials("rrhh_user", StubHasher.HashOf(Password), DateTimeOffset.UtcNow);
        return user;
    }

    /// <summary>A reversible stand-in: the handler's logic, not the cryptography, is under test.</summary>
    private sealed class StubHasher : IPasswordHasher
    {
        public int VerifyCalls { get; private set; }

        public static string HashOf(string password) => $"stub${password}";

        public string Hash(string password) => HashOf(password);

        public bool Verify(string password, string storedHash)
        {
            VerifyCalls++;
            return string.Equals(HashOf(password), storedHash, StringComparison.Ordinal);
        }
    }

    /// <summary>Whatever the lookup, answers with the one stored row (or none).</summary>
    private sealed class StubUsers(User? stored) : IUserRepository
    {
        public Task<User?> FindByUserNameAsync(string userName, CancellationToken cancellationToken) =>
            Task.FromResult(stored);

        public Task<UserPage> ListAsync(bool includeInactive, int page, int pageSize, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<User?> FindAsync(Guid id, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<User?> FindByExternalSubjectAsync(string externalSubject, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<User?> FindByEmailAsync(string email, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<int> CountActiveHoldersOfPermissionAsync(string permission, Guid? excludingUserId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<bool> AnyWithRoleAsync(string roleName, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<int> CountActiveHoldersOfRoleAsync(string roleName, CancellationToken cancellationToken) => throw new NotSupportedException();
        public void Add(User user) => throw new NotSupportedException();
        public void ExpectVersion(User user, uint version) => throw new NotSupportedException();
        public Task<UserSaveOutcome> SaveAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
