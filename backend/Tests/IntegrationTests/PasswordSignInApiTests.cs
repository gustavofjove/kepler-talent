using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using KeplerTalento.Domain.Identity;
using KeplerTalento.Infrastructure.Identity;
using KeplerTalento.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace KeplerTalento.Tests.IntegrationTests;

/// <summary>
/// KTL-45: password sign-in against the real pipeline and a real database, including the
/// fail-closed and least-privilege evidence the slice needs.
/// </summary>
[Collection(WebHostCollection.Name)]
public sealed class PasswordSignInApiTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>, IDisposable
{
    private const string DevIssuer = "https://kepler-talento.test/dev";
    private const string DevKey = "ktl-45-integration-development-key-0000000000";
    private const string LocalIssuer = "https://kepler-talento.test/accounts";
    private const string LocalKey = "ktl-45-integration-local-accounts-key-000000000";
    private const string Audience = "kepler-talento-test-api";

    private const string AdminPassword = "Admin-Password-2026";
    private const string UserPassword = "User-Password-2026";

    // Every variable this class sets, so Dispose can leave the process as other classes expect it.
    private static readonly string[] EnvironmentKeys =
    [
        "Authentication__LocalAccounts__Enabled",
        "Authentication__LocalAccounts__SigningKey",
        "Authentication__LocalAccounts__Issuer",
        "Authentication__LocalAccounts__Audience",
        "Authentication__LocalAccounts__SignInAttemptsPerMinute",
    ];

