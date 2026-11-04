using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Application.Features.Admin;
using KeplerTalento.Domain.Identity;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Features;

public sealed class AdminInvariantTests
{
    [Fact]
    public void Position_permissions_are_part_of_the_closed_catalogue()
    {
        Assert.Contains(Permissions.PositionsRead, Permissions.All);
        Assert.Contains(Permissions.PositionsManage, Permissions.All);
        Assert.NotEqual(Permissions.PositionsRead, Permissions.PositionsManage);
    }
    [Fact]
    public async Task Deactivating_the_last_administrator_is_refused()
    {
        var users = new StubUserRepository { ActivePermissionHolders = 0 };

        var exception = await Assert.ThrowsAsync<ConflictException>(() =>
            AdminInvariants.RequireAnotherAdministratorRemainsAsync(
                users,
                Guid.NewGuid(),
                CancellationToken.None));

        Assert.Equal("admin.lastAdministrator", exception.Code);
        Assert.Equal(Permissions.UsersManage, users.CountedPermission);
    }

    [Fact]
    public async Task Changing_the_last_administrators_role_is_refused()
    {
        var affectedUserId = Guid.NewGuid();
        var users = new StubUserRepository { ActivePermissionHolders = 0 };

        var exception = await Assert.ThrowsAsync<ConflictException>(() =>
            AdminInvariants.RequireAnotherAdministratorRemainsAsync(
                users,
                affectedUserId,
                CancellationToken.None));

        Assert.Equal("admin.lastAdministrator", exception.Code);
        Assert.Equal(affectedUserId, users.ExcludedUserId);
    }

    [Fact]
    public async Task Removing_administration_from_its_only_role_is_refused()
    {
        var users = new StubUserRepository
        {
            ActivePermissionHolders = 2,
            ActiveRoleHolders = 2,
        };
        var role = RoleWith(Permissions.UsersManage, Permissions.CandidatesRead);

        var exception = await Assert.ThrowsAsync<ConflictException>(() =>
            AdminInvariants.RequireRoleEditLeavesAnAdministratorAsync(
                users,
                role,
                [Permissions.CandidatesRead],
                CancellationToken.None));

        Assert.Equal("admin.lastAdministrator", exception.Code);
    }

    [Fact]
    public async Task Removing_administration_is_allowed_when_another_role_has_an_administrator()
    {
        var users = new StubUserRepository
        {
            ActivePermissionHolders = 3,
            ActiveRoleHolders = 2,
        };

        await AdminInvariants.RequireRoleEditLeavesAnAdministratorAsync(
            users,
            RoleWith(Permissions.UsersManage),
            [Permissions.CandidatesRead],
            CancellationToken.None);
    }

    [Fact]
    public void Changing_the_callers_own_role_is_refused()
    {
        var id = Guid.NewGuid();
        var exception = Assert.Throws<ConflictException>(() =>
            AdminInvariants.RequireNotSelfRoleChange(new Actor(id), id));

        Assert.Equal("admin.user.selfRoleChange", exception.Code);
    }

    [Fact]
    public void Deactivating_the_callers_own_account_is_refused()
    {
        var id = Guid.NewGuid();
        var exception = Assert.Throws<ConflictException>(() =>
            AdminInvariants.RequireNotSelfDeactivation(new Actor(id), id));

        Assert.Equal("admin.user.selfDeactivation", exception.Code);
    }

    [Fact]
    public void A_system_role_name_is_immutable()
    {
        var setter = typeof(Role).GetProperty(nameof(Role.Name))?.SetMethod;

        Assert.NotNull(setter);
        Assert.False(setter!.IsPublic);
    }

    [Fact]
    public void A_system_role_cannot_have_an_empty_permission_set()
    {
        var role = RoleWith(Permissions.CandidatesRead);

        Assert.Throws<ArgumentException>(() => role.ReplacePermissions([], DateTimeOffset.UtcNow));
    }

    [Fact]
    public void A_system_role_cannot_be_deactivated()
    {
        var role = RoleWith(Permissions.CandidatesRead);

        var exception = Assert.Throws<ConflictException>(() =>
            AdminInvariants.RequireSystemRoleMayBeDeactivated(role));

        Assert.Equal("admin.role.systemDeactivation", exception.Code);
    }

    [Fact]
    public async Task A_role_still_held_by_a_user_cannot_be_deactivated()
    {
        var users = new StubUserRepository { AnyUserWithRole = true };

        var exception = await Assert.ThrowsAsync<ConflictException>(() =>
            AdminInvariants.RequireRoleIsUnusedAsync(users, "custom_role", CancellationToken.None));

        Assert.Equal("admin.role.inUse", exception.Code);
    }

    private static Role RoleWith(params string[] permissions) =>
        new(Guid.NewGuid(), "rrhh_admin", "Administración", true, permissions, DateTimeOffset.UtcNow);

    private sealed class Actor(Guid userId) : ICurrentActor
    {
        public string? ExternalKey => "test-subject";
        public Guid? UserId => userId;
        public bool IsAuthenticated => true;
        public bool HasPermission(string permission) => true;
    }

    private sealed class StubUserRepository : IUserRepository
    {
        public int ActivePermissionHolders { get; init; }
        public int ActiveRoleHolders { get; init; }
        public bool AnyUserWithRole { get; init; }
        public string? CountedPermission { get; private set; }
        public Guid? ExcludedUserId { get; private set; }

        public Task<int> CountActiveHoldersOfPermissionAsync(
            string permission,
            Guid? excludingUserId,
            CancellationToken cancellationToken)
        {
            CountedPermission = permission;
            ExcludedUserId = excludingUserId;
            return Task.FromResult(ActivePermissionHolders);
        }

        public Task<int> CountActiveHoldersOfRoleAsync(string roleName, CancellationToken cancellationToken) =>
            Task.FromResult(ActiveRoleHolders);

        public Task<bool> AnyWithRoleAsync(string roleName, CancellationToken cancellationToken) =>
            Task.FromResult(AnyUserWithRole);

        public Task<UserPage> ListAsync(
            bool includeInactive,
            int page,
            int pageSize,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException();
        public Task<User?> FindAsync(Guid id, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
        public Task<User?> FindByExternalSubjectAsync(string externalSubject, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
        public Task<User?> FindByEmailAsync(string email, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
        public Task<User?> FindByUserNameAsync(string userName, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
        public void Add(User user) => throw new NotSupportedException();
        public void ExpectVersion(User user, uint version) => throw new NotSupportedException();
        public Task<UserSaveOutcome> SaveAsync(CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }
}
