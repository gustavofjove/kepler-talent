using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace KeplerTalento.Infrastructure.Persistence;

/// <summary>User persistence.</summary>
public sealed class UserRepository(ApplicationDbContext dbContext) : IUserRepository
{
    public async Task<UserPage> ListAsync(
        bool includeInactive,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Users
            .AsNoTracking()
            .Where(user => includeInactive || user.IsActive);
        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(user => user.DisplayName)
            .ThenBy(user => user.Email)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        return new UserPage(items, totalCount);
    }

    public Task<User?> FindAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Users.SingleOrDefaultAsync(user => user.Id == id, cancellationToken);

    public Task<User?> FindByExternalSubjectAsync(string externalSubject, CancellationToken cancellationToken) =>
        dbContext.Users.SingleOrDefaultAsync(
            user => user.ExternalSubject == externalSubject,
            cancellationToken);

    public Task<User?> FindByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var normalized = User.NormalizeEmail(email);
        return dbContext.Users.SingleOrDefaultAsync(user => user.Email == normalized, cancellationToken);
    }

    public Task<User?> FindByUserNameAsync(string userName, CancellationToken cancellationToken)
    {
        var normalized = User.NormalizeUserName(userName);
        return dbContext.Users.SingleOrDefaultAsync(user => user.UserName == normalized, cancellationToken);
    }

    public async Task<int> CountActiveHoldersOfPermissionAsync(
        string permission,
        Guid? excludingUserId,
        CancellationToken cancellationToken)
    {
        // Two steps rather than one join. The permission set is a jsonb document behind a value
        // converter, so "does this role grant X" has no SQL translation; but ADM_Roles has as
        // many rows as the installation has roles, so materializing it costs nothing.
        //
        // What must reach the database is the *user* count, and it does: that is the number the
        // last-administrator invariant races on, and the handler asks for it inside the write
        // transaction so a concurrent deactivation cannot be missed (design D6).
        var granting = await dbContext.Roles
            .AsNoTracking()
            .Where(role => role.IsActive)
            .ToListAsync(cancellationToken);

        var grantingNames = granting
            .Where(role => role.Grants(permission))
            .Select(role => role.Name)
            .ToList();

        if (grantingNames.Count == 0)
        {
            return 0;
        }

        return await dbContext.Users
            .Where(user => user.IsActive)
            .Where(user => excludingUserId == null || user.Id != excludingUserId)
            .Where(user => grantingNames.Contains(user.RoleName))
            .CountAsync(cancellationToken);
    }

    public Task<bool> AnyWithRoleAsync(string roleName, CancellationToken cancellationToken) =>
        dbContext.Users.AnyAsync(user => user.RoleName == roleName, cancellationToken);

    public Task<int> CountActiveHoldersOfRoleAsync(string roleName, CancellationToken cancellationToken) =>
        dbContext.Users.CountAsync(
            user => user.IsActive && user.RoleName == roleName,
            cancellationToken);

    public void Add(User user) => dbContext.Users.Add(user);

    public void ExpectVersion(User user, uint version) =>
        dbContext.Entry(user).Property(entity => entity.Version).OriginalValue = version;

    public async Task<UserSaveOutcome> SaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return UserSaveOutcome.Saved;
        }
        catch (DbUpdateConcurrencyException)
        {
            dbContext.ChangeTracker.Clear();
            return UserSaveOutcome.ConcurrencyConflict;
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException postgres
            && postgres.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // Either the subject index or the email index. Which one is not told to the caller:
            // "this email already exists" leaks who is registered, and the provisioning path
            // treats both the same way — re-read and use the row that won (design D4).
            dbContext.ChangeTracker.Clear();
            return UserSaveOutcome.NaturalKeyConflict;
        }
    }
}