    [Fact]
    public async Task Correct_credentials_sign_in_with_the_accounts_role_and_permissions()
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        using var response = await SignInAsync(client, "RRHH_User", UserPassword);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("Bearer", (string?)body!["tokenType"]);
        Assert.Equal(480 * 60, (int?)body["expiresInSeconds"]);
        var me = await GetMeAsync(client, (string)body["accessToken"]!);
        Assert.Equal("rrhh_user", (string?)me["roleName"]);
        var permissions = me["permissions"]!.AsArray().Select(value => (string)value!).ToList();
        Assert.Contains("candidates.read", permissions);
        Assert.DoesNotContain("users.manage", permissions);
    }

    [Fact]
    public async Task Every_failure_cause_returns_the_same_refusal()
    {
        await ResetWithAccountsAsync();
        await using (var dbContext = NewDbContext())
        {
            var inactive = new User(
                Guid.CreateVersion7(), User.LocalSubject("inactive_user"), "Inactiva", "inactive@kepler-talento.local", "rrhh_user", DateTimeOffset.UtcNow);
            inactive.SetLocalCredentials("inactive_user", new Pbkdf2PasswordHasher(1_000).Hash(UserPassword), DateTimeOffset.UtcNow);
            inactive.Deactivate(DateTimeOffset.UtcNow);
            dbContext.Users.Add(inactive);
            // A provider user: no user name, no hash. It cannot be named by user name at all, so
            // its email is tried as the user name to prove there is no fallback lookup.
            dbContext.Users.Add(new User(
                Guid.CreateVersion7(), "provider-subject", "Proveedor", "provider@kepler-talento.local", "rrhh_admin", DateTimeOffset.UtcNow));
            await dbContext.SaveChangesAsync();
        }
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var attempts = new[]
        {
            ("nobody_at_all", UserPassword),
            ("rrhh_user", "Wrong-Password-2026"),
            ("inactive_user", UserPassword),
            ("provider@kepler-talento.local", UserPassword),
        };
        var bodies = new List<string>();
        foreach (var (userName, password) in attempts)
        {
            using var response = await SignInAsync(client, userName, password);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var problem = await response.Content.ReadFromJsonAsync<JsonObject>();
            Assert.Equal("auth.invalid_credentials", (string?)problem!["code"]);
            Assert.Null(problem["accessToken"]);
            // The trace and correlation ids differ per request by design; everything else must not.
            problem.Remove("traceId");
            problem.Remove("correlationId");
            bodies.Add(problem.ToJsonString());
        }
        Assert.Single(bodies.Distinct());
    }

    [Fact]
    public async Task Attempts_beyond_the_limit_are_refused_even_with_correct_credentials()
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory(attemptsPerMinute: 10);
        using var client = factory.CreateClient();

        for (var attempt = 1; attempt <= 10; attempt++)
        {
            using var refused = await SignInAsync(client, "rrhh_user", "Wrong-Password-2026");
            Assert.Equal(HttpStatusCode.Unauthorized, refused.StatusCode);
        }

        using var limited = await SignInAsync(client, "rrhh_user", UserPassword);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal("60", limited.Headers.RetryAfter?.ToString());
        var problem = await limited.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("auth.too_many_attempts", (string?)problem!["code"]);
    }

    [Fact]
    public async Task A_token_naming_one_issuer_but_signed_with_the_others_key_is_refused()
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        // The development key's value is the one a reader of the compose file knows.
        var forgedLocal = Mint(LocalIssuer, DevKey, "ktl-development", "local:rrhh_admin");
        var forgedDevelopment = Mint(DevIssuer, LocalKey, "ktl-local-accounts", "local:rrhh_admin");
        var keyIdSwapped = Mint(LocalIssuer, DevKey, "ktl-local-accounts", "local:rrhh_admin");
        var genuine = Mint(LocalIssuer, LocalKey, "ktl-local-accounts", "local:rrhh_admin");

        Assert.Equal(HttpStatusCode.Unauthorized, await GetStatusAsync(client, "/api/me", forgedLocal));
        Assert.Equal(HttpStatusCode.Unauthorized, await GetStatusAsync(client, "/api/me", forgedDevelopment));
        Assert.Equal(HttpStatusCode.Unauthorized, await GetStatusAsync(client, "/api/me", keyIdSwapped));
        Assert.Equal(HttpStatusCode.OK, await GetStatusAsync(client, "/api/me", genuine));
    }

    [Fact]
    public async Task An_expired_local_token_is_refused()
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var expired = Mint(LocalIssuer, LocalKey, "ktl-local-accounts", "local:rrhh_admin", expires: DateTime.UtcNow.AddMinutes(-2));

        Assert.Equal(HttpStatusCode.Unauthorized, await GetStatusAsync(client, "/api/me", expired));
    }

    [Fact]
    public async Task A_role_change_applies_to_a_token_already_issued()
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var token = await SignInForTokenAsync(client, "rrhh_user", UserPassword);
        Assert.Equal(HttpStatusCode.Forbidden, await GetStatusAsync(client, "/api/admin/users", token));

        await using (var dbContext = NewDbContext())
        {
            var user = await dbContext.Users.SingleAsync(value => value.UserName == "rrhh_user");
            user.AssignRole("rrhh_admin", DateTimeOffset.UtcNow);
            await dbContext.SaveChangesAsync();
        }

        Assert.Equal(HttpStatusCode.OK, await GetStatusAsync(client, "/api/admin/users", token));
    }

    [Fact]
    public async Task Deactivation_refuses_the_next_request_with_a_valid_token()
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var token = await SignInForTokenAsync(client, "rrhh_user", UserPassword);
        Assert.Equal(HttpStatusCode.OK, await GetStatusAsync(client, "/api/me", token));

        await using (var dbContext = NewDbContext())
        {
            var user = await dbContext.Users.SingleAsync(value => value.UserName == "rrhh_user");
            user.Deactivate(DateTimeOffset.UtcNow);
            await dbContext.SaveChangesAsync();
        }

        Assert.Equal(HttpStatusCode.Unauthorized, await GetStatusAsync(client, "/api/me", token));
    }

    [Fact]
    public async Task The_endpoint_does_not_exist_when_local_accounts_are_disabled()
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory(localAccountsEnabled: false);
        using var client = factory.CreateClient();

        // Anonymous, an unmapped route is refused like any other by the fallback policy: no
        // token, and nothing that tells the route apart from one that never existed.
        using var anonymous = await SignInAsync(client, "rrhh_user", UserPassword);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.DoesNotContain("accessToken", await anonymous.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // Authenticated, it is plainly absent.
        var token = Mint(DevIssuer, DevKey, "ktl-development", "dev-caller");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/token")
        {
            Content = JsonContent.Create(new { userName = "rrhh_user", password = UserPassword }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var authenticated = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NotFound, authenticated.StatusCode);
    }

    [Fact]
    public async Task A_malformed_body_is_refused_without_revealing_any_account()
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        using var empty = await client.PostAsJsonAsync("/api/auth/token", new { userName = "", password = "" });
        using var notJson = await client.PostAsync("/api/auth/token", new StringContent("{", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, notJson.StatusCode);
        Assert.DoesNotContain("rrhh", await empty.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    public static TheoryData<string, string> AdministrationEndpoints => new()
    {
        { "GET", "/api/admin/users" },
        { "GET", "/api/admin/roles" },
        { "GET", "/api/import/batches" },
        { "POST", "/api/catalogs/skill" },
    };

    [Theory]
    [MemberData(nameof(AdministrationEndpoints))]
    public async Task The_user_account_is_refused_administration_and_anonymous_callers_everything(string method, string path)
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var userToken = await SignInForTokenAsync(client, "rrhh_user", UserPassword);
        var adminToken = await SignInForTokenAsync(client, "rrhh_admin", AdminPassword);

        Assert.Equal(HttpStatusCode.Unauthorized, await SendAsync(client, method, path, token: null));
        Assert.Equal(HttpStatusCode.Forbidden, await SendAsync(client, method, path, userToken));
        Assert.NotEqual(HttpStatusCode.Forbidden, await SendAsync(client, method, path, adminToken));
        Assert.NotEqual(HttpStatusCode.Unauthorized, await SendAsync(client, method, path, adminToken));
    }

    [Fact]
    public async Task Administration_responses_never_carry_a_password_hash()
    {
        await ResetWithAccountsAsync();
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var token = await SignInForTokenAsync(client, "rrhh_admin", AdminPassword);
        Guid userId;
        await using (var dbContext = NewDbContext())
        {
            userId = (await dbContext.Users.SingleAsync(value => value.UserName == "rrhh_user")).Id;
        }

        foreach (var path in new[] { "/api/admin/users?includeInactive=true&page=1&pageSize=50", $"/api/admin/users/{userId}", "/api/me" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, path);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var json = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("pbkdf2", json, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(AdminPassword, json, StringComparison.Ordinal);
            Assert.DoesNotContain(UserPassword, json, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Sign_in_logs_carry_neither_the_user_name_nor_the_password()
    {
        await ResetWithAccountsAsync();
        var capture = new ImportApiTests.CapturingLoggerProvider();
        await using var factory = CreateFactory(capture: capture);
        using var client = factory.CreateClient();

        (await SignInAsync(client, "rrhh_user", UserPassword)).Dispose();
        (await SignInAsync(client, "rrhh_user", "Wrong-Password-2026")).Dispose();
        (await SignInAsync(client, "someone_unknown", "Unknown-Password-2026")).Dispose();

        var rendered = capture.Rendered();
        Assert.Contains("Password sign-in succeeded", rendered, StringComparison.Ordinal);
        Assert.Contains("Password sign-in refused", rendered, StringComparison.Ordinal);
        foreach (var secret in new[] { "rrhh_user", "someone_unknown", UserPassword, "Wrong-Password-2026", "Unknown-Password-2026" })
        {
            Assert.DoesNotContain(secret, rendered, StringComparison.Ordinal);
        }
    }

    public void Dispose()
    {
        foreach (var key in EnvironmentKeys)
        {
            Environment.SetEnvironmentVariable(key, null);
        }
    }

    private async Task ResetWithAccountsAsync()
    {
        await using var dbContext = NewDbContext();
        await dbContext.Database.EnsureDeletedAsync();
        await DatabaseInitializer.MigrateAsync(dbContext, CancellationToken.None);
        // A low work factor keeps the suite fast. Verify reads the iterations from the stored
        // value, so the API's default-strength hasher checks these as it would any other.
        await DatabaseInitializer.SeedLocalAccountsAsync(
            dbContext,
            new Pbkdf2PasswordHasher(1_000),
            [
                new LocalAccountSeed("rrhh_admin", "RRHH Administración", "rrhh.admin@kepler-talento.local", "rrhh_admin", AdminPassword),
                new LocalAccountSeed("rrhh_user", "RRHH Usuario", "rrhh.user@kepler-talento.local", "rrhh_user", UserPassword),
            ],
            new HashSet<string>(),
            CancellationToken.None);
    }

    private ApplicationDbContext NewDbContext() => new(
        new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(database.ConnectionString).UseTestFieldEncryption().Options);

    private WebApplicationFactory<Program> CreateFactory(
        bool localAccountsEnabled = true,
        int attemptsPerMinute = 1000,
        ImportApiTests.CapturingLoggerProvider? capture = null)
    {
        var settings = new Dictionary<string, string?>
        {
            ["ConnectionStrings:ApplicationDatabase"] = database.ConnectionString,
            ["DevelopmentActor:Enabled"] = "false",
            ["Authentication:SubjectClaim"] = "oid",
            ["Authentication:DevelopmentIssuer:Enabled"] = "true",
            ["Authentication:DevelopmentIssuer:SigningKey"] = DevKey,
            ["Authentication:DevelopmentIssuer:Issuer"] = DevIssuer,
            ["Authentication:DevelopmentIssuer:Audience"] = Audience,
            ["Authentication:LocalAccounts:Enabled"] = localAccountsEnabled ? "true" : "false",
            ["Authentication:LocalAccounts:SigningKey"] = LocalKey,
            ["Authentication:LocalAccounts:Issuer"] = LocalIssuer,
            ["Authentication:LocalAccounts:Audience"] = Audience,
            ["Authentication:LocalAccounts:SignInAttemptsPerMinute"] = attemptsPerMinute.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["ProxyTrust:KnownNetworks:0"] = "127.0.0.0/8",
        };
        // Program.cs reads these before the factory's overrides apply (see WebHostCollection).
        foreach (var (key, value) in settings)
        {
            Environment.SetEnvironmentVariable(key.Replace(":", "__", StringComparison.Ordinal), value);
        }
        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(settings));
            if (capture is not null)
            {
                builder.ConfigureTestServices(services =>
                {
                    services.RemoveAll<ILoggerFactory>();
                    services.AddSingleton<ILoggerFactory>(_ => new Serilog.Extensions.Logging.SerilogLoggerFactory(
                        new Serilog.LoggerConfiguration()
                            .MinimumLevel.Verbose()
                            .Enrich.With<KeplerTalento.Web.Observability.PersonalDataRedactionEnricher>()
                            .WriteTo.Sink(new Capture(capture))
                            .CreateLogger(),
                        dispose: true));
                });
            }
        });
    }

    private static Task<HttpResponseMessage> SignInAsync(HttpClient client, string userName, string password) =>
        client.PostAsJsonAsync("/api/auth/token", new { userName, password });

    private static async Task<string> SignInForTokenAsync(HttpClient client, string userName, string password)
    {
        using var response = await SignInAsync(client, userName, password);
        response.EnsureSuccessStatusCode();
        return (string)(await response.Content.ReadFromJsonAsync<JsonObject>())!["accessToken"]!;
    }

    private static async Task<JsonObject> GetMeAsync(HttpClient client, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonObject>())!;
    }

    private static Task<HttpStatusCode> GetStatusAsync(HttpClient client, string path, string token) =>
        SendAsync(client, "GET", path, token);

    private static async Task<HttpStatusCode> SendAsync(HttpClient client, string method, string path, string? token)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method is "POST" or "PUT")
        {
            request.Content = new StringContent(
                JsonSerializer.Serialize(new { nameEs = $"KTL-45 {Guid.NewGuid():N}" }), Encoding.UTF8, "application/json");
        }
        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        using var response = await client.SendAsync(request);
        return response.StatusCode;
    }

    private static string Mint(string issuer, string key, string keyId, string subject, DateTime? expires = null)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: Audience,
            claims: [new Claim("oid", subject), new Claim("name", "Forged"), new Claim("email", "forged@example.test")],
            notBefore: expires is not null && expires < now ? expires.Value.AddMinutes(-5) : now.AddSeconds(-1),
            expires: expires ?? now.AddMinutes(10),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)) { KeyId = keyId },
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed class Capture(ImportApiTests.CapturingLoggerProvider capture) : Serilog.Core.ILogEventSink
    {
        public void Emit(Serilog.Events.LogEvent logEvent)
        {
            var properties = string.Join(' ', logEvent.Properties.Select(property => $"{property.Key}={property.Value}"));
            capture.Add($"{logEvent.RenderMessage()} {properties} {logEvent.Exception}");
        }
    }
}
