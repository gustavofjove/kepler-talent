using System.Net;
using System.Net.Http.Json;
using System.Text;
using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Features.Candidates;
using KeplerTalento.Application.Features.Search;
using KeplerTalento.Domain.Documents;
using KeplerTalento.Domain.Positions;
using KeplerTalento.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;

namespace KeplerTalento.Tests.IntegrationTests;

/// <summary>
/// KTL-33 security evidence: what reaches PostgreSQL is ciphertext, a copy of every table
/// reveals none of it, damaged values fail closed, and nothing sensitive reaches the logs.
/// </summary>
[Collection(WebHostCollection.Name)]
public sealed class EncryptedStorageSecurityTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    // Distinctive enough that a match anywhere in a table copy can only be a leak.
    private const string FirstName = "Eulalia";
    private const string LastName = "Quiroga-Bermejo";
    private const string Email = "eulalia.quiroga@privado.test";
    private const string Phone = "+34 699 123 777";
    private const string Notes = "Prefiere entrevistas por la tarde";
    private const string NoteBody = "Referencia confidencial del anterior empleo";
    private const string Company = "Talleres Quiroga SL";
    // KTL-46: functions are rich text now; the words inside the markup must not leak either.
    private const string Functions = "Soldadura TIG en calderería pesada";
    private const string SearchTerm = "Quiroga-Bermejo";
    private const string FileName = "CV Eulalia Quiroga.pdf";

    /// <summary>A stored envelope: prefix, key identifier and a payload, as opposed to the literal in SQL text.</summary>
    private static readonly System.Text.RegularExpressions.Regex Envelope = new(@"ktl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}");

    private static readonly string[] Secrets = [FirstName, LastName, Email, Phone, Notes, NoteBody, Company, Functions, FileName];

    [Fact]
    public async Task Values_written_through_the_api_are_ciphertext_in_every_encrypted_column_and_in_a_full_table_copy()
    {
        var logs = new ImportApiTests.CapturingLoggerProvider();
        await ResetAsync();
        using var factory = CreateFactory(logs);
        using var client = factory.CreateClient();

        var candidate = await CreateCandidateAsync(client);
        await WriteRelatedDataAsync(client, candidate);

        // Read back through the API: the application still sees plaintext.
        var detail = await client.GetStringAsync($"/api/candidates/{candidate.Id}");
        Assert.Contains(LastName, detail, StringComparison.Ordinal);
        Assert.DoesNotContain("emailHash", detail, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ktl1.", detail, StringComparison.Ordinal);
        var search = await client.PostAsJsonAsync("/api/candidates/search", new { filters = new { text = SearchTerm } });
        var searchBody = await search.Content.ReadAsStringAsync();
        Assert.True(search.IsSuccessStatusCode, searchBody);
        Assert.Contains(candidate.Id.ToString(), searchBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("emailHash", searchBody, StringComparison.OrdinalIgnoreCase);

        // What an attacker holding a copy of the database sees: every row of every table.
        var copy = await CopyEveryTableAsync();
        foreach (var secret in Secrets)
        {
            Assert.DoesNotContain(secret, copy, StringComparison.Ordinal);
        }
        Assert.DoesNotContain(SearchTerm, copy, StringComparison.Ordinal);
        Assert.Contains("ktl1.", copy, StringComparison.Ordinal);

        // Nor does anything written reach the logs: no plaintext, no envelope, no key material.
        var rendered = logs.Rendered();
        foreach (var secret in Secrets)
        {
            Assert.DoesNotContain(secret, rendered, StringComparison.Ordinal);
        }
        Assert.DoesNotMatch(Envelope, rendered);
        Assert.DoesNotContain(TestFieldEncryption.KeyFile, rendered, StringComparison.Ordinal);
        var keys = KeplerTalento.Infrastructure.Encryption.FieldKeySet.Load(TestFieldEncryption.KeyFile);
        foreach (var key in keys.Encryption.Keys.Values.Concat(keys.BlindIndex.Keys.Values))
        {
            Assert.DoesNotContain(Convert.ToBase64String(key), rendered, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task A_value_moved_into_another_column_fails_closed_without_revealing_anything()
    {
        var logs = new ImportApiTests.CapturingLoggerProvider();
        await ResetAsync();
        using var factory = CreateFactory(logs);
        using var client = factory.CreateClient();
        var candidate = await CreateCandidateAsync(client);

        // Both are valid envelopes, so the database check accepts the swap. Only the bound
        // column context tells them apart.
        await using (var connection = new NpgsqlConnection(database.ConnectionString))
        {
            await connection.OpenAsync();
            await using var swap = new NpgsqlCommand(
                """UPDATE "CND_Candidates" SET "FirstName" = "LastName" WHERE "Id" = @id""",
                connection);
            swap.Parameters.AddWithValue("id", candidate.Id);
            Assert.Equal(1, await swap.ExecuteNonQueryAsync());
        }

        var response = await client.GetAsync($"/api/candidates/{candidate.Id}");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.DoesNotContain(LastName, body, StringComparison.Ordinal);
        Assert.DoesNotContain(FirstName, body, StringComparison.Ordinal);
        Assert.DoesNotContain("ktl1.", body, StringComparison.Ordinal);
        var rendered = logs.Rendered();
        Assert.DoesNotContain(LastName, rendered, StringComparison.Ordinal);
        Assert.DoesNotMatch(Envelope, rendered);
    }

    [Fact]
    public async Task A_saved_search_term_is_ciphertext_in_the_database_and_plaintext_through_the_api()
    {
        await ResetAsync();
        using var factory = CreateFactory(null);
        using var client = factory.CreateClient();

        var created = await client.PostAsJsonAsync("/api/search-presets", new { name = "Perfil taller", filters = new { text = SearchTerm } });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var empty = await client.PostAsJsonAsync("/api/search-presets", new { name = "Sin texto", filters = new { text = "" } });
        Assert.Equal(HttpStatusCode.Created, empty.StatusCode);

        var listed = await client.GetStringAsync("/api/search-presets");
        Assert.Contains(SearchTerm, listed, StringComparison.Ordinal);
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("""SELECT "Name", "Filters"->>'text' FROM "ADM_SearchPresets" ORDER BY "Name" """, connection);
        await using var reader = await command.ExecuteReaderAsync();
        var stored = new Dictionary<string, string>(StringComparer.Ordinal);
        while (await reader.ReadAsync())
        {
            stored[reader.GetString(0)] = reader.GetString(1);
        }
        Assert.StartsWith("ktl1.", stored["Perfil taller"], StringComparison.Ordinal);
        Assert.Equal(string.Empty, stored["Sin texto"]);
    }

    private sealed record Created(Guid Id, uint Version);

    private static async Task<Created> CreateCandidateAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/candidates", new
        {
            firstName = FirstName,
            lastName = LastName,
            phone = Phone,
            email = Email,
            location = "Albacete",
            province = "Albacete",
            country = "España",
            source = "Referencia",
            notes = Notes,
            receivedAt = (string?)null,
            consentAt = (string?)null,
            reviewDueAt = (string?)null,
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var candidate = (await response.Content.ReadFromJsonAsync<CandidateResponse>())!;
        return new Created(candidate.Id, candidate.Version);
    }

    private async Task WriteRelatedDataAsync(HttpClient client, Created candidate)
    {
        var experience = await client.PutAsJsonAsync($"/api/candidates/{candidate.Id}/experience", new
        {
            experience = new[]
            {
                new CandidateExperienceInput(null, Company, "Soldadora", "Metal", $"<p><strong>{Functions}</strong></p><ul><li><em>{Functions}</em></li></ul>", null, null, 4, false, "Sin incidencias"),
            },
            version = candidate.Version,
        });
        Assert.Equal(HttpStatusCode.OK, experience.StatusCode);
        var note = await client.PostAsJsonAsync($"/api/candidates/{candidate.Id}/notes", new { body = NoteBody });
        Assert.Equal(HttpStatusCode.Created, note.StatusCode);
        var preset = await client.PostAsJsonAsync("/api/search-presets", new { name = "Perfil soldadura", filters = new { text = SearchTerm } });
        Assert.Equal(HttpStatusCode.Created, preset.StatusCode);

        // Documents and positions go through the same converters as their repositories; their
        // endpoints need a scanner and the token flow, which other suites already cover.
        await using var dbContext = NewDbContext();
        var documentId = Guid.CreateVersion7();
        var document = new CandidateDocument(documentId, candidate.Id, $"{candidate.Id:N}/{documentId:N}.bin", FileName, "application/pdf", 10, new string('a', 64), DateTimeOffset.UtcNow);
        document.SetDocumentType("cv");
        dbContext.Documents.Add(document);
        dbContext.Positions.Add(new Position(
            Guid.CreateVersion7(),
            "Soldador/a TIG",
            "<p>Puesto en taller</p>",
            "Albacete",
            SearchFilterDocument.Serialize(SearchFilterNormalization.Normalize(
                new SearchFiltersInput(SearchTerm, null, null, null, null, null, null, null, null),
                "Filters")),
            SearchFilterNormalization.FilterSchemaVersion,
            DateTimeOffset.UtcNow));
        await dbContext.SaveChangesAsync();
    }

    /// <summary>Every row of every application table, as text: what a data dump contains.</summary>
    private async Task<string> CopyEveryTableAsync()
    {
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        var tables = new List<string>();
        await using (var list = new NpgsqlCommand("SELECT tablename FROM pg_tables WHERE schemaname = 'public'", connection))
        await using (var reader = await list.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                tables.Add(reader.GetString(0));
            }
        }
        var copy = new StringBuilder();
        foreach (var table in tables)
        {
            using var export = await connection.BeginTextExportAsync($"COPY \"{table}\" TO STDOUT");
            copy.AppendLine(await export.ReadToEndAsync());
        }
        return copy.ToString();
    }

    private async Task ResetAsync()
    {
        await using var dbContext = NewDbContext();
        await DatabaseInitializer.MigrateAsync(dbContext, CancellationToken.None);
        await DatabaseInitializer.SeedCatalogsAsync(dbContext, CancellationToken.None);
        // A damaged row left by another test would make every text search fail closed.
        await dbContext.SearchPresets.ExecuteDeleteAsync();
        await dbContext.Positions.ExecuteDeleteAsync();
        await dbContext.CandidateNotes.ExecuteDeleteAsync();
        await dbContext.CandidateExperience.ExecuteDeleteAsync();
        await dbContext.Documents.ExecuteDeleteAsync();
        await dbContext.Candidates.ExecuteDeleteAsync();
        // Audit events record a stored user for an authenticated actor.
        if (!await dbContext.Users.AnyAsync(user => user.Id == EverythingActor.StoredUserId))
        {
            dbContext.Users.Add(new KeplerTalento.Domain.Identity.User(
                EverythingActor.StoredUserId,
                "security-evidence",
                "Security Evidence Actor",
                "security-evidence@example.test",
                "rrhh_admin",
                DateTimeOffset.UtcNow));
            await dbContext.SaveChangesAsync();
        }
    }

    private ApplicationDbContext NewDbContext() => new(
        new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(database.ConnectionString).UseTestFieldEncryption().Options);

    private WebApplicationFactory<Program> CreateFactory(ImportApiTests.CapturingLoggerProvider? logs)
    {
        Environment.SetEnvironmentVariable("ConnectionStrings__ApplicationDatabase", database.ConnectionString);
        Environment.SetEnvironmentVariable("DevelopmentActor__Enabled", "true");
        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["DevelopmentActor:Enabled"] = "true",
                    ["ConnectionStrings:ApplicationDatabase"] = database.ConnectionString,
                }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICurrentActor>();
                services.AddScoped<ICurrentActor>(_ => new EverythingActor());
                if (logs is not null)
                {
                    services.RemoveAll<ILoggerFactory>();
                    services.AddSingleton<ILoggerFactory>(_ => new Serilog.Extensions.Logging.SerilogLoggerFactory(
                        new Serilog.LoggerConfiguration()
                            .MinimumLevel.Verbose()
                            .Enrich.With<KeplerTalento.Web.Observability.PersonalDataRedactionEnricher>()
                            .WriteTo.Sink(new Capture(logs))
                            .CreateLogger(),
                        dispose: true));
                }
            });
        });
    }

    private sealed class Capture(ImportApiTests.CapturingLoggerProvider logs) : Serilog.Core.ILogEventSink
    {
        public void Emit(Serilog.Events.LogEvent logEvent)
        {
            var properties = string.Join(' ', logEvent.Properties.Select(property => $"{property.Key}={property.Value}"));
            logs.Add($"{logEvent.RenderMessage()} {properties} {logEvent.Exception}");
        }
    }

    private sealed class EverythingActor : ICurrentActor
    {
        public static readonly Guid StoredUserId = Guid.Parse("01932f00-0000-7000-8000-0000000ce033");
        public string? ExternalKey => "security-evidence";
        public Guid? UserId => StoredUserId;
        public bool IsAuthenticated => true;
        public bool HasPermission(string permission) => true;
    }
}
