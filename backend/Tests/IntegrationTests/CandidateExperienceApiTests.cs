using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using KeplerTalento.Application.Features.Candidates;
using KeplerTalento.Domain.Candidates;
using KeplerTalento.Domain.Catalogs;
using KeplerTalento.Domain.Identity;
using KeplerTalento.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace KeplerTalento.Tests.IntegrationTests;

/// <summary>
/// KTL-46: experience functions as sanitised rich text and years with one decimal, through the
/// real token pipeline, HTTP, the application and PostgreSQL.
/// </summary>
[Collection(WebHostCollection.Name)]
public sealed class CandidateExperienceApiTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Issuer = "https://kepler-talento.test/issuer";
    private const string Audience = "kepler-talento-test-api";
    private const string SigningKey = "ktl-46-integration-test-signing-key-00000000000";

    [Fact]
    public async Task Rich_functions_are_sanitised_before_storage_and_returned_in_canonical_form()
    {
        await ResetAsync();
        await using var factory = CreateFactory();
        using var editor = await EditorAsync(factory);
        var candidate = await CreateCandidateAsync(editor);

        using var response = await PutExperienceAsync(editor, candidate, Entry(functions:
            "<p onclick='alert(1)' style='color:red'><b><span style='white-space: pre-wrap;'>Lidera</span></b> <i>equipos</i> <u>remotos</u>"
            + "<script>alert(1)</script><a href='https://example.test'>enlace</a><img src='x' onerror='alert(1)'></p>"
            + "<ol><li value='1'>Planifica</li></ol><iframe src='https://example.test'></iframe>"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        const string expected = "<p><strong>Lidera</strong> <em>equipos</em> remotos</p><ol><li>Planifica</li></ol>";
        var saved = Assert.Single((await response.Content.ReadFromJsonAsync<CandidateResponse>())!.Experience);
        Assert.Equal(expected, saved.Functions);
        var read = (await editor.GetFromJsonAsync<CandidateResponse>($"/api/candidates/{candidate.Id}"))!;
        Assert.Equal(expected, Assert.Single(read.Experience).Functions);
        await using var db = NewDbContext();
        Assert.Equal(expected, (await db.CandidateExperience.AsNoTracking().SingleAsync()).Functions);
    }

    [Fact]
    public async Task Over_long_functions_are_refused_without_echoing_the_text_and_nothing_changes()
    {
        await ResetAsync();
        await using var factory = CreateFactory();
        using var editor = await EditorAsync(factory);
        var candidate = await CreateCandidateAsync(editor);
        var text = "Responsabilidades " + new string('x', CandidateTextLimits.Functions);

        using var response = await PutExperienceAsync(editor, candidate, Entry(functions: $"<p>{text}</p>"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(CandidateErrors.FieldTooLong, ProblemCode(body));
        Assert.DoesNotContain("Responsabilidades", body, StringComparison.Ordinal);
        Assert.DoesNotContain("xxxxxxxxxx", body, StringComparison.Ordinal);
        await using var db = NewDbContext();
        Assert.Empty(await db.CandidateExperience.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task Years_the_dates_determine_override_the_callers_value()
    {
        await ResetAsync();
        await using var factory = CreateFactory();
        using var editor = await EditorAsync(factory);
        var candidate = await CreateCandidateAsync(editor);
        var twoYearsAgo = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-2).ToString("yyyy-MM-dd");

        using var response = await PutExperienceAsync(
            editor,
            candidate,
            Entry(company: "Con fechas", startDate: "2019-03-01", endDate: "2024-06-30", years: 9m),
            Entry(company: "Actual", startDate: twoYearsAgo, isCurrent: true, years: 40m),
            Entry(company: "A mano", endDate: "2024-06-30", years: 3.5m),
            Entry(company: "Sin años"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var read = (await editor.GetFromJsonAsync<CandidateResponse>($"/api/candidates/{candidate.Id}"))!;
        var byCompany = read.Experience.ToDictionary(item => item.Company, item => item.YearsExperience);
        Assert.Equal(5.3m, byCompany["Con fechas"]);
        // This month two years ago up to this month, both included: 25 months.
        Assert.Equal(2.1m, byCompany["Actual"]);
        Assert.Equal(3.5m, byCompany["A mano"]);
        Assert.Null(byCompany["Sin años"]);
    }

    [Theory]
    [InlineData(-1.0)]
    [InlineData(100.1)]
    [InlineData(2.25)]
    public async Task Years_out_of_range_are_a_validation_problem_and_nothing_changes(double years)
    {
        await ResetAsync();
        await using var factory = CreateFactory();
        using var editor = await EditorAsync(factory);
        var candidate = await CreateCandidateAsync(editor);

        using var response = await PutExperienceAsync(editor, candidate, Entry(years: (decimal)years));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(CandidateErrors.ExperienceYearsInvalid, ProblemCode(await response.Content.ReadAsStringAsync()));
        await using var db = NewDbContext();
        Assert.Empty(await db.CandidateExperience.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task An_experience_without_a_sector_is_stored_with_none_and_returned_as_null()
    {
        await ResetAsync();
        await using var factory = CreateFactory();
        using var editor = await EditorAsync(factory);
        var candidate = await CreateCandidateAsync(editor);

        using var response = await PutExperienceAsync(
            editor,
            candidate,
            Entry(company: "Sin sector", sector: null),
            Entry(company: "En blanco", sector: "  "),
            Entry(company: "Con sector"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var read = (await editor.GetFromJsonAsync<CandidateResponse>($"/api/candidates/{candidate.Id}"))!;
        var byCompany = read.Experience.ToDictionary(item => item.Company, item => item.Sector);
        Assert.Null(byCompany["Sin sector"]);
        Assert.Null(byCompany["En blanco"]);
        Assert.Equal("Servicios", byCompany["Con sector"]);
        await using var db = NewDbContext();
        Assert.Equal(2, await db.CandidateExperience.AsNoTracking().CountAsync(item => item.SectorId == null));
    }

    [Fact]
    public async Task Dates_after_the_current_month_are_a_validation_problem_and_nothing_changes()
    {
        await ResetAsync();
        await using var factory = CreateFactory();
        using var editor = await EditorAsync(factory);
        var candidate = await CreateCandidateAsync(editor);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var thisMonth = new DateOnly(today.Year, today.Month, 1);
        var nextMonth = thisMonth.AddMonths(1).ToString("yyyy-MM-dd");

        foreach (var entry in new[]
        {
            Entry(startDate: nextMonth, isCurrent: true),
            Entry(startDate: "2020-01-01", endDate: nextMonth),
        })
        {
            using var response = await PutExperienceAsync(editor, candidate, entry);

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal(CandidateErrors.ExperienceDateFuture, ProblemCode(await response.Content.ReadAsStringAsync()));
        }
        await using (var db = NewDbContext())
        {
            Assert.Empty(await db.CandidateExperience.AsNoTracking().ToListAsync());
        }

        // The current month itself is allowed.
        using var accepted = await PutExperienceAsync(
            editor, candidate, Entry(startDate: thisMonth.ToString("yyyy-MM-dd"), isCurrent: true));
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
    }

    [Fact]
    public async Task Legacy_plain_text_functions_are_returned_as_escaped_paragraphs()
    {
        await ResetAsync();
        await using var factory = CreateFactory();
        using var editor = await EditorAsync(factory);
        var candidate = await CreateCandidateAsync(editor);
        await using (var db = NewDbContext())
        {
            // As ktl-migrate stores an Access memo: plain text, never through the sanitizer.
            var sector = await db.CatalogItems.SingleAsync(item => item.Family == CatalogFamilies.Sector
                && item.NameNormalized == CatalogName.Normalize("Servicios"));
            var legacy = new CandidateExperience(Guid.CreateVersion7(), candidate.Id, sector.Id, "Legado", "Puesto");
            legacy.SetFunctions("Gestión de equipos\r\nPlanificación\n<img src=x onerror=alert(1)> a < b");
            db.CandidateExperience.Add(legacy);
            await db.SaveChangesAsync();
        }

        var read = (await editor.GetFromJsonAsync<CandidateResponse>($"/api/candidates/{candidate.Id}"))!;

        Assert.Equal(
            "<p>Gestión de equipos</p><p>Planificación</p><p>&lt;img src=x onerror=alert(1)&gt; a &lt; b</p>",
            Assert.Single(read.Experience).Functions);
    }

    [Fact]
    public async Task Experience_writes_fail_closed_before_validation_for_unauthenticated_and_unauthorized_callers()
    {
        await ResetAsync();
        await using var factory = CreateFactory();
        using var editor = await EditorAsync(factory);
        var candidate = await CreateCandidateAsync(editor);
        await AddUserAsync("reader", "readonly");
        using var reader = factory.CreateClient();
        await AuthenticateAsync(reader, "reader");
        using var anonymous = factory.CreateClient();

        foreach (var (client, expected) in new[] { (anonymous, HttpStatusCode.Unauthorized), (reader, HttpStatusCode.Forbidden) })
        {
            foreach (var target in new[] { candidate.Id, Guid.NewGuid() })
            {
                foreach (var body in Bodies(candidate.Version))
                {
                    using var response = await client.PutAsync($"/api/candidates/{target}/experience", body);
                    Assert.Equal(expected, response.StatusCode);
                }
            }
        }

        await using var db = NewDbContext();
        Assert.Empty(await db.CandidateExperience.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task A_malformed_body_from_an_editor_is_a_validation_problem()
    {
        await ResetAsync();
        await using var factory = CreateFactory();
        using var editor = await EditorAsync(factory);
        var candidate = await CreateCandidateAsync(editor);

        using var response = await editor.PutAsync(
            $"/api/candidates/{candidate.Id}/experience",
            new StringContent("{ not json", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(CandidateErrors.ConstraintViolation, ProblemCode(await response.Content.ReadAsStringAsync()));
    }

    private static IEnumerable<HttpContent> Bodies(uint version)
    {
        yield return JsonContent.Create(new { experience = new[] { Entry() }, version });
        yield return JsonContent.Create(new
        {
            experience = new[] { Entry(functions: "<p>" + new string('x', CandidateTextLimits.Functions + 1) + "</p>") },
            version,
        });
        yield return JsonContent.Create(new
        {
            experience = new[] { Entry(functions: "<script>alert(1)</script>", years: -5m) },
            version = 0,
        });
        yield return new StringContent("{ not json", Encoding.UTF8, "application/json");
    }

    private static CandidateExperienceInput Entry(
        string company = "Empresa",
        string? functions = null,
        string? startDate = null,
        string? endDate = null,
        bool isCurrent = false,
        decimal? years = null,
        string? sector = "Servicios") =>
        new(null, company, "Puesto", sector, functions, startDate, endDate, years, isCurrent, null);

    private static Task<HttpResponseMessage> PutExperienceAsync(
        HttpClient client,
        CandidateResponse candidate,
        params CandidateExperienceInput[] entries) =>
        client.PutAsJsonAsync($"/api/candidates/{candidate.Id}/experience", new { experience = entries, version = candidate.Version });

    private static async Task<CandidateResponse> CreateCandidateAsync(HttpClient client)
    {
        using var response = await client.PostAsJsonAsync("/api/candidates", new
        {
            firstName = "Marta",
            lastName = "Experiencia",
            phone = "",
            email = "",
            location = "",
            province = "",
            country = "España",
            source = "Email",
            notes = "",
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CandidateResponse>())!;
    }

    /// <summary>The specific code of a validation problem: its first issue's, not the generic one.</summary>
    private static string? ProblemCode(string body)
    {
        using var json = JsonDocument.Parse(body);
        return json.RootElement.TryGetProperty("errors", out var errors) && errors.GetArrayLength() > 0
            ? errors[0].GetProperty("code").GetString()
            : null;
    }

    private async Task<HttpClient> EditorAsync(WebApplicationFactory<Program> factory)
    {
        await AddUserAsync("editor", "rrhh_user");
        var client = factory.CreateClient();
        await AuthenticateAsync(client, "editor");
        return client;
    }

    private static async Task AuthenticateAsync(HttpClient client, string subject)
    {
        using var response = await client.PostAsJsonAsync(
            "/api/dev/token",
            new { subject, displayName = "Integration Caller", email = $"{subject}@example.test" });
        response.EnsureSuccessStatusCode();
        var token = (await response.Content.ReadFromJsonAsync<DevelopmentTokenResponse>())!.AccessToken;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    private async Task ResetAsync()
    {
        await using var db = NewDbContext();
        await db.Database.EnsureDeletedAsync();
        await DatabaseInitializer.MigrateAsync(db, CancellationToken.None);
        await DatabaseInitializer.SeedCatalogsAsync(db, CancellationToken.None);
    }

    private async Task AddUserAsync(string subject, string roleName)
    {
        await using var db = NewDbContext();
        db.Users.Add(new User(Guid.CreateVersion7(), subject, "Integration User", $"{subject}@example.test", roleName, DateTimeOffset.UtcNow));
        await db.SaveChangesAsync();
    }

    private ApplicationDbContext NewDbContext() => new(
        new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(database.ConnectionString).UseTestFieldEncryption().Options);

    private WebApplicationFactory<Program> CreateFactory()
    {
        // Program selects the identity branch while composing services, before the in-memory
        // override is applied, so the switches are set in the environment as well.
        Environment.SetEnvironmentVariable("ConnectionStrings__ApplicationDatabase", database.ConnectionString);
        Environment.SetEnvironmentVariable("DevelopmentActor__Enabled", "false");
        Environment.SetEnvironmentVariable("OperationWorker__Enabled", "false");
        Environment.SetEnvironmentVariable("Authentication__SubjectClaim", "oid");
        Environment.SetEnvironmentVariable("Authentication__DevelopmentIssuer__Enabled", "true");
        Environment.SetEnvironmentVariable("Authentication__DevelopmentIssuer__SigningKey", SigningKey);
        Environment.SetEnvironmentVariable("Authentication__DevelopmentIssuer__Issuer", Issuer);
        Environment.SetEnvironmentVariable("Authentication__DevelopmentIssuer__Audience", Audience);
        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["ConnectionStrings:ApplicationDatabase"] = database.ConnectionString,
                    ["DevelopmentActor:Enabled"] = "false",
                    ["Authentication:SubjectClaim"] = "oid",
                    ["Authentication:DevelopmentIssuer:Enabled"] = "true",
                    ["Authentication:DevelopmentIssuer:SigningKey"] = SigningKey,
                    ["Authentication:DevelopmentIssuer:Issuer"] = Issuer,
                    ["Authentication:DevelopmentIssuer:Audience"] = Audience,
                    ["ProxyTrust:KnownNetworks:0"] = "127.0.0.0/8",
                }));
        });
    }

    private sealed record DevelopmentTokenResponse(string AccessToken);
}
