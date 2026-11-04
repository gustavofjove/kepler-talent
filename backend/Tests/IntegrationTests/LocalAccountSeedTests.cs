using KeplerTalento.Domain.Identity;
using KeplerTalento.Infrastructure.Identity;
using KeplerTalento.Infrastructure.Persistence;
using KeplerTalento.Web.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace KeplerTalento.Tests.IntegrationTests;

/// <summary>
/// KTL-45 design D6 and D7: seeding local accounts from configuration, and the schema and
/// privileges that hold them.
/// </summary>
public sealed class LocalAccountSeedTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private static readonly Pbkdf2PasswordHasher FastHasher = new(1_000);
    private static readonly IReadOnlySet<string> NothingForbidden = new HashSet<string>();

    [Fact]
    public async Task A_fresh_database_gets_both_accounts_with_their_roles()
    {
        await ResetAsync();

        await SeedAsync(Admin("Admin-Password-2026"), User("User-Password-2026"));

        await using var dbContext = NewDbContext();
        var users = await dbContext.Users.Where(user => user.UserName != null).OrderBy(user => user.UserName).ToListAsync();
        Assert.Collection(
            users,
            admin =>
            {
                Assert.Equal("rrhh_admin", admin.UserName);
                Assert.Equal("rrhh_admin", admin.RoleName);
                Assert.Equal("local:rrhh_admin", admin.ExternalSubject);
                Assert.True(admin.IsActive);
            },
            user =>
            {
                Assert.Equal("rrhh_user", user.UserName);
                Assert.Equal("rrhh_user", user.RoleName);
                Assert.True(FastHasher.Verify("User-Password-2026", user.PasswordHash!));
            });
    }

    [Fact]
    public async Task Running_twice_creates_no_duplicates_and_keeps_the_hash()
    {
        await ResetAsync();
        await SeedAsync(User("User-Password-2026"));
        string firstHash;
        await using (var dbContext = NewDbContext())
        {
            firstHash = (await dbContext.Users.SingleAsync(user => user.UserName == "rrhh_user")).PasswordHash!;
        }

        await SeedAsync(User("User-Password-2026"));

        await using var after = NewDbContext();
        var row = await after.Users.SingleAsync(user => user.UserName == "rrhh_user");
        Assert.Equal(firstHash, row.PasswordHash);
    }

    [Fact]
    public async Task A_changed_password_is_rotated_without_touching_identity_role_or_state()
    {
        await ResetAsync();
        await SeedAsync(User("Old-Password-2026"));
        Guid id;
        await using (var dbContext = NewDbContext())
        {
            id = (await dbContext.Users.SingleAsync(user => user.UserName == "rrhh_user")).Id;
        }

        await SeedAsync(User("New-Password-2026"));

        await using var after = NewDbContext();
        var row = await after.Users.SingleAsync(user => user.UserName == "rrhh_user");
        Assert.Equal(id, row.Id);
        Assert.Equal("rrhh_user", row.RoleName);
        Assert.True(row.IsActive);
        Assert.False(FastHasher.Verify("Old-Password-2026", row.PasswordHash!));
        Assert.True(FastHasher.Verify("New-Password-2026", row.PasswordHash!));
    }

    [Fact]
    public async Task An_administrators_role_change_and_deactivation_survive_a_reseed()
    {
        await ResetAsync();
        await SeedAsync(User("User-Password-2026"));
        await using (var dbContext = NewDbContext())
        {
            var row = await dbContext.Users.SingleAsync(user => user.UserName == "rrhh_user");
            row.AssignRole("readonly", DateTimeOffset.UtcNow);
            row.Deactivate(DateTimeOffset.UtcNow);
            await dbContext.SaveChangesAsync();
        }

        await SeedAsync(User("Rotated-Password-2026"));

        await using var after = NewDbContext();
        var reseeded = await after.Users.SingleAsync(user => user.UserName == "rrhh_user");
        Assert.Equal("readonly", reseeded.RoleName);
        Assert.False(reseeded.IsActive);
    }

    [Fact]
    public async Task A_short_password_fails_the_step_and_stores_nothing()
    {
        await ResetAsync();

        var failure = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            SeedAsync(Admin("Admin-Password-2026"), User("short-11chr")));

        Assert.Contains("12 characters", failure.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("short-11chr", failure.Message, StringComparison.Ordinal);
        await using var dbContext = NewDbContext();
        Assert.False(await dbContext.Users.AnyAsync(user => user.UserName != null));
    }

    [Fact]
    public async Task An_unknown_role_fails_the_step()
    {
        await ResetAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            SeedAsync(new LocalAccountSeed("rrhh_user", "RRHH", "rrhh@kepler-talento.local", "no_such_role", "User-Password-2026")));
    }

    [Fact]
    public async Task Development_only_passwords_are_refused_where_forbidden()
    {
        await ResetAsync();

        var failure = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            SeedAsync(LocalAccountDefaults.DevelopmentOnlyValues, Admin("KeplerLocal-Admin-2026")));

        Assert.Contains("development-only", failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_seeded_local_administrator_satisfies_the_bootstrap_check()
    {
        await ResetAsync();
        await SeedAsync(Admin("Admin-Password-2026"));

        await using var dbContext = NewDbContext();
        // No bootstrap address configured: this throws only if nobody can administer.
        await DatabaseInitializer.SeedBootstrapAdministratorAsync(dbContext, email: null, displayName: null, CancellationToken.None);

        Assert.Equal(1, await dbContext.Users.CountAsync());
    }

    [Fact]
    public async Task The_stored_hash_is_strong_salted_and_free_of_plaintext()
    {
        await ResetAsync();
        await using (var dbContext = NewDbContext())
        {
            // The production work factor, once, to prove what a real deploy stores.
            await DatabaseInitializer.SeedLocalAccountsAsync(
                dbContext,
                new Pbkdf2PasswordHasher(),
                [Admin("Same-Password-2026"), User("Same-Password-2026")],
                NothingForbidden,
                CancellationToken.None);
        }

        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT \"PasswordHash\", row_to_json(u)::text FROM \"ADM_Users\" u WHERE \"UserName\" IS NOT NULL",
            connection);
        await using var reader = await command.ExecuteReaderAsync();
        var hashes = new List<string>();
        while (await reader.ReadAsync())
        {
            var hash = reader.GetString(0);
            Assert.StartsWith("pbkdf2-sha256$600000$", hash, StringComparison.Ordinal);
            Assert.DoesNotContain("Same-Password-2026", reader.GetString(1), StringComparison.Ordinal);
            hashes.Add(hash);
        }
        Assert.Equal(2, hashes.Count);
        Assert.NotEqual(hashes[0], hashes[1]);
    }

    [Fact]
    public async Task The_schema_enforces_the_user_name_shape_uniqueness_and_hash_pairing()
    {
        await ResetAsync();
        await SeedAsync(User("User-Password-2026"));
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();

        await using (var constraints = new NpgsqlCommand(
            """
            SELECT
                (SELECT count(*) FROM pg_constraint WHERE conname IN ('CK_ADM_Users_UserName', 'CK_ADM_Users_PasswordHash')),
                (SELECT count(*) FROM pg_indexes WHERE indexname = 'UX_ADM_Users_UserName' AND indexdef LIKE 'CREATE UNIQUE%')
            """,
            connection))
        await using (var reader = await constraints.ExecuteReaderAsync())
        {
            Assert.True(await reader.ReadAsync());
            Assert.Equal(2L, reader.GetInt64(0));
            Assert.Equal(1L, reader.GetInt64(1));
        }

        // A hash with no user name, a malformed name, and a duplicate name, each written past the
        // domain, are all refused by the database itself.
        foreach (var sql in new[]
        {
            "UPDATE \"ADM_Users\" SET \"UserName\" = NULL WHERE \"UserName\" = 'rrhh_user'",
            "UPDATE \"ADM_Users\" SET \"UserName\" = 'Has Space' WHERE \"UserName\" = 'rrhh_user'",
        })
        {
            await using var write = new NpgsqlCommand(sql, connection);
            await Assert.ThrowsAsync<PostgresException>(() => write.ExecuteNonQueryAsync());
        }
        await using var duplicate = new NpgsqlCommand(
            """
            INSERT INTO "ADM_Users" ("Id", "ExternalSubject", "DisplayName", "Email", "RoleName", "IsActive", "CreatedAtUtc", "UpdatedAtUtc", "UserName")
            VALUES (gen_random_uuid(), 'local:dup', 'Dup', 'dup@kepler-talento.local', 'rrhh_user', true, now(), now(), 'rrhh_user')
            """,
            connection);
        var violation = await Assert.ThrowsAsync<PostgresException>(() => duplicate.ExecuteNonQueryAsync());
        Assert.Equal(PostgresErrorCodes.UniqueViolation, violation.SqlState);
    }

    [Fact]
    public async Task The_runtime_role_still_cannot_delete_users()
    {
        await ResetAsync();
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT has_table_privilege('ktl_runtime', 'public.\"ADM_Users\"', 'SELECT'), has_table_privilege('ktl_runtime', 'public.\"ADM_Users\"', 'DELETE')",
            connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.True(reader.GetBoolean(0));
        Assert.False(reader.GetBoolean(1));
    }

    private static LocalAccountSeed Admin(string password) =>
        new("rrhh_admin", "RRHH Administración", "rrhh.admin@kepler-talento.local", "rrhh_admin", password);

    private static LocalAccountSeed User(string password) =>
        new("rrhh_user", "RRHH Usuario", "rrhh.user@kepler-talento.local", "rrhh_user", password);

    private Task SeedAsync(params LocalAccountSeed[] accounts) => SeedAsync(NothingForbidden, accounts);

    private async Task SeedAsync(IReadOnlySet<string> forbidden, params LocalAccountSeed[] accounts)
    {
        await using var dbContext = NewDbContext();
        await DatabaseInitializer.SeedLocalAccountsAsync(dbContext, FastHasher, accounts, forbidden, CancellationToken.None);
    }

    private async Task ResetAsync()
    {
        await using var dbContext = NewDbContext();
        await dbContext.Database.EnsureDeletedAsync();
        await DatabaseInitializer.MigrateAsync(dbContext, CancellationToken.None);
    }

    private ApplicationDbContext NewDbContext() => new(
        new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(database.ConnectionString).UseTestFieldEncryption().Options);
}
