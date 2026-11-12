using System.Net;
using System.Net.Http.Json;
using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Documents;
using KeplerTalento.Application.Features.Candidates;
using DocumentResponse = KeplerTalento.Application.Features.Documents.CandidateDocumentResponse;
using KeplerTalento.Domain.Auditing;
using KeplerTalento.Domain.Candidates;
using KeplerTalento.Domain.Catalogs;
using KeplerTalento.Domain.Identity;
using KeplerTalento.Infrastructure.Persistence;
using KeplerTalento.Infrastructure.Documents;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Xunit;

namespace KeplerTalento.Tests.IntegrationTests;

/// <summary>
/// Exercises the candidate slices through the real HTTP → Application → PostgreSQL path
/// against a disposable PostgreSQL instance.
/// </summary>
[Collection(WebHostCollection.Name)]
public sealed class CandidateApiTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Contact_validation_and_empty_centre_round_trip_without_partial_writes()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var create = new CreateCandidateCommand("Ana", "Perez", "", "", "", "", "", "", "", null, null, null);
        var response = await client.PostAsJsonAsync("/api/candidates", create);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var candidate = (await response.Content.ReadFromJsonAsync<CandidateResponse>())!;
        var refused = await client.PutAsJsonAsync($"/api/candidates/{candidate.Id}", new UpdateCandidateCommand(
            candidate.Id, "Changed", "Perez", "123-456-789", "bad", "", "", "", "", "", null, null, null, candidate.Version));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        var unchanged = (await client.GetFromJsonAsync<CandidateResponse>($"/api/candidates/{candidate.Id}"))!;
        Assert.Equal(candidate.Version, unchanged.Version);
        Assert.Equal("Ana", unchanged.FirstName);
        var education = await client.PutAsJsonAsync($"/api/candidates/{candidate.Id}/education", new
        {
            version = candidate.Version,
            education = new[] { new CandidateEducationInput(null, "Grado", "ADE", null, "   ", "Finalizada", 2020, null) },
        });
        Assert.Equal(HttpStatusCode.OK, education.StatusCode);
        var saved = (await education.Content.ReadFromJsonAsync<CandidateResponse>())!;
        Assert.Equal("", Assert.Single(saved.Education).Institution);
        var stale = await client.PutAsJsonAsync($"/api/candidates/{candidate.Id}/education", new
        {
            version = candidate.Version,
            education = saved.Education,
        });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        await using var deniedFactory = CreateFactory(TestActor.Reader);
        using var deniedClient = deniedFactory.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden, (await deniedClient.PostAsJsonAsync("/api/candidates", create with { Phone = "invalid" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await deniedClient.PutAsJsonAsync($"/api/candidates/{Guid.NewGuid()}/education", new { version = 0, education = Array.Empty<CandidateEducationInput>() })).StatusCode);
    }
    [Fact]
    public async Task Candidate_lifecycle_runs_through_http_application_and_postgresql()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();

        // create — with consent and retention metadata supplied
        var createResponse = await client.PostAsJsonAsync("/api/candidates", new
        {
            firstName = "Laura",
            lastName = "García",
            phone = "+34 600 100 200",
            email = "laura.garcia@example.invalid",
            location = "Madrid",
            province = "Madrid",
            country = "España",
            source = "LinkedIn",
            notes = "Perfil administrativo.",
            receivedAt = "2026-05-10",
            consentAt = "2026-05-11",
            reviewDueAt = "2027-05-10",
        });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var created = (await createResponse.Content.ReadFromJsonAsync<CandidateResponse>())!;
        Assert.True(created.IsActive);
        Assert.Equal("García", created.LastName);

        // read by identifier returns exactly what was submitted
        var read = (await client.GetFromJsonAsync<CandidateResponse>($"/api/candidates/{created.Id}"))!;
        Assert.Equal("Laura", read.FirstName);
        Assert.Equal("2026-05-10", read.ReceivedAt);
        Assert.Equal("2026-05-11", read.ConsentAt);
        Assert.Equal("2027-05-10", read.ReviewDueAt);
        Assert.Empty(read.Languages);

        // update — only the phone changes; metadata is not supplied
        var updateResponse = await client.PutAsJsonAsync($"/api/candidates/{created.Id}", new
        {
            firstName = "Laura",
            lastName = "García",
            phone = "+34 600 999 888",
            email = "laura.garcia@example.invalid",
            location = "Madrid",
            province = "Madrid",
            country = "España",
            source = "LinkedIn",
            notes = "Perfil administrativo.",
            version = read.Version,
        });
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        var updated = (await updateResponse.Content.ReadFromJsonAsync<CandidateResponse>())!;
        Assert.Equal("+34 600 999 888", updated.Phone);
        // The identifier and creation timestamp are untouched, and so is the metadata.
        // Both compared values come from storage: the create response carries the
        // in-memory instant, which PostgreSQL rounds to microseconds on the way in.
        Assert.Equal(created.Id, updated.Id);
        Assert.Equal(read.CreatedAt, updated.CreatedAt);
        Assert.Equal("2026-05-11", updated.ConsentAt);

        // relation write — resolved from catalog names, not identifiers
        var languagesResponse = await client.PutAsJsonAsync($"/api/candidates/{created.Id}/languages", new
        {
            languages = new[] { new { language = "Inglés", level = "B2", certification = "Cambridge" } },
            version = updated.Version,
        });
        Assert.Equal(HttpStatusCode.OK, languagesResponse.StatusCode);
        var withLanguage = (await languagesResponse.Content.ReadFromJsonAsync<CandidateResponse>())!;
        var language = Assert.Single(withLanguage.Languages);
        Assert.Equal("Inglés", language.Language);
        Assert.Equal("B2", language.Level);
        Assert.Equal("Cambridge", language.Certification);

        // logical delete
        var removeResponse = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/active",
            new { isActive = false, version = withLanguage.Version });
        Assert.Equal(HttpStatusCode.OK, removeResponse.StatusCode);
        var removed = (await removeResponse.Content.ReadFromJsonAsync<CandidateResponse>())!;
        Assert.False(removed.IsActive);

        // default list excludes it; read by identifier still returns it, intact
        var listed = (await client.GetFromJsonAsync<CandidateSummaryResponse[]>("/api/candidates"))!;
        Assert.DoesNotContain(listed, summary => summary.Id == created.Id);
        var withRemoved = (await client.GetFromJsonAsync<CandidateSummaryResponse[]>(
            "/api/candidates?includeInactive=true"))!;
        Assert.Contains(withRemoved, summary => summary.Id == created.Id && !summary.IsActive);
        var afterRemoval = (await client.GetFromJsonAsync<CandidateResponse>($"/api/candidates/{created.Id}"))!;
        Assert.Equal("Laura", afterRemoval.FirstName);
        Assert.Single(afterRemoval.Languages);

        // the row is preserved, with the moment of removal recorded
        var stored = await ReadAsync(created.Id);
        Assert.False(stored.IsActive);
        Assert.NotNull(stored.DeletedAtUtc);

        // restore
        var restoreResponse = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/active",
            new { isActive = true, version = afterRemoval.Version });
        Assert.Equal(HttpStatusCode.OK, restoreResponse.StatusCode);
        var restored = (await restoreResponse.Content.ReadFromJsonAsync<CandidateResponse>())!;
        Assert.True(restored.IsActive);
        Assert.Null((await ReadAsync(created.Id)).DeletedAtUtc);
        var listedAgain = (await client.GetFromJsonAsync<CandidateSummaryResponse[]>("/api/candidates"))!;
        Assert.Contains(listedAgain, summary => summary.Id == created.Id);
    }

    [Fact]
    public async Task A_concurrent_update_is_refused_with_a_stable_conflict_code()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");

        // Two actors read the same version; the first write wins.
        var first = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}",
            UpdatePayload("Ana", "Lopez", "+34 600 111 111", created.Version));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}",
            UpdatePayload("Ana", "Lopez", "+34 600 222 222", created.Version));

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        var body = await second.Content.ReadAsStringAsync();
        Assert.Contains(CandidateErrors.ConcurrencyConflict, body, StringComparison.Ordinal);
        // The first actor's values are what is stored.
        Assert.Equal("+34 600 111 111", (await ReadAsync(created.Id)).Phone);
    }

    [Fact]
    public async Task Concurrent_duplicate_skill_writes_store_one_relation_and_return_the_specific_spanish_error()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var firstClient = factory.CreateClient();
        using var secondClient = factory.CreateClient();
        var created = await CreateAsync(firstClient, "Ada", "Byron");
        var payload = new
        {
            skills = new[] { new { skill = "Compras", level = "Alto" } },
            version = created.Version,
        };

        var responses = await Task.WhenAll(
            firstClient.PutAsJsonAsync($"/api/candidates/{created.Id}/skills", payload),
            secondClient.PutAsJsonAsync($"/api/candidates/{created.Id}/skills", payload));

        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.OK);
        var refusal = Assert.Single(responses, response => response.StatusCode == HttpStatusCode.BadRequest);
        var refusalBody = await refusal.Content.ReadAsStringAsync();
        Assert.Contains(CandidateErrors.SkillDuplicate, refusalBody, StringComparison.Ordinal);
        Assert.Contains("El candidato ya tiene esta habilidad registrada.", refusalBody, StringComparison.Ordinal);
        await using var db = NewDbContext();
        Assert.Single(await db.CandidateSkills.AsNoTracking()
            .Where(skill => skill.CandidateId == created.Id)
            .ToListAsync());
    }

    [Fact]
    public async Task Removal_advances_the_token_so_a_stale_editor_conflicts_rather_than_resurrecting()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Bea", "Mora");

        await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/active",
            new { isActive = false, version = created.Version });

        var stale = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}",
            UpdatePayload("Bea", "Mora", "+34 600 333 333", created.Version));

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.False((await ReadAsync(created.Id)).IsActive);
    }

    [Fact]
    public async Task A_relation_naming_an_unknown_catalog_value_is_refused_and_creates_nothing()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Carla", "Gil");

        var response = await client.PutAsJsonAsync($"/api/candidates/{created.Id}/languages", new
        {
            languages = new[] { new { language = "Klingon", level = "B2" } },
            version = created.Version,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            CandidateErrors.CatalogValueUnknown,
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
        await using var dbContext = NewDbContext();
        Assert.False(await dbContext.CatalogItems.AnyAsync(item => item.NameEs == "Klingon"));
    }

    [Fact]
    public async Task Document_upload_round_trips_metadata_without_exposing_a_storage_location()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Noa", "Vidal");

        var response = await UploadAsync(client, created.Id, "cv.pdf", "%PDF-1.7\nsynthetic", true);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        var withDocument = (await client.GetFromJsonAsync<CandidateResponse>($"/api/candidates/{created.Id}"))!;
        var document = Assert.Single(withDocument.Documents);
        Assert.Equal("cv.pdf", document.OriginalFilename);
        Assert.True(document.IsPrimary);
        // The storage key exists in the database but must never reach the caller.
        var stored = await StoredDocumentKeyAsync(created.Id);
        Assert.NotEmpty(stored);
        Assert.DoesNotContain(stored, body, StringComparison.Ordinal);
        Assert.DoesNotContain("storageKey", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("candidates/", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Marking_a_second_uploaded_document_primary_demotes_the_first()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Eva", "Soler");

        var first = await UploadAsync(client, created.Id, "uno.pdf", "%PDF-1.7\none", true);
        var one = (await first.Content.ReadFromJsonAsync<DocumentResponse>())!;
        var second = await UploadAsync(client, created.Id, "dos.pdf", "%PDF-1.7\ntwo", false);
        var two = (await second.Content.ReadFromJsonAsync<DocumentResponse>())!;

        await using (var scanDb = NewDbContext())
        {
            var document = await scanDb.Documents.SingleAsync(value => value.Id == two.Id);
            document.MarkClean(null, DateTimeOffset.UtcNow);
            await scanDb.SaveChangesAsync();
        }

        // The primary flag moves from one document to the other in a single write. The
        // index enforcing "at most one primary" is not deferrable, so this is the case
        // that proves the ordered two-phase write.
        var swap = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/documents/{two.Id}/primary",
            new { });

        Assert.Equal(HttpStatusCode.OK, swap.StatusCode);
        var after = (await client.GetFromJsonAsync<DocumentResponse[]>(
            $"/api/candidates/{created.Id}/documents"))!;
        Assert.Single(after, document => document.IsPrimary);
        Assert.False(after.Single(document => document.Id == one.Id).IsPrimary);
        Assert.True(after.Single(document => document.Id == two.Id).IsPrimary);

        var removedKey = await StoredDocumentKeyByIdAsync(two.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(
            $"/api/candidates/{created.Id}/documents/{two.Id}")).StatusCode);
        var remaining = (await client.GetFromJsonAsync<DocumentResponse[]>(
            $"/api/candidates/{created.Id}/documents"))!;
        Assert.Single(remaining);
        Assert.DoesNotContain(remaining, document => document.IsPrimary);
        var storage = factory.Services.GetRequiredService<IDocumentStorage>();
        await Assert.ThrowsAsync<FileNotFoundException>(() =>
            storage.OpenQuarantineAsync(removedKey, CancellationToken.None));
        await using var auditDb = NewDbContext();
        Assert.True(await auditDb.AuditEvents.AnyAsync(audit => audit.EventType == "document.primary.changed"));
        Assert.True(await auditDb.AuditEvents.AnyAsync(audit => audit.EventType == "document.removed"));
    }

    [Theory]
    [InlineData("Pending")]
    [InlineData("Infected")]
    [InlineData("Rejected")]
    [InlineData("ScanFailed")]
    [InlineData("LegacyUnavailable")]
    public async Task Marking_an_unavailable_document_primary_is_refused(string state)
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Test", "Documents");
        var firstResponse = await UploadAsync(client, created.Id, "first.pdf", "%PDF-1.7\nfirst", true);
        var first = (await firstResponse.Content.ReadFromJsonAsync<DocumentResponse>())!;
        var secondResponse = await UploadAsync(client, created.Id, "second.pdf", "%PDF-1.7\nsecond", false);
        var second = (await secondResponse.Content.ReadFromJsonAsync<DocumentResponse>())!;
        await using (var db = NewDbContext())
        {
            var document = await db.Documents.SingleAsync(value => value.Id == second.Id);
            if (state == "LegacyUnavailable")
            {
                document.SetSourceKey("synthetic-document");
                db.Entry(document).Property(value => value.Sha256).CurrentValue = "";
                document.MarkClean(null, DateTimeOffset.UtcNow);
            }
            else if (state != "Pending")
            {
                document.MarkUnavailable(Enum.Parse<KeplerTalento.Domain.Documents.DocumentScanState>(state),
                    "synthetic.scan.failure", DateTimeOffset.UtcNow);
            }
            await db.SaveChangesAsync();
        }

        var response = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/documents/{second.Id}/primary", new { });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        using var problem = System.Text.Json.JsonDocument.Parse(body);
        Assert.Equal("document.not_available", problem.RootElement.GetProperty("code").GetString());
        Assert.DoesNotContain("storageKey", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("synthetic.scan.failure", body, StringComparison.Ordinal);
        Assert.DoesNotContain(await StoredDocumentKeyByIdAsync(second.Id), body, StringComparison.Ordinal);

        foreach (var actor in new[] { TestActor.Unauthenticated, TestActor.Reader })
        {
            await using var deniedFactory = CreateFactory(actor);
            using var deniedClient = deniedFactory.CreateClient();
            foreach (var id in new[] { second.Id, Guid.NewGuid() })
            {
                var denied = await deniedClient.PutAsJsonAsync(
                    $"/api/candidates/{created.Id}/documents/{id}/primary", new { });
                Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
                Assert.DoesNotContain("document.not_available", await denied.Content.ReadAsStringAsync(), StringComparison.Ordinal);
            }
        }

        await using var assertionDb = NewDbContext();
        var primary = Assert.Single(await assertionDb.Documents.AsNoTracking()
            .Where(value => value.CandidateId == created.Id && value.IsPrimary).ToListAsync());
        Assert.Equal(first.Id, primary.Id);
        Assert.False((await assertionDb.Documents.SingleAsync(value => value.Id == second.Id)).IsPrimary);
        Assert.False(await assertionDb.AuditEvents.AnyAsync(value => value.EventType == "document.primary.changed"));
    }

    [Fact]
    public async Task Concurrent_primary_designations_leave_exactly_one_primary_and_refuse_the_loser()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var firstClient = factory.CreateClient();
        var created = await CreateAsync(firstClient, "Hedy", "Lamarr");
        var firstUpload = await UploadAsync(firstClient, created.Id, "uno.pdf", "%PDF-1.7\none", false);
        var first = (await firstUpload.Content.ReadFromJsonAsync<DocumentResponse>())!;
        var secondUpload = await UploadAsync(firstClient, created.Id, "dos.pdf", "%PDF-1.7\ntwo", false);
        var second = (await secondUpload.Content.ReadFromJsonAsync<DocumentResponse>())!;

        var bothLoaded = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var loadedCount = 0;
        async Task<(bool Saved, string? Constraint)> DesignateAsync(Guid documentId)
        {
            await using var context = NewDbContext();
            await using var transaction = await context.Database.BeginTransactionAsync();
            var document = await context.Documents.SingleAsync(value => value.Id == documentId);
            document.SetPrimary(true, DateTimeOffset.UtcNow);
            if (Interlocked.Increment(ref loadedCount) == 2) bothLoaded.SetResult();
            await bothLoaded.Task;
            try
            {
                await context.SaveChangesAsync();
                await transaction.CommitAsync();
                return (true, null);
            }
            catch (DbUpdateException exception)
                when (exception.InnerException is PostgresException postgres
                      && postgres.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                await transaction.RollbackAsync();
                return (false, ((PostgresException)exception.InnerException).ConstraintName);
            }
        }

        var outcomes = await Task.WhenAll(DesignateAsync(first.Id), DesignateAsync(second.Id));

        Assert.Single(outcomes, outcome => outcome.Saved);
        var refusal = Assert.Single(outcomes, outcome => !outcome.Saved);
        Assert.Equal("UX_CND_Documents_CandidateId_Primary", refusal.Constraint);
        await using var db = NewDbContext();
        Assert.Single(await db.Documents.AsNoTracking()
            .Where(document => document.CandidateId == created.Id && document.IsPrimary)
            .ToListAsync());
    }

    [Fact]
    public async Task Every_candidate_capability_fails_closed_without_it()
    {
        await ResetAsync();
        await using var seedFactory = CreateFactory(TestActor.Full);
        using var seedClient = seedFactory.CreateClient();
        var created = await CreateAsync(seedClient, "Ana", "Lopez");

        foreach (var actor in new[] { TestActor.Unauthenticated, TestActor.None })
        {
            await using var factory = CreateFactory(actor);
            using var client = factory.CreateClient();

            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/candidates")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/candidates/{created.Id}")).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PostAsJsonAsync("/api/candidates", CreatePayload("X", "Y"))).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PutAsJsonAsync($"/api/candidates/{created.Id}", UpdatePayload("X", "Y", "", created.Version))).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PutAsJsonAsync($"/api/candidates/{created.Id}/active", new { isActive = false, version = created.Version })).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PutAsJsonAsync($"/api/candidates/{created.Id}/tags", new { tags = Array.Empty<object>(), version = 0 })).StatusCode);
            foreach (var target in new[] { created.Id, Guid.NewGuid() })
            {
                Assert.Equal(
                    HttpStatusCode.Forbidden,
                    (await client.PutAsJsonAsync($"/api/candidates/{target}/availability", ValidCheck(created.Version))).StatusCode);
                Assert.Equal(
                    HttpStatusCode.Forbidden,
                    (await client.PutAsJsonAsync($"/api/candidates/{target}/availability", InvalidCheck)).StatusCode);
                Assert.Equal(
                    HttpStatusCode.Forbidden,
                    (await client.PutAsync($"/api/candidates/{target}/availability", MalformedCheck())).StatusCode);
            }
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PostAsJsonAsync($"/api/candidates/{created.Id}/notes", new { body = "" })).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.GetAsync($"/api/candidates/{created.Id}/notes")).StatusCode);
            var noteId = Guid.NewGuid();
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PutAsJsonAsync(
                    $"/api/candidates/{created.Id}/notes/{noteId}",
                    new { body = "", version = 0 })).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PutAsJsonAsync(
                    $"/api/candidates/{created.Id}/notes/{noteId}/active",
                    new { isActive = false, version = 0 })).StatusCode);
        }
    }

    [Fact]
    public async Task An_actor_with_read_but_no_write_capability_cannot_change_anything()
    {
        await ResetAsync();
        await using var seedFactory = CreateFactory(TestActor.Full);
        using var seedClient = seedFactory.CreateClient();
        var created = await CreateAsync(seedClient, "Ana", "Lopez");

        await using var factory = CreateFactory(TestActor.Reader);
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/candidates/{created.Id}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("/api/candidates", CreatePayload("X", "Y"))).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PutAsJsonAsync($"/api/candidates/{created.Id}", UpdatePayload("X", "Y", "", created.Version))).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PutAsJsonAsync($"/api/candidates/{created.Id}/active", new { isActive = false, version = created.Version })).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PutAsJsonAsync($"/api/candidates/{created.Id}/tags", new { tags = Array.Empty<object>(), version = 0 })).StatusCode);
        // A reader is refused before validation and lookup: a valid body, an invalid one, an
        // existing candidate and a missing one all get the same answer (KTL-36 criterion 11).
        foreach (var target in new[] { created.Id, Guid.NewGuid() })
        {
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PutAsJsonAsync($"/api/candidates/{target}/availability", ValidCheck(created.Version))).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PutAsJsonAsync($"/api/candidates/{target}/availability", InvalidCheck)).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PutAsync($"/api/candidates/{target}/availability", MalformedCheck())).StatusCode);
        }
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync($"/api/candidates/{created.Id}/notes", new { body = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/candidates/{created.Id}/notes")).StatusCode);
        var noteId = Guid.NewGuid();
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PutAsJsonAsync(
                $"/api/candidates/{created.Id}/notes/{noteId}",
                new { body = "", version = 0 })).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PutAsJsonAsync(
                $"/api/candidates/{created.Id}/notes/{noteId}/active",
                new { isActive = false, version = 0 })).StatusCode);
        Assert.Equal("Ana", (await ReadAsync(created.Id)).FirstName);
        Assert.Equal(CandidateAvailabilityStates.Unknown, (await ReadAsync(created.Id)).AvailabilityState);
        await using var db = NewDbContext();
        Assert.Empty(await db.CandidateTags.Where(tag => tag.CandidateId == created.Id).ToListAsync());
        Assert.Empty(await db.CandidateNotes.Where(note => note.CandidateId == created.Id).ToListAsync());
    }

    [Fact]
    public async Task Adding_a_note_does_not_advance_the_candidate_version_or_block_its_edit()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");

        var noteResponse = await client.PostAsJsonAsync(
            $"/api/candidates/{created.Id}/notes",
            new { body = "Seguimiento privado" });
        Assert.Equal(HttpStatusCode.Created, noteResponse.StatusCode);
        var note = (await noteResponse.Content.ReadFromJsonAsync<CandidateNoteResponse>())!;
        Assert.Equal(TestActor.StoredUserId, note.AuthorUserId);
        Assert.Equal("Integration Candidate Actor", note.AuthorDisplayName);

        var update = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}",
            UpdatePayload("Ana", "Lopez", "", created.Version));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        await using var db = NewDbContext();
        var stored = await db.CandidateNotes.AsNoTracking().SingleAsync(value => value.Id == note.Id);
        Assert.Equal(TestActor.StoredUserId, stored.AuthorUserId);
        Assert.Equal("Seguimiento privado", stored.Body);
    }

    [Fact]
    public async Task Candidate_tags_can_be_resubmitted_after_the_catalog_value_is_deactivated()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");
        var assignedResponse = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/tags",
            new { tags = new[] { new { tag = "Recontratable" } }, version = created.Version });
        Assert.Equal(HttpStatusCode.OK, assignedResponse.StatusCode);
        var assigned = (await assignedResponse.Content.ReadFromJsonAsync<CandidateResponse>())!;

        await using (var db = NewDbContext())
        {
            var tag = await db.CatalogItems.SingleAsync(item =>
                item.Family == CatalogFamilies.Tag && item.NameEs == "Recontratable");
            tag.SetActive(false, DateTimeOffset.UtcNow);
            await db.SaveChangesAsync();
        }

        var resubmitted = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/tags",
            new { tags = assigned.Tags, version = assigned.Version });
        Assert.Equal(HttpStatusCode.OK, resubmitted.StatusCode);
        Assert.Single((await resubmitted.Content.ReadFromJsonAsync<CandidateResponse>())!.Tags);
    }

    [Fact]
    public async Task Document_upload_and_download_require_their_specific_capabilities()
    {
        await ResetAsync();
        await using var fullFactory = CreateFactory(TestActor.Full);
        using var fullClient = fullFactory.CreateClient();
        var candidate = await CreateAsync(fullClient, "Ada", "Lovelace");
        var accepted = await UploadAsync(fullClient, candidate.Id, "cv.pdf", "%PDF-1.7\nsecure", false);
        var document = (await accepted.Content.ReadFromJsonAsync<DocumentResponse>())!;

        foreach (var actor in new[] { TestActor.Unauthenticated, TestActor.Reader })
        {
            await using var factory = CreateFactory(actor);
            using var client = factory.CreateClient();
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await UploadAsync(client, candidate.Id, "other.pdf", "%PDF-1.7\nother", false)).StatusCode);
            // Refused before validation: a request with no file gets the same answer (KTL-42).
            using var noFile = new MultipartFormDataContent();
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await client.PostAsync($"/api/candidates/{candidate.Id}/documents", noFile)).StatusCode);
            var existing = await client.GetAsync($"/api/candidates/{candidate.Id}/documents/{document.Id}/content");
            var missing = await client.GetAsync($"/api/candidates/{candidate.Id}/documents/{Guid.NewGuid()}/content");
            Assert.Equal(HttpStatusCode.NotFound, existing.StatusCode);
            Assert.Equal(existing.StatusCode, missing.StatusCode);
        }

        await using var downloadFactory = CreateFactory(TestActor.DownloadOnly);
        using var downloadClient = downloadFactory.CreateClient();
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await UploadAsync(downloadClient, candidate.Id, "download-only.pdf", "%PDF-1.7\nother", false)).StatusCode);

        await using var uploadFactory = CreateFactory(TestActor.UploadOnly);
        using var uploadClient = uploadFactory.CreateClient();
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await uploadClient.GetAsync($"/api/candidates/{candidate.Id}/documents/{document.Id}/content")).StatusCode);

        await using var db = NewDbContext();
        var stored = Assert.Single(await db.Documents.AsNoTracking()
            .Where(value => value.CandidateId == candidate.Id).ToListAsync());
        Assert.Equal(document.Id, stored.Id);
    }

    [Fact]
    public async Task Refused_upload_leaves_no_row_object_operation_or_applied_audit()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var candidate = await CreateAsync(client, "Grace", "Hopper");
        var inventory = factory.Services.GetRequiredService<IDocumentStorageInventory>();
        var beforeQuarantine = (await inventory.ListQuarantineAsync(CancellationToken.None)).Count;
        var beforeAvailable = (await inventory.ListAvailableAsync(CancellationToken.None)).Count;

        var refusal = await UploadAsync(client, candidate.Id, "cv.pdf", "MZ executable", false);

        Assert.Equal(HttpStatusCode.BadRequest, refusal.StatusCode);
        await using var db = NewDbContext();
        Assert.False(await db.Documents.AnyAsync(document => document.CandidateId == candidate.Id));
        Assert.False(await db.Operations.AnyAsync());
        Assert.False(await db.AuditEvents.AnyAsync(audit => audit.EventType == "document.upload.accepted"));
        Assert.Equal(beforeQuarantine, (await inventory.ListQuarantineAsync(CancellationToken.None)).Count);
        Assert.Equal(beforeAvailable, (await inventory.ListAvailableAsync(CancellationToken.None)).Count);
    }

    [Fact]
    public async Task Empty_missing_unsupported_and_oversized_uploads_are_refused_without_rows()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var candidate = await CreateAsync(client, "Margaret", "Hamilton");

        using var missing = new MultipartFormDataContent();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(
            $"/api/candidates/{candidate.Id}/documents", missing)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await UploadBytesAsync(
            client, candidate.Id, "empty.pdf", [], false)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await UploadBytesAsync(
            client, candidate.Id, "payload.svg", "<svg/>"u8.ToArray(), false)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await UploadBytesAsync(
            client,
            candidate.Id,
            "large.pdf",
            new byte[DocumentStorageOptions.AbsoluteMaximumBytes + 1],
            false)).StatusCode);

        await using var db = NewDbContext();
        Assert.False(await db.Documents.AnyAsync(document => document.CandidateId == candidate.Id));
        Assert.False(await db.Operations.AnyAsync());
    }

    [Fact]
    public async Task Clean_document_download_streams_exact_bytes_with_private_headers_and_audit()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var candidate = await CreateAsync(client, "Katherine", "Johnson");
        const string bytes = "%PDF-1.7\nbyte-for-byte";
        var accepted = await UploadAsync(client, candidate.Id, "../cv.pdf", bytes, true);
        var document = (await accepted.Content.ReadFromJsonAsync<DocumentResponse>())!;

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var operation = await db.Operations.AsNoTracking().SingleAsync();
            var handler = scope.ServiceProvider.GetRequiredService<ScanOperationHandler>();
            Assert.True((await handler.HandleAsync(operation, CancellationToken.None)).Completed);
        }

        var response = await client.GetAsync($"/api/candidates/{candidate.Id}/documents/{document.Id}/content");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(bytes, await response.Content.ReadAsStringAsync());
        Assert.True(response.Headers.CacheControl?.Private);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Contains("attachment", response.Content.Headers.ContentDisposition?.ToString());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.DoesNotContain("../", response.Content.Headers.ContentDisposition?.ToString(), StringComparison.Ordinal);
        await using var auditDb = NewDbContext();
        var downloaded = await auditDb.AuditEvents.SingleAsync(audit => audit.EventType == "document.downloaded");
        Assert.Equal(AuditActor.User(TestActor.StoredUserId), downloaded.Actor);
        Assert.Equal($"candidate:{candidate.Id:N};document:{document.Id:N}", downloaded.SubjectId);
        Assert.DoesNotContain("cv.pdf", downloaded.OutcomeCode ?? string.Empty, StringComparison.Ordinal);
        Assert.DoesNotContain("integration-actor", downloaded.OutcomeCode ?? string.Empty, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Infected_upload_never_becomes_downloadable_and_is_audited_without_content()
    {
        await ResetAsync();
        const string eicar = "EICAR-style synthetic marker for a deterministic fake scanner";
        await using var factory = CreateFactory(
            TestActor.Full,
            new FakeMalwareScanner(new ScanResult(ScanVerdict.Infected, "scanner.infected", "Eicar-Test-Signature")));
        using var client = factory.CreateClient();
        var candidate = await CreateAsync(client, "Dorothy", "Vaughan");
        var accepted = await UploadAsync(client, candidate.Id, "cv.txt", eicar, false);
        var document = (await accepted.Content.ReadFromJsonAsync<DocumentResponse>())!;

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var operation = await db.Operations.AsNoTracking().SingleAsync();
            var outcome = await scope.ServiceProvider.GetRequiredService<ScanOperationHandler>()
                .HandleAsync(operation, CancellationToken.None);
            Assert.True(outcome.Completed);
        }

        var state = await client.GetFromJsonAsync<DocumentResponse>(
            $"/api/candidates/{candidate.Id}/documents/{document.Id}");
        Assert.Equal("Refused", state!.AvailabilityState);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(
            $"/api/candidates/{candidate.Id}/documents/{document.Id}/content")).StatusCode);
        await using var auditDb = NewDbContext();
        var audit = await auditDb.AuditEvents.SingleAsync(value => value.EventType == "document.scan");
        Assert.Contains("scanner.infected", audit.OutcomeCode, StringComparison.Ordinal);
        // The scanner is background work with no person behind it.
        Assert.Equal(AuditActor.System, audit.Actor);
        Assert.DoesNotContain(eicar, audit.OutcomeCode, StringComparison.Ordinal);
        Assert.DoesNotContain("cv.txt", audit.OutcomeCode, StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_actor_who_may_update_may_not_remove()
    {
        await ResetAsync();
        await using var seedFactory = CreateFactory(TestActor.Full);
        using var seedClient = seedFactory.CreateClient();
        var created = await CreateAsync(seedClient, "Ana", "Lopez");

        await using var factory = CreateFactory(TestActor.Editor);
        using var client = factory.CreateClient();

        var refusal = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/active",
            new { isActive = false, version = created.Version });

        Assert.Equal(HttpStatusCode.Forbidden, refusal.StatusCode);
        Assert.True((await ReadAsync(created.Id)).IsActive);
    }

    [Fact]
    public async Task A_refusal_does_not_disclose_whether_the_candidate_exists()
    {
        await ResetAsync();
        await using var seedFactory = CreateFactory(TestActor.Full);
        using var seedClient = seedFactory.CreateClient();
        var created = await CreateAsync(seedClient, "Ana", "Lopez");

        await using var factory = CreateFactory(TestActor.None);
        using var client = factory.CreateClient();

        var forExisting = await client.GetAsync($"/api/candidates/{created.Id}");
        var forMissing = await client.GetAsync($"/api/candidates/{Guid.NewGuid()}");

        Assert.Equal(forExisting.StatusCode, forMissing.StatusCode);
        var existingBody = Scrub(await forExisting.Content.ReadAsStringAsync());
        var missingBody = Scrub(await forMissing.Content.ReadAsStringAsync());
        Assert.Equal(existingBody, missingBody);
        Assert.DoesNotContain("Ana", existingBody, StringComparison.Ordinal);
    }

    [Fact]
    public async Task There_is_no_delete_verb_for_candidate_aggregate_routes()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");

        foreach (var route in new[]
        {
            "/api/candidates",
            $"/api/candidates/{created.Id}",
            $"/api/candidates/{created.Id}/languages",
        })
        {
            var response = await client.DeleteAsync(route);
            Assert.True(
                response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed,
                $"DELETE {route} answered {response.StatusCode}; no candidate route may accept it.");
        }
        // Nothing was destroyed.
        Assert.Equal("Ana", (await ReadAsync(created.Id)).FirstName);
    }

    [Fact]
    public async Task The_runtime_role_cannot_delete_from_the_candidate_tables()
    {
        await ResetAsync();

        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();

        // "No physical delete" is enforced by PostgreSQL, not only by the absence of a
        // verb: even a defect in the application cannot destroy a candidate.
        await using (var command = new NpgsqlCommand(
            "SELECT has_table_privilege('ktl_runtime', '\"CND_Candidates\"', 'DELETE')",
            connection))
        {
            Assert.False((bool)(await command.ExecuteScalarAsync())!);
        }

        // Nothing in the candidate group may be truncated, relations and documents
        // included — those keep DELETE because replacing a collection really does remove
        // rows, but wholesale destruction is never a legitimate operation.
        foreach (var table in new[]
        {
            "CND_Candidates",
            "CND_CandidateLanguages",
            "CND_CandidatePrograms",
            "CND_CandidateEducation",
            "CND_CandidateExperience",
            "CND_CandidateSkills",
            "CND_Documents",
        })
        {
            await using var command = new NpgsqlCommand(
                $"SELECT has_table_privilege('ktl_runtime', '\"{table}\"', 'TRUNCATE')",
                connection);
            Assert.False((bool)(await command.ExecuteScalarAsync())!, $"ktl_runtime may TRUNCATE {table}.");
        }
    }

    // ---- KTL-36: availability checks ----

    private static string Today => DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");

    private static object ValidCheck(uint version) =>
        new { state = "available", checkedOn = Today, until = (string?)null, version };

    /// <summary>Not JSON at all, so a framework binder would fail before any permission check.</summary>
    private static StringContent MalformedCheck() =>
        new("{ \"state\": \"available\", ", System.Text.Encoding.UTF8, "application/json");

    [Fact]
    public async Task A_malformed_availability_body_from_an_authorized_caller_is_a_validation_problem()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");

        var response = await client.PutAsync($"/api/candidates/{created.Id}/availability", MalformedCheck());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(CandidateErrors.AvailabilityInvalid, await ProblemCodeAsync(response));
        Assert.Equal(CandidateAvailabilityStates.Unknown, (await ReadAsync(created.Id)).AvailabilityState);
    }

    private static readonly object InvalidCheck = new { state = "archived", checkedOn = "mañana", until = "nunca", version = 0 };

    private static async Task<CandidateResponse> CheckAsync(
        HttpClient client,
        Guid id,
        string state,
        string? checkedOn,
        string? until,
        uint version)
    {
        var response = await client.PutAsJsonAsync($"/api/candidates/{id}/availability", new { state, checkedOn, until, version });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<CandidateResponse>())!;
    }

    private static async Task<string> ProblemCodeAsync(HttpResponseMessage response)
    {
        using var document = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        if (root.TryGetProperty("errors", out var errors) && errors.ValueKind == System.Text.Json.JsonValueKind.Array)
        {
            return string.Join(",", errors.EnumerateArray().Select(error => error.GetProperty("code").GetString()));
        }
        return root.GetProperty("code").GetString() ?? string.Empty;
    }

    [Fact]
    public async Task No_candidate_response_carries_a_status_or_a_free_text_availability()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");

        foreach (var route in new[] { $"/api/candidates/{created.Id}", "/api/candidates" })
        {
            var body = await client.GetStringAsync(route);
            Assert.DoesNotContain("\"status\"", body, StringComparison.Ordinal);
            Assert.Contains("\"availability\":{\"state\":\"unknown\",\"checkedOn\":\"\",\"until\":\"\",\"checkedByDisplayName\":null}", body, StringComparison.Ordinal);
        }
        var search = await (await client.PostAsJsonAsync("/api/candidates/search", new { filters = new { } })).Content.ReadAsStringAsync();
        Assert.DoesNotContain("\"status\"", search, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_check_is_recorded_with_its_checker_display_name_and_an_audit_event_without_values()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");

        var response = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/availability",
            new { state = "unavailable", checkedOn = Today, until = "2027-01-15", version = created.Version });
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var checkedCandidate = System.Text.Json.JsonSerializer.Deserialize<CandidateResponse>(body, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;

        Assert.Equal(new CandidateAvailabilityResponse("unavailable", Today, "2027-01-15", "Integration Candidate Actor"), checkedCandidate.Availability);
        Assert.NotEqual(created.Version, checkedCandidate.Version);
        // The checker is a display name, never a user id.
        Assert.DoesNotContain(TestActor.StoredUserId.ToString(), body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("checkedByUserId", body, StringComparison.OrdinalIgnoreCase);
        var read = await client.GetStringAsync($"/api/candidates/{created.Id}");
        Assert.Contains("\"checkedByDisplayName\":\"Integration Candidate Actor\"", read, StringComparison.Ordinal);
        Assert.DoesNotContain(TestActor.StoredUserId.ToString(), read, StringComparison.OrdinalIgnoreCase);

        await using var db = NewDbContext();
        var audit = await db.AuditEvents.AsNoTracking()
            .SingleAsync(item => item.EventType == CandidateAuditEvents.AvailabilityChecked);
        Assert.Equal(created.Id.ToString("N"), audit.SubjectId);
        Assert.Equal(TestActor.StoredUserId, audit.ActorUserId);
        var stored = await ReadAsync(created.Id);
        Assert.Equal(TestActor.StoredUserId, stored.AvailabilityCheckedByUserId);
    }

    [Fact]
    public async Task Reconfirming_advances_the_version_and_undo_restores_the_previous_date()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");
        var first = await CheckAsync(client, created.Id, "available", "2026-03-12", null, created.Version);

        // «Sigue igual»: the stored value again, with today's date.
        var reconfirmed = await CheckAsync(client, created.Id, "available", Today, null, first.Version);
        Assert.Equal("available", reconfirmed.Availability.State);
        Assert.Equal(Today, reconfirmed.Availability.CheckedOn);
        Assert.NotEqual(first.Version, reconfirmed.Version);

        // «Deshacer»: the previous check resubmitted.
        var undone = await CheckAsync(client, created.Id, "available", "2026-03-12", null, reconfirmed.Version);
        Assert.Equal("2026-03-12", undone.Availability.CheckedOn);
        Assert.Equal(3, await AuditCountAsync(CandidateAuditEvents.AvailabilityChecked));
    }

    [Fact]
    public async Task An_earlier_check_date_amends_and_a_reset_clears_dates_and_checker()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");
        var today = await CheckAsync(client, created.Id, "available", Today, null, created.Version);

        var amended = await CheckAsync(client, created.Id, "available", "2026-03-10", null, today.Version);
        Assert.Equal("2026-03-10", amended.Availability.CheckedOn);

        var reset = await CheckAsync(client, created.Id, "unknown", null, null, amended.Version);
        Assert.Equal(new CandidateAvailabilityResponse("unknown", "", "", null), reset.Availability);
        var stored = await ReadAsync(created.Id);
        Assert.Null(stored.AvailabilityCheckedOn);
        Assert.Null(stored.AvailabilityCheckedByUserId);
    }

    public static TheoryData<string, string?, string?, string> RefusedChecks() => new()
    {
        { "available", DateOnly.FromDateTime(DateTime.UtcNow).AddDays(2).ToString("yyyy-MM-dd"), null, CandidateErrors.AvailabilityCheckedOnInvalid },
        { "available", "2026-03-12", "2027-01-15", CandidateErrors.AvailabilityUntilInvalid },
        { "unknown", null, "2027-01-15", CandidateErrors.AvailabilityUntilInvalid },
        { "unavailable", "2026-03-12", "2026-03-01", CandidateErrors.AvailabilityUntilInvalid },
        { "hired", "2026-03-12", null, CandidateErrors.AvailabilityInvalid },
    };

    [Theory]
    [MemberData(nameof(RefusedChecks))]
    public async Task An_invalid_check_is_refused_with_its_code_and_nothing_changes(
        string state,
        string? checkedOn,
        string? until,
        string code)
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");
        var stored = await CheckAsync(client, created.Id, "available", "2026-03-12", null, created.Version);

        var response = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/availability",
            new { state, checkedOn, until, version = stored.Version });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(code, await ProblemCodeAsync(response), StringComparison.Ordinal);
        var after = await ReadAsync(created.Id);
        Assert.Equal("available", after.AvailabilityState);
        Assert.Equal(new DateOnly(2026, 3, 12), after.AvailabilityCheckedOn);
        Assert.Equal(1, await AuditCountAsync(CandidateAuditEvents.AvailabilityChecked));
    }

    [Fact]
    public async Task A_check_on_a_removed_candidate_or_with_a_stale_version_is_refused()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");
        var checkedOnce = await CheckAsync(client, created.Id, "available", Today, null, created.Version);

        var stale = await client.PutAsJsonAsync($"/api/candidates/{created.Id}/availability", ValidCheck(created.Version));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(CandidateErrors.ConcurrencyConflict, await ProblemCodeAsync(stale));

        var removedResponse = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}/active",
            new { isActive = false, version = checkedOnce.Version });
        var removed = (await removedResponse.Content.ReadFromJsonAsync<CandidateResponse>())!;
        var refused = await client.PutAsJsonAsync($"/api/candidates/{created.Id}/availability", ValidCheck(removed.Version));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal(CandidateErrors.RemovedCandidate, await ProblemCodeAsync(refused));
        Assert.Equal(1, await AuditCountAsync(CandidateAuditEvents.AvailabilityChecked));
    }

    [Fact]
    public async Task The_general_update_saves_with_the_version_a_check_returned_and_leaves_the_check_alone()
    {
        await ResetAsync();
        await using var factory = CreateFactory(TestActor.Full);
        using var client = factory.CreateClient();
        var created = await CreateAsync(client, "Ana", "Lopez");
        var checkedCandidate = await CheckAsync(client, created.Id, "unavailable", "2026-03-12", "2027-01-15", created.Version);

        // Criterion 13: the page adopts the returned version, so its next edit is not a conflict.
        var update = await client.PutAsJsonAsync(
            $"/api/candidates/{created.Id}",
            UpdatePayload("Ana", "Lopez", "+34 600 000 000", checkedCandidate.Version));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = (await update.Content.ReadFromJsonAsync<CandidateResponse>())!;

        // Criterion 14: the general update never touches the check.
        Assert.Equal(checkedCandidate.Availability, updated.Availability);
        var stored = await ReadAsync(created.Id);
        Assert.Equal(TestActor.StoredUserId, stored.AvailabilityCheckedByUserId);
        Assert.Equal(1, await AuditCountAsync(CandidateAuditEvents.Updated));
        Assert.Equal(0, await AuditCountAsync(CandidateAuditEvents.StatusChanged));
    }

    private async Task<int> AuditCountAsync(string eventType)
    {
        await using var db = NewDbContext();
        return await db.AuditEvents.CountAsync(item => item.EventType == eventType);
    }

    private static object CreatePayload(string firstName, string lastName) => new
    {
        firstName,
        lastName,
        phone = "",
        email = "",
        location = "",
        province = "",
        country = "España",
        source = "Email",
        notes = "",
        receivedAt = (string?)null,
        consentAt = (string?)null,
        reviewDueAt = (string?)null,
    };

    private static object UpdatePayload(string firstName, string lastName, string phone, uint version) => new
    {
        firstName,
        lastName,
        phone,
        email = "",
        location = "",
        province = "",
        country = "España",
        source = "Email",
        notes = "",
        version,
    };

    private static async Task<CandidateResponse> CreateAsync(HttpClient client, string firstName, string lastName)
    {
        var response = await client.PostAsJsonAsync("/api/candidates", CreatePayload(firstName, lastName));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CandidateResponse>())!;
    }

    private static Task<HttpResponseMessage> UploadAsync(
        HttpClient client,
        Guid candidateId,
        string fileName,
        string content,
        bool isPrimary)
    {
        return UploadBytesAsync(client, candidateId, fileName, System.Text.Encoding.UTF8.GetBytes(content), isPrimary);
    }

    private static Task<HttpResponseMessage> UploadBytesAsync(
        HttpClient client,
        Guid candidateId,
        string fileName,
        byte[] content,
        bool isPrimary)
    {
        var multipart = new MultipartFormDataContent();
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
        multipart.Add(file, "file", fileName);
        multipart.Add(new StringContent("CV"), "documentType");
        multipart.Add(new StringContent(isPrimary.ToString()), "isPrimary");
        return client.PostAsync($"/api/candidates/{candidateId}/documents", multipart);
    }

    /// <summary>
    /// Removes the parts that differ by design rather than by disclosure: the per-request
    /// correlation identifier, and the requested path, which echoes back an identifier the
    /// caller supplied and therefore already knows.
    /// </summary>
    private static string Scrub(string body) =>
        System.Text.RegularExpressions.Regex.Replace(
            System.Text.RegularExpressions.Regex.Replace(
                System.Text.RegularExpressions.Regex.Replace(
                    body, "\"correlationId\":\"[^\"]*\"", "\"correlationId\":\"*\""),
                "\"traceId\":\"[^\"]*\"",
                "\"traceId\":\"*\""),
            "/api/candidates/[0-9a-fA-F-]+",
            "/api/candidates/*");

    private async Task ResetAsync()
    {
        await using var dbContext = NewDbContext();
        await DatabaseInitializer.MigrateAsync(dbContext, CancellationToken.None);
        await dbContext.Documents.ExecuteDeleteAsync();
        await dbContext.Operations.ExecuteDeleteAsync();
        await dbContext.CandidateNotes.ExecuteDeleteAsync();
        await dbContext.CandidateTags.ExecuteDeleteAsync();
        await dbContext.CandidateLanguages.ExecuteDeleteAsync();
        await dbContext.CandidatePrograms.ExecuteDeleteAsync();
        await dbContext.CandidateEducation.ExecuteDeleteAsync();
        await dbContext.CandidateExperience.ExecuteDeleteAsync();
        await dbContext.CandidateSkills.ExecuteDeleteAsync();
        await dbContext.Candidates.ExecuteDeleteAsync();
        await dbContext.AuditEvents.ExecuteDeleteAsync();
        await DatabaseInitializer.SeedCatalogsAsync(dbContext, CancellationToken.None);
        if (!await dbContext.Users.AnyAsync(user => user.Id == TestActor.StoredUserId))
        {
            dbContext.Users.Add(new User(
                TestActor.StoredUserId,
                "candidate-integration-actor",
                "Integration Candidate Actor",
                "candidate-integration@example.test",
                "rrhh_admin",
                DateTimeOffset.UtcNow));
            await dbContext.SaveChangesAsync();
        }
    }

    private async Task<Candidate> ReadAsync(Guid id)
    {
        await using var dbContext = NewDbContext();
        return await dbContext.Candidates.AsNoTracking().SingleAsync(candidate => candidate.Id == id);
    }

    private async Task<string> StoredDocumentKeyAsync(Guid candidateId)
    {
        await using var dbContext = NewDbContext();
        return await dbContext.Documents.AsNoTracking()
            .Where(document => document.CandidateId == candidateId)
            .Select(document => document.StorageKey)
            .FirstAsync();
    }

    private async Task<string> StoredDocumentKeyByIdAsync(Guid documentId)
    {
        await using var dbContext = NewDbContext();
        return await dbContext.Documents.AsNoTracking()
            .Where(document => document.Id == documentId)
            .Select(document => document.StorageKey)
            .SingleAsync();
    }

    private ApplicationDbContext NewDbContext() => new(
        new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(database.ConnectionString).UseTestFieldEncryption().Options);

    private WebApplicationFactory<Program> CreateFactory(ICurrentActor actor, IMalwareScanner? scanner = null)
    {
        Environment.SetEnvironmentVariable(
            "ConnectionStrings__ApplicationDatabase",
            database.ConnectionString);
        // Program selects DevelopmentActor vs token identity while composing services, before
        // WebApplicationFactory's in-memory override is applied.
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
                services.AddScoped(_ => actor);
                services.RemoveAll<IMalwareScanner>();
                services.AddSingleton<IMalwareScanner>(scanner ?? new FakeMalwareScanner());
            });
        });
    }

    private sealed class TestActor(bool authenticated, params string[] permissions) : ICurrentActor
    {
        public static TestActor Full => new(
            true,
            Permissions.CandidatesRead,
            Permissions.CandidatesCreate,
            Permissions.CandidatesUpdate,
            Permissions.CandidatesDelete,
            Permissions.DocumentsUpload,
            Permissions.DocumentsDownload);

        public static TestActor Reader => new(true, Permissions.CandidatesRead);
        public static TestActor DownloadOnly => new(true, Permissions.DocumentsDownload);
        public static TestActor UploadOnly => new(true, Permissions.DocumentsUpload);

        /// <summary>May read and update, but not remove.</summary>
        public static TestActor Editor => new(true, Permissions.CandidatesRead, Permissions.CandidatesUpdate);

        /// <summary>Authenticated, but holds no candidate capability at all.</summary>
        public static TestActor None => new(true);

        public static TestActor Unauthenticated => new(false);

        public string? ExternalKey => authenticated ? "integration-actor" : null;

        /// <summary>The internal user id audit events name. No row is needed: the audit table has no foreign key.</summary>
        public static readonly Guid StoredUserId = Guid.Parse("01932f00-0000-7000-8000-00000000c001");

        public Guid? UserId => authenticated ? StoredUserId : null;

        public bool IsAuthenticated => authenticated;
        public bool HasPermission(string permission) =>
            authenticated && permissions.Contains(permission, StringComparer.Ordinal);
    }
}
