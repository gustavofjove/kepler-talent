using KeplerTalento.Domain.Candidates;
using KeplerTalento.Domain.Catalogs;
using KeplerTalento.Domain.Documents;
using KeplerTalento.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace KeplerTalento.Tests.IntegrationTests;

/// <summary>
/// Database-level evidence for the candidate persistence contract. Every assertion here
/// is about what PostgreSQL itself enforces, so the invariants hold for the migration
/// tool and for any future write slice alike — not only for callers that remember them.
/// </summary>
public sealed class CandidateSchemaTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private DbContextOptions<ApplicationDbContext> Options =>
        new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(database.ConnectionString).UseTestFieldEncryption().Options;

    private ApplicationDbContext NewContext() => new(Options);

    [Fact]
    public async Task Empty_education_centre_round_trips_as_encrypted_non_null_text()
    {
        var catalog = await PrepareAsync();
        var candidateId = Guid.CreateVersion7();
        var educationId = Guid.CreateVersion7();
        await using (var write = NewContext())
        {
            write.Candidates.Add(NewCandidate(candidateId, DateTimeOffset.UtcNow));
            write.CandidateEducation.Add(new CandidateEducation(educationId, candidateId,
                catalog.First(CatalogFamilies.EducationType), catalog.First(CatalogFamilies.EducationStatus),
                "ADE", "   "));
            await write.SaveChangesAsync();
        }
        await using var read = NewContext();
        Assert.Equal("", (await read.CandidateEducation.SingleAsync(e => e.Id == educationId)).Institution);
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT \"Institution\" FROM \"CND_CandidateEducation\" WHERE \"Id\" = @id", connection);
        command.Parameters.AddWithValue("id", educationId);
        Assert.StartsWith("ktl1.", Assert.IsType<string>(await command.ExecuteScalarAsync()));
    }

    private async Task<CatalogLookup> PrepareAsync()
    {
        await using var setup = NewContext();
        await DatabaseInitializer.MigrateAsync(setup, CancellationToken.None);
        await DatabaseInitializer.SeedCatalogsAsync(setup, CancellationToken.None);
        var items = await setup.CatalogItems.AsNoTracking().ToListAsync();
        return new CatalogLookup(items);
    }

    private sealed class CatalogLookup(IReadOnlyList<CatalogItem> items)
    {
        public Guid First(string family) =>
            items.First(item => string.Equals(item.Family, family, StringComparison.Ordinal)).Id;
    }

    private static Candidate NewCandidate(Guid id, DateTimeOffset now)
    {
        var candidate = new Candidate(id, "Prueba", "Sintética", now);
        candidate.SetDetails(
            phone: "+34 600 111 222",
            email: "prueba.sintetica@example.invalid",
            location: "Ciudad Sintética",
            province: "Provincia Sintética",
            country: "España",
            source: "Prueba",
            notes: "Notas sintéticas",
            updatedAtUtc: now);
        candidate.SetConsent(
            new DateOnly(2026, 2, 1),
            new DateOnly(2026, 2, 2),
            new DateOnly(2028, 2, 2),
            now);
        return candidate;
    }

    private static string? ConstraintOf(DbUpdateException exception) =>
        (exception.InnerException as PostgresException)?.ConstraintName;

    [Fact]
    public async Task Full_field_set_round_trips_with_every_relation_collection()
    {
        var catalog = await PrepareAsync();
        var now = DateTimeOffset.UtcNow;
        var candidateId = Guid.NewGuid();

        await using (var write = NewContext())
        {
            write.Candidates.Add(NewCandidate(candidateId, now));
            var language = new CandidateLanguage(
                Guid.NewGuid(),
                candidateId,
                catalog.First(CatalogFamilies.Language),
                catalog.First(CatalogFamilies.LanguageLevel));
            language.SetCertification("C1 Advanced");
            var program = new CandidateProgram(
                Guid.NewGuid(),
                candidateId,
                catalog.First(CatalogFamilies.Program),
                catalog.First(CatalogFamilies.ProgramLevel));
            program.SetYearsExperience(4);
            var education = new CandidateEducation(
                Guid.NewGuid(),
                candidateId,
                catalog.First(CatalogFamilies.EducationType),
                catalog.First(CatalogFamilies.EducationStatus),
                "Grado en Informática",
                "Universidad Sintética");
            education.SetSpecialty("Ingeniería del Software");
            education.SetEndYear(2020);
            var experience = new CandidateExperience(
                Guid.NewGuid(),
                candidateId,
                catalog.First(CatalogFamilies.Sector),
                "Empresa Sintética",
                "Desarrolladora");
            experience.SetPeriod(new DateOnly(2021, 1, 1), new DateOnly(2024, 6, 30), isCurrent: false);
            var skill = new CandidateSkill(
                Guid.NewGuid(),
                candidateId,
                catalog.First(CatalogFamilies.Skill),
                catalog.First(CatalogFamilies.SkillLevel));
            write.CandidateLanguages.Add(language);
            write.CandidatePrograms.Add(program);
            write.CandidateEducation.Add(education);
            write.CandidateExperience.Add(experience);
            write.CandidateSkills.Add(skill);
            await write.SaveChangesAsync();
        }

        await using var read = NewContext();
        var stored = await read.Candidates.AsNoTracking().SingleAsync(value => value.Id == candidateId);
        Assert.Equal("Prueba", stored.FirstName);
        Assert.Equal("Sintética", stored.LastName);
        Assert.Equal("+34 600 111 222", stored.Phone);
        Assert.Equal("prueba.sintetica@example.invalid", stored.Email);
        Assert.Equal("Ciudad Sintética", stored.Location);
        Assert.Equal("Provincia Sintética", stored.Province);
        Assert.Equal("España", stored.Country);
        Assert.Equal(CandidateAvailabilityStates.Unknown, stored.AvailabilityState);
        Assert.Equal("Prueba", stored.Source);
        Assert.Equal("Notas sintéticas", stored.Notes);
        Assert.Equal(new DateOnly(2026, 2, 1), stored.ReceivedAt);
        Assert.Equal(new DateOnly(2026, 2, 2), stored.ConsentAt);
        Assert.Equal(new DateOnly(2028, 2, 2), stored.ReviewDueAt);
        Assert.True(stored.IsActive);
        Assert.Null(stored.DeletedAtUtc);

        Assert.Equal("C1 Advanced", (await read.CandidateLanguages.AsNoTracking().SingleAsync(value => value.CandidateId == candidateId)).Certification);
        Assert.Equal(4, (await read.CandidatePrograms.AsNoTracking().SingleAsync(value => value.CandidateId == candidateId)).YearsExperience);
        var storedEducation = await read.CandidateEducation.AsNoTracking().SingleAsync(value => value.CandidateId == candidateId);
        Assert.Equal("Grado en Informática", storedEducation.Degree);
        Assert.Equal("Universidad Sintética", storedEducation.Institution);
        Assert.Equal(2020, storedEducation.EndYear);
        var storedExperience = await read.CandidateExperience.AsNoTracking().SingleAsync(value => value.CandidateId == candidateId);
        Assert.Equal("Empresa Sintética", storedExperience.Company);
        Assert.Equal(new DateOnly(2024, 6, 30), storedExperience.EndDate);
        Assert.Single(await read.CandidateSkills.AsNoTracking().Where(value => value.CandidateId == candidateId).ToListAsync());
    }

    [Fact]
    public async Task Consent_metadata_stays_absent_when_it_was_never_supplied()
    {
        await PrepareAsync();
        var candidateId = Guid.NewGuid();

        await using (var write = NewContext())
        {
            write.Candidates.Add(new Candidate(candidateId, "Sin", "Consentimiento", DateTimeOffset.UtcNow));
            await write.SaveChangesAsync();
        }

        await using var read = NewContext();
        var stored = await read.Candidates.AsNoTracking().SingleAsync(value => value.Id == candidateId);
        Assert.Null(stored.ReceivedAt);
        Assert.Null(stored.ConsentAt);
        Assert.Null(stored.ReviewDueAt);
    }

    public static TheoryData<string, string> InconsistentChecks => new()
    {
        {
            """ "AvailabilityState" = 'promoted', "AvailabilityCheckedOn" = DATE '2026-03-12' """,
            "CK_CND_Candidates_AvailabilityState"
        },
        { """ "AvailabilityState" = 'available' """, "CK_CND_Candidates_AvailabilityCheck" },
        { """ "AvailabilityCheckedOn" = DATE '2026-03-12' """, "CK_CND_Candidates_AvailabilityCheck" },
        { """ "AvailabilityCheckedByUserId" = gen_random_uuid() """, "CK_CND_Candidates_AvailabilityCheck" },
        {
            """ "AvailabilityState" = 'available', "AvailabilityCheckedOn" = DATE '2026-03-12', "AvailabilityUntil" = DATE '2027-01-15' """,
            "CK_CND_Candidates_AvailabilityUntil"
        },
        {
            """ "AvailabilityState" = 'unavailable', "AvailabilityCheckedOn" = DATE '2026-03-12', "AvailabilityUntil" = DATE '2026-03-11' """,
            "CK_CND_Candidates_AvailabilityUntil"
        },
    };

    [Theory]
    [MemberData(nameof(InconsistentChecks))]
    public async Task An_inconsistent_availability_check_is_rejected_by_the_database(string assignment, string constraint)
    {
        await PrepareAsync();
        var candidateId = Guid.NewGuid();
        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, DateTimeOffset.UtcNow));
            await seed.SaveChangesAsync();
        }

        // The domain and the validator refuse first; the check constraints are what hold when a
        // bulk writer reaches the table without going through the entity.
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"UPDATE \"CND_Candidates\" SET {assignment} WHERE \"Id\" = @id", connection);
        command.Parameters.AddWithValue("id", candidateId);
        var failure = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        Assert.Equal(constraint, failure.ConstraintName);
    }

    [Fact]
    public async Task A_consistent_availability_check_is_accepted_by_the_database()
    {
        await PrepareAsync();
        var candidateId = Guid.NewGuid();
        await using (var seed = NewContext())
        {
            var candidate = NewCandidate(candidateId, DateTimeOffset.UtcNow);
            candidate.RecordAvailability(
                CandidateAvailabilityStates.Unavailable,
                new DateOnly(2026, 3, 12),
                new DateOnly(2027, 1, 15),
                checkedByUserId: null,
                DateTimeOffset.UtcNow);
            seed.Candidates.Add(candidate);
            await seed.SaveChangesAsync();
        }

        await using var read = NewContext();
        var stored = await read.Candidates.AsNoTracking().SingleAsync(value => value.Id == candidateId);
        Assert.Equal(CandidateAvailabilityStates.Unavailable, stored.AvailabilityState);
        Assert.Equal(new DateOnly(2026, 3, 12), stored.AvailabilityCheckedOn);
        Assert.Equal(new DateOnly(2027, 1, 15), stored.AvailabilityUntil);
    }

    [Fact]
    public async Task Experience_years_are_a_numeric_column_with_one_decimal()
    {
        await PrepareAsync();
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();

        await using var column = new NpgsqlCommand(
            """
            SELECT data_type, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_name = 'CND_CandidateExperience' AND column_name = 'YearsExperience'
            """,
            connection);
        await using var reader = await column.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(("numeric", 4, 1), (reader.GetString(0), reader.GetInt32(1), reader.GetInt32(2)));
    }

    [Theory]
    [InlineData("-0.1", null)]
    [InlineData("100.1", null)]
    [InlineData("0", "0.0")]
    [InlineData("100", "100.0")]
    [InlineData("5.3", "5.3")]
    public async Task Experience_years_outside_0_to_100_are_rejected_by_the_database(string years, string? stored)
    {
        var catalog = await PrepareAsync();
        var candidateId = Guid.NewGuid();
        var experienceId = Guid.NewGuid();
        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, DateTimeOffset.UtcNow));
            seed.CandidateExperience.Add(new CandidateExperience(
                experienceId, candidateId, catalog.First(CatalogFamilies.Sector), "Empresa Sintética", "Puesto"));
            await seed.SaveChangesAsync();
        }

        // The validator and the domain refuse first; the check is what holds for a bulk writer
        // that reaches the table without going through the entity.
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "UPDATE \"CND_CandidateExperience\" SET \"YearsExperience\" = @years WHERE \"Id\" = @id RETURNING \"YearsExperience\"::text",
            connection);
        command.Parameters.AddWithValue("years", decimal.Parse(years, System.Globalization.CultureInfo.InvariantCulture));
        command.Parameters.AddWithValue("id", experienceId);

        if (stored is null)
        {
            var failure = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteScalarAsync());
            Assert.Equal("CK_CND_CandidateExperience_YearsExperience", failure.ConstraintName);
        }
        else
        {
            Assert.Equal(stored, (string?)await command.ExecuteScalarAsync());
        }
    }

    [Fact]
    public async Task The_availability_columns_replace_the_status_and_default_to_unknown()
    {
        await PrepareAsync();
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();

        await using var columns = new NpgsqlCommand(
            """
            SELECT column_name, data_type, is_nullable, coalesce(column_default, '')
            FROM information_schema.columns
            WHERE table_name = 'CND_Candidates'
            """,
            connection);
        var found = new Dictionary<string, (string Type, string Nullable, string Default)>();
        await using (var reader = await columns.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                found[reader.GetString(0)] = (reader.GetString(1), reader.GetString(2), reader.GetString(3));
            }
        }

        Assert.DoesNotContain("Status", found.Keys);
        Assert.DoesNotContain("Availability", found.Keys);
        Assert.Equal("NO", found["AvailabilityState"].Nullable);
        Assert.StartsWith("'unknown'", found["AvailabilityState"].Default, StringComparison.Ordinal);
        Assert.Equal(("date", "YES"), (found["AvailabilityCheckedOn"].Type, found["AvailabilityCheckedOn"].Nullable));
        Assert.Equal(("date", "YES"), (found["AvailabilityUntil"].Type, found["AvailabilityUntil"].Nullable));
        Assert.Equal(("uuid", "YES"), (found["AvailabilityCheckedByUserId"].Type, found["AvailabilityCheckedByUserId"].Nullable));

        // A user who recorded a check cannot be deleted while the check names them.
        await using var foreignKey = new NpgsqlCommand(
            """
            SELECT confdeltype::text, confrelid::regclass::text
            FROM pg_constraint
            WHERE conname = 'FK_CND_Candidates_ADM_Users_AvailabilityCheckedByUserId'
            """,
            connection);
        await using var fk = await foreignKey.ExecuteReaderAsync();
        Assert.True(await fk.ReadAsync());
        Assert.Equal("r", fk.GetString(0));
        Assert.Equal("\"ADM_Users\"", fk.GetString(1));
    }

    [Theory]
    [InlineData("FirstName")]
    [InlineData("Email")]
    [InlineData("Notes")]
    public async Task A_direct_plaintext_update_of_an_encrypted_column_is_rejected_by_the_database(string column)
    {
        await PrepareAsync();
        var candidateId = Guid.NewGuid();
        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, DateTimeOffset.UtcNow));
            await seed.SaveChangesAsync();
        }

        // KTL-33: a bulk writer that bypasses the API cannot put plaintext back.
        var sql = column switch
        {
            "FirstName" => """UPDATE "CND_Candidates" SET "FirstName" = 'Texto en claro' WHERE "Id" = {0}""",
            "Email" => """UPDATE "CND_Candidates" SET "Email" = 'Texto en claro' WHERE "Id" = {0}""",
            _ => """UPDATE "CND_Candidates" SET "Notes" = 'Texto en claro' WHERE "Id" = {0}""",
        };
        await using var raw = NewContext();
        var failure = await Assert.ThrowsAsync<PostgresException>(() => raw.Database.ExecuteSqlRawAsync(sql, candidateId));
        Assert.Equal($"CK_CND_Candidates_{column}_Encrypted", failure.ConstraintName);
    }

    [Fact]
    public async Task A_direct_plaintext_insert_is_rejected_by_the_database()
    {
        await PrepareAsync();

        await using var raw = NewContext();
        var failure = await Assert.ThrowsAsync<PostgresException>(() =>
            raw.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO "CND_Candidates"
                    ("Id", "FirstName", "LastName", "Phone", "Email", "Location", "Province", "Country",
                     "Source", "Notes", "IsActive", "CreatedAtUtc", "UpdatedAtUtc", "EmailHash")
                VALUES ({Guid.NewGuid()}, 'Ana', 'López', '', '', '', '', '', '', '', true, now(), now(), '')
                """));
        Assert.StartsWith("CK_CND_Candidates_", failure.ConstraintName, StringComparison.Ordinal);
        Assert.Equal(PostgresErrorCodes.CheckViolation, failure.SqlState);
    }

    [Fact]
    public async Task Nullable_encrypted_columns_still_accept_null()
    {
        var catalog = await PrepareAsync();
        var now = DateTimeOffset.UtcNow;
        var candidateId = Guid.NewGuid();
        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, now));
            var language = new CandidateLanguage(
                Guid.NewGuid(), candidateId, catalog.First(CatalogFamilies.Language), catalog.First(CatalogFamilies.LanguageLevel));
            seed.CandidateLanguages.Add(language);
            await seed.SaveChangesAsync();
        }

        await using var read = NewContext();
        var stored = await read.CandidateLanguages.AsNoTracking().SingleAsync(language => language.CandidateId == candidateId);
        Assert.Null(stored.Certification);
        Assert.Null(stored.Notes);
    }

    [Fact]
    public async Task Every_encrypted_column_carries_its_envelope_check()
    {
        await PrepareAsync();

        await using var dbContext = NewContext();
        var connection = (NpgsqlConnection)dbContext.Database.GetDbConnection();
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname LIKE '%\_Encrypted' ESCAPE '\'""",
            connection);
        var names = new HashSet<string>(StringComparer.Ordinal);
        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                names.Add(reader.GetString(0));
            }
        }

        // Read from the EF model, so a column marked encrypted later without a check fails here.
        var expected = KeplerTalento.Infrastructure.Encryption.FieldEncryptionModel
            .EncryptedProperties(dbContext.Model)
            .Select(property => $"CK_{((Microsoft.EntityFrameworkCore.Metadata.IReadOnlyEntityType)property.DeclaringType).GetTableName()}_{property.Name}_Encrypted")
            .ToHashSet(StringComparer.Ordinal);
        Assert.Subset(names, expected);
    }

    [Fact]
    public async Task Relation_referencing_a_catalog_entry_of_the_wrong_family_is_rejected()
    {
        var catalog = await PrepareAsync();
        var now = DateTimeOffset.UtcNow;
        var candidateId = Guid.NewGuid();

        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, now));
            await seed.SaveChangesAsync();
        }

        await using var write = NewContext();
        // A sector is a real catalog entry, just not a language. Without the composite
        // foreign key onto (Id, Family) this would be accepted.
        write.CandidateLanguages.Add(new CandidateLanguage(
            Guid.NewGuid(),
            candidateId,
            catalog.First(CatalogFamilies.Sector),
            catalog.First(CatalogFamilies.LanguageLevel)));
        var failure = await Assert.ThrowsAsync<DbUpdateException>(() => write.SaveChangesAsync());
        Assert.Equal("23503", (failure.InnerException as PostgresException)?.SqlState);
    }

    [Fact]
    public async Task Relation_for_a_candidate_that_does_not_exist_is_rejected()
    {
        var catalog = await PrepareAsync();

        await using var write = NewContext();
        write.CandidateSkills.Add(new CandidateSkill(
            Guid.NewGuid(),
            Guid.NewGuid(),
            catalog.First(CatalogFamilies.Skill),
            catalog.First(CatalogFamilies.SkillLevel)));
        var failure = await Assert.ThrowsAsync<DbUpdateException>(() => write.SaveChangesAsync());
        Assert.Equal("23503", (failure.InnerException as PostgresException)?.SqlState);
    }

    [Fact]
    public async Task Logical_deletion_preserves_the_candidate_and_its_relations()
    {
        var catalog = await PrepareAsync();
        var now = DateTimeOffset.UtcNow;
        var candidateId = Guid.NewGuid();

        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, now));
            seed.CandidateSkills.Add(new CandidateSkill(
                Guid.NewGuid(),
                candidateId,
                catalog.First(CatalogFamilies.Skill),
                catalog.First(CatalogFamilies.SkillLevel)));
            await seed.SaveChangesAsync();
        }

        await using (var remove = NewContext())
        {
            var candidate = await remove.Candidates.SingleAsync(value => value.Id == candidateId);
            candidate.Deactivate(now.AddMinutes(1));
            await remove.SaveChangesAsync();
        }

        await using var read = NewContext();
        var stored = await read.Candidates.AsNoTracking().SingleAsync(value => value.Id == candidateId);
        Assert.False(stored.IsActive);
        Assert.NotNull(stored.DeletedAtUtc);
        Assert.Single(await read.CandidateSkills.AsNoTracking().Where(value => value.CandidateId == candidateId).ToListAsync());
    }

    [Fact]
    public async Task Tag_family_fk_rejects_an_item_from_another_catalog_family()
    {
        var catalog = await PrepareAsync();
        var candidateId = Guid.NewGuid();
        await using var write = NewContext();
        write.Candidates.Add(NewCandidate(candidateId, DateTimeOffset.UtcNow));
        write.CandidateTags.Add(new CandidateTag(
            Guid.NewGuid(), candidateId, catalog.First(CatalogFamilies.Sector)));

        var failure = await Assert.ThrowsAsync<DbUpdateException>(() => write.SaveChangesAsync());
        Assert.Equal("23503", (failure.InnerException as PostgresException)?.SqlState);
    }

    [Fact]
    public async Task Concurrent_duplicate_tag_assignments_are_rejected_by_the_unique_index()
    {
        var catalog = await PrepareAsync();
        var candidateId = Guid.NewGuid();
        var tagId = catalog.First(CatalogFamilies.Tag);
        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, DateTimeOffset.UtcNow));
            await seed.SaveChangesAsync();
        }

        await using var first = NewContext();
        await using var second = NewContext();
        first.CandidateTags.Add(new CandidateTag(Guid.NewGuid(), candidateId, tagId));
        second.CandidateTags.Add(new CandidateTag(Guid.NewGuid(), candidateId, tagId));
        await first.SaveChangesAsync();
        var failure = await Assert.ThrowsAsync<DbUpdateException>(() => second.SaveChangesAsync());
        Assert.Equal("23505", (failure.InnerException as PostgresException)?.SqlState);
        Assert.Equal("UX_CND_CandidateTags_CandidateId_TagId", ConstraintOf(failure));
    }

    [Fact]
    public async Task Logical_deletion_preserves_candidate_tags()
    {
        var catalog = await PrepareAsync();
        var candidateId = Guid.NewGuid();
        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, DateTimeOffset.UtcNow));
            seed.CandidateTags.Add(new CandidateTag(
                Guid.NewGuid(), candidateId, catalog.First(CatalogFamilies.Tag)));
            await seed.SaveChangesAsync();
        }
        await using (var remove = NewContext())
        {
            var candidate = await remove.Candidates.SingleAsync(value => value.Id == candidateId);
            candidate.Deactivate(DateTimeOffset.UtcNow);
            await remove.SaveChangesAsync();
        }
        await using var read = NewContext();
        Assert.Single(await read.CandidateTags.AsNoTracking()
            .Where(value => value.CandidateId == candidateId).ToListAsync());
    }

    [Fact]
    public async Task An_inactive_candidate_must_carry_the_moment_it_was_removed()
    {
        await PrepareAsync();
        var candidateId = Guid.NewGuid();

        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, DateTimeOffset.UtcNow));
            await seed.SaveChangesAsync();
        }

        await using var raw = NewContext();
        var failure = await Assert.ThrowsAsync<PostgresException>(() =>
            raw.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE \"CND_Candidates\" SET \"IsActive\" = false WHERE \"Id\" = {candidateId}"));
        Assert.Equal("CK_CND_Candidates_Deleted", failure.ConstraintName);
    }

    [Fact]
    public async Task A_candidate_cannot_hold_two_primary_documents()
    {
        await PrepareAsync();
        var now = DateTimeOffset.UtcNow;
        var candidateId = Guid.NewGuid();

        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, now));
            var first = new CandidateDocument(
                Guid.NewGuid(), candidateId, $"{candidateId:N}/a", "cv.pdf", "application/pdf", 10, new string('a', 64), now);
            first.SetPrimary(true, now);
            seed.Documents.Add(first);
            await seed.SaveChangesAsync();
        }

        await using var write = NewContext();
        var second = new CandidateDocument(
            Guid.NewGuid(), candidateId, $"{candidateId:N}/b", "cv-2.pdf", "application/pdf", 10, new string('b', 64), now);
        second.SetPrimary(true, now);
        write.Documents.Add(second);
        var failure = await Assert.ThrowsAsync<DbUpdateException>(() => write.SaveChangesAsync());
        Assert.Equal("UX_CND_Documents_CandidateId_Primary", ConstraintOf(failure));
    }

    [Fact]
    public async Task Non_primary_documents_are_unconstrained()
    {
        await PrepareAsync();
        var now = DateTimeOffset.UtcNow;
        var candidateId = Guid.NewGuid();

        await using var write = NewContext();
        write.Candidates.Add(NewCandidate(candidateId, now));
        write.Documents.Add(new CandidateDocument(
            Guid.NewGuid(), candidateId, $"{candidateId:N}/x", "a.pdf", "application/pdf", 10, new string('a', 64), now));
        write.Documents.Add(new CandidateDocument(
            Guid.NewGuid(), candidateId, $"{candidateId:N}/y", "b.pdf", "application/pdf", 10, new string('b', 64), now));
        await write.SaveChangesAsync();

        Assert.Equal(2, await write.Documents.CountAsync(value => value.CandidateId == candidateId));
    }

    [Fact]
    public async Task Source_key_makes_a_reload_idempotent_rather_than_duplicating()
    {
        await PrepareAsync();
        var now = DateTimeOffset.UtcNow;
        var sourceKey = $"ACCESS-{Guid.NewGuid():N}";

        await using (var seed = NewContext())
        {
            var candidate = NewCandidate(Guid.NewGuid(), now);
            candidate.SetSourceKey(sourceKey);
            seed.Candidates.Add(candidate);
            await seed.SaveChangesAsync();
        }

        await using var write = NewContext();
        var duplicate = NewCandidate(Guid.NewGuid(), now);
        duplicate.SetSourceKey(sourceKey);
        write.Candidates.Add(duplicate);
        var failure = await Assert.ThrowsAsync<DbUpdateException>(() => write.SaveChangesAsync());
        Assert.Equal("UX_CND_Candidates_SourceKey", ConstraintOf(failure));
    }

    [Fact]
    public async Task A_migrated_row_reports_application_changes_made_after_it_was_loaded()
    {
        await PrepareAsync();
        var loadedAt = DateTimeOffset.UtcNow;
        var candidateId = Guid.NewGuid();

        await using (var load = NewContext())
        {
            var candidate = NewCandidate(candidateId, loadedAt);
            candidate.SetSourceKey($"ACCESS-{Guid.NewGuid():N}");
            candidate.MarkSourceLoaded(loadedAt);
            load.Candidates.Add(candidate);
            await load.SaveChangesAsync();
        }

        await using (var untouched = NewContext())
        {
            var stored = await untouched.Candidates.AsNoTracking().SingleAsync(value => value.Id == candidateId);
            Assert.False(stored.HasApplicationChangesSinceLoad);
        }

        await using (var edit = NewContext())
        {
            var candidate = await edit.Candidates.SingleAsync(value => value.Id == candidateId);
            candidate.SetIdentity("Editada", "EnLaApp", loadedAt.AddHours(1));
            await edit.SaveChangesAsync();
        }

        await using var read = NewContext();
        var edited = await read.Candidates.AsNoTracking().SingleAsync(value => value.Id == candidateId);
        Assert.True(edited.HasApplicationChangesSinceLoad);
    }

    [Fact]
    public async Task A_record_cannot_claim_to_be_migration_loaded_without_provenance()
    {
        await PrepareAsync();
        var candidateId = Guid.NewGuid();

        await using (var seed = NewContext())
        {
            seed.Candidates.Add(NewCandidate(candidateId, DateTimeOffset.UtcNow));
            await seed.SaveChangesAsync();
        }

        await using var raw = NewContext();
        var failure = await Assert.ThrowsAsync<PostgresException>(() =>
            raw.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE \"CND_Candidates\" SET \"SourceLoadedAtUtc\" = now() WHERE \"Id\" = {candidateId}"));
        Assert.Equal("CK_CND_Candidates_SourceLoaded", failure.ConstraintName);
    }

    [Fact]
    public async Task Application_created_rows_share_an_absent_source_key_without_colliding()
    {
        await PrepareAsync();
        var now = DateTimeOffset.UtcNow;

        await using var write = NewContext();
        write.Candidates.Add(NewCandidate(Guid.NewGuid(), now));
        write.Candidates.Add(NewCandidate(Guid.NewGuid(), now));
        await write.SaveChangesAsync();

        Assert.True(await write.Candidates.CountAsync(value => value.SourceKey == null) >= 2);
    }

    [Fact]
    public async Task Runtime_role_holds_data_privileges_but_cannot_modify_the_candidate_schema()
    {
        await PrepareAsync();

        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();

        // DDL on a table is the owner's privilege, so "cannot alter or drop" is proven by
        // the runtime role neither owning the candidate tables nor being able to create
        // objects in the schema.
        await using var ownershipCommand = new NpgsqlCommand(
            """
            SELECT count(*) FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename LIKE 'CND\_%'
              AND tableowner = 'ktl_runtime'
            """,
            connection);
        Assert.Equal(0L, (long)(await ownershipCommand.ExecuteScalarAsync())!);

        await using var schemaCommand = new NpgsqlCommand(
            "SELECT has_schema_privilege('ktl_runtime', 'public', 'CREATE')",
            connection);
        Assert.False((bool)(await schemaCommand.ExecuteScalarAsync())!);

        foreach (var table in new[]
                 {
                     "CND_CandidateLanguages",
                     "CND_CandidatePrograms",
                     "CND_CandidateEducation",
                     "CND_CandidateExperience",
                     "CND_CandidateSkills",
                     "CND_CandidateTags",
                 })
        {
            await using var privilegeCommand = new NpgsqlCommand(
                $"""
                 SELECT has_table_privilege('ktl_runtime', '"{table}"', 'SELECT'),
                        has_table_privilege('ktl_runtime', '"{table}"', 'INSERT'),
                        has_table_privilege('ktl_runtime', '"{table}"', 'UPDATE'),
                        has_table_privilege('ktl_runtime', '"{table}"', 'DELETE'),
                        has_table_privilege('ktl_runtime', '"{table}"', 'TRUNCATE')
                 """,
                connection);
            await using var reader = await privilegeCommand.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync());
            Assert.True(reader.GetBoolean(0), $"{table} SELECT");
            Assert.True(reader.GetBoolean(1), $"{table} INSERT");
            Assert.True(reader.GetBoolean(2), $"{table} UPDATE");
            Assert.True(reader.GetBoolean(3), $"{table} DELETE");
            Assert.False(reader.GetBoolean(4), $"{table} TRUNCATE");
        }

        await using var notePrivilegeCommand = new NpgsqlCommand(
            """
            SELECT has_table_privilege('ktl_runtime', '"CND_CandidateNotes"', 'SELECT'),
                   has_table_privilege('ktl_runtime', '"CND_CandidateNotes"', 'INSERT'),
                   has_table_privilege('ktl_runtime', '"CND_CandidateNotes"', 'UPDATE'),
                   has_table_privilege('ktl_runtime', '"CND_CandidateNotes"', 'DELETE'),
                   has_table_privilege('ktl_runtime', '"CND_CandidateNotes"', 'TRUNCATE')
            """,
            connection);
        await using var noteReader = await notePrivilegeCommand.ExecuteReaderAsync();
        Assert.True(await noteReader.ReadAsync());
        Assert.True(noteReader.GetBoolean(0));
        Assert.True(noteReader.GetBoolean(1));
        Assert.True(noteReader.GetBoolean(2));
        Assert.False(noteReader.GetBoolean(3));
        Assert.False(noteReader.GetBoolean(4));
    }
}
