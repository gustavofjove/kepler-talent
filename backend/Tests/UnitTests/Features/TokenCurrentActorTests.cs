using System.Security.Claims;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Domain.Identity;
using KeplerTalento.Web.Identity;
using Microsoft.Extensions.Options;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Features;

public sealed class TokenCurrentActorTests
{
    [Fact]
    public async Task An_unknown_subject_is_provisioned_only_once()
    {
        var users = new StubUserRepository();
        var resolver = Resolver(users, new StubRoleRepository(RoleWith("candidates.read")));
        var principal = Principal(("oid", "new-subject"), ("email", "new@example.test"), ("name", "New User"));

        var first = await resolver.ResolveAsync(principal, CancellationToken.None);
        var second = await resolver.ResolveAsync(principal, CancellationToken.None);

        Assert.NotNull(first);
        Assert.Equal(first!.UserId, second!.UserId);
        Assert.Equal(1, users.AddCalls);
        Assert.Equal("readonly", users.Stored!.RoleName);
    }

    [Fact]
    public async Task An_inactive_user_is_unauthenticated()
    {
        var user = UserWith("known-subject");
        user.Deactivate(DateTimeOffset.UtcNow);
        var resolver = Resolver(new StubUserRepository(user), new StubRoleRepository(RoleWith("candidates.read")));

        var identity = await resolver.ResolveAsync(
            Principal(("oid", "known-subject"), ("email", user.Email), ("name", user.DisplayName)),
            CancellationToken.None);

        Assert.Null(identity);
    }

    [Fact]
    public async Task An_inactive_role_yields_no_permissions()
    {
        var user = UserWith("known-subject");
        var role = RoleWith("candidates.read");
        role.Deactivate(DateTimeOffset.UtcNow);
        var resolver = Resolver(new StubUserRepository(user), new StubRoleRepository(role));

        var identity = await resolver.ResolveAsync(
            Principal(("oid", "known-subject"), ("email", user.Email), ("name", user.DisplayName)),
            CancellationToken.None);

        Assert.NotNull(identity);
        Assert.Empty(identity!.Permissions);
    }

    [Fact]
    public async Task Permissions_carried_in_claims_are_ignored()
    {
        var user = UserWith("known-subject");
        var resolver = Resolver(new StubUserRepository(user), new StubRoleRepository(RoleWith("candidates.read")));

        var identity = await resolver.ResolveAsync(
            Principal(
                ("oid", "known-subject"),
                ("email", user.Email),
                ("name", user.DisplayName),
                ("permissions", "users.manage"),
                (ClaimTypes.Role, "roles.manage")),
            CancellationToken.None);

        Assert.Equal(["candidates.read"], identity!.Permissions);
    }

    private static CallerIdentityResolver Resolver(IUserRepository users, IRoleRepository roles) =>
        new(users, roles, Options.Create(new KeplerAuthenticationOptions()));

    private static ClaimsPrincipal Principal(params (string Type, string Value)[] claims) =>
        new(new ClaimsIdentity(claims.Select(value => new Claim(value.Type, value.Value)), "test"));

    private static User UserWith(string subject) =>
        new(Guid.NewGuid(), subject, "Stored User", "stored@example.test", "readonly", DateTimeOffset.UtcNow);

    private static Role RoleWith(params string[] permissions) =>
        new(Guid.NewGuid(), "readonly", "Solo lectura", false, permissions, DateTimeOffset.UtcNow);

    private sealed class StubUserRepository(User? stored = null) : IUserRepository
    {
        public User? Stored { get; private set; } = stored;
        public int AddCalls { get; private set; }

        public Task<User?> FindByExternalSubjectAsync(string externalSubject, CancellationToken cancellationToken) =>
            Task.FromResult(Stored?.ExternalSubject == externalSubject ? Stored : null);

        public Task<User?> FindByEmailAsync(string email, CancellationToken cancellationToken) =>
            Task.FromResult(Stored?.Email == User.NormalizeEmail(email) ? Stored : null);

        public Task<User?> FindByUserNameAsync(string userName, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public void Add(User user)
        {
            AddCalls++;
            Stored = user;
        }

        public Task<UserSaveOutcome> SaveAsync(CancellationToken cancellationToken) =>
            Task.FromResult(UserSaveOutcome.Saved);

        public void ExpectVersion(User user, uint version) { }
        public Task<UserPage> ListAsync(bool includeInactive, int page, int pageSize, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<User?> FindAsync(Guid id, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<int> CountActiveHoldersOfPermissionAsync(string permission, Guid? excludingUserId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<bool> AnyWithRoleAsync(string roleName, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<int> CountActiveHoldersOfRoleAsync(string roleName, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class StubRoleRepository(Role role) : IRoleRepository
    {
        public Task<Role?> FindByNameAsync(string name, CancellationToken cancellationToken) =>
            Task.FromResult<Role?>(role.Name == name ? role : null);

        public Task<IReadOnlyList<Role>> ListAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<Role?> FindAsync(Guid id, CancellationToken cancellationToken) => throw new NotSupportedException();
        public void Add(Role addedRole) => throw new NotSupportedException();
        public void ExpectVersion(Role expectedRole, uint version) => throw new NotSupportedException();
        public Task<RoleSaveOutcome> SaveAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
