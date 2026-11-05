using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Application.Abstractions.RichText;
using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Application.Features.Positions;
using KeplerTalento.Application.Features.Search;
using KeplerTalento.Domain.Positions;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Features;

public sealed class PositionHandlerTests
{
    private static readonly SearchFiltersInput NoFilters = new(null, null, null, null, null, null, null, null, null);

    // ---- guards ----

    [Fact]
    public async Task List_refuses_an_unauthenticated_or_unauthorized_actor_before_validating_or_querying()
    {
        foreach (var actor in new[] { Actor.Unauthenticated, Actor.None, Actor.ManageOnly })
        {
            var repository = new StubPositionRepository();
            var handler = new ListPositionsHandler(repository, actor);

            // Invalid on every member: a validation problem here would disclose the contract.
            await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(
                new("nope", new string('x', 500), 0, 1000, "secret", "sideways"), CancellationToken.None));

            Assert.Equal(0, repository.Calls);
        }
    }

    [Fact]
    public async Task Get_refuses_existing_and_missing_ids_alike_without_looking_them_up()
    {
        var repository = new StubPositionRepository();
        var existing = repository.Seed("Programador sénior");

        foreach (var actor in new[] { Actor.Unauthenticated, Actor.None, Actor.ManageOnly })
        {
            var handler = new GetPositionHandler(repository, actor);
            await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(new(existing.Id), CancellationToken.None));
            await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(new(Guid.NewGuid()), CancellationToken.None));
        }

        Assert.Equal(0, repository.Calls);
    }

    [Fact]
    public async Task Create_refuses_a_reader_and_an_unauthenticated_actor_and_stores_nothing()
    {
        foreach (var actor in new[] { Actor.Unauthenticated, Actor.None, Actor.Reader })
        {
            var repository = new StubPositionRepository();
            var handler = new CreatePositionHandler(repository, new PassThroughSanitizer(), actor);

            await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(
                new(string.Empty, null, null, new SearchFiltersInput(null, ["no_such_status"], null, "SOME", null, null, null, null, "maybe")),
                CancellationToken.None));

            Assert.Empty(repository.Items);
            Assert.Null(repository.LastAuditEventType);
            Assert.Equal(0, repository.Calls);
        }
    }

    [Fact]
    public async Task Update_refuses_a_reader_for_existing_and_missing_ids_and_changes_nothing()
    {
        var repository = new StubPositionRepository();
        var existing = repository.Seed("Programador sénior");

        foreach (var actor in new[] { Actor.Unauthenticated, Actor.None, Actor.Reader })
        {
            var handler = new UpdatePositionHandler(repository, new PassThroughSanitizer(), actor);
            await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(
                new(existing.Id, "Otro", null, null, PositionStatuses.Closed, NoFilters, 1), CancellationToken.None));
            await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(
                new(Guid.NewGuid(), "Otro", null, null, "nope", NoFilters, 0), CancellationToken.None));
        }

        Assert.Equal(PositionStatuses.Open, existing.Status);
        Assert.Equal("Programador sénior", existing.Title);
        Assert.Equal(0, repository.Calls);
    }

    [Fact]
    public async Task Position_permissions_do_not_imply_each_other()
    {
        var repository = new StubPositionRepository();
        var existing = repository.Seed("Programador sénior");

        // Holding only manage does not grant read, and holding only read does not grant manage.
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new GetPositionHandler(repository, Actor.ManageOnly).Handle(new(existing.Id), CancellationToken.None));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new CreatePositionHandler(repository, new PassThroughSanitizer(), Actor.Reader)
                .Handle(new("Nueva", null, null, NoFilters), CancellationToken.None));
    }

    // ---- list ----

    [Fact]
    public async Task List_applies_the_contracted_defaults()
    {
        var repository = new StubPositionRepository();
        var handler = new ListPositionsHandler(repository, Actor.Reader);

        await handler.Handle(new(null, null, null, null, null, null), CancellationToken.None);

        Assert.Equal(new PositionListOptions(PositionStatuses.Open, string.Empty, 1, 25, "updatedAt", "desc"), repository.LastListOptions);
    }

    [Fact]
    public async Task List_normalizes_text_ignoring_case_and_accents_and_treats_blank_as_no_filter()
    {
        var repository = new StubPositionRepository();
        var handler = new ListPositionsHandler(repository, Actor.Reader);

        await handler.Handle(new("all", "  MÁLAGA ", 2, 100, "title", "ASC"), CancellationToken.None);
        Assert.Equal(new PositionListOptions("all", "malaga", 2, 100, "title", "asc"), repository.LastListOptions);

        await handler.Handle(new(PositionStatuses.Closed, "   ", 1, 1, "location", "desc"), CancellationToken.None);
        Assert.Equal(string.Empty, repository.LastListOptions!.Text);
    }

    [Theory]
    [InlineData("nope", 1, 25, "updatedAt", "desc", PositionErrors.StatusInvalid)]
    [InlineData("open", 0, 25, "updatedAt", "desc", PositionErrors.PageInvalid)]
    [InlineData("open", 1, 0, "updatedAt", "desc", PositionErrors.PageSizeInvalid)]
    [InlineData("open", 1, 101, "updatedAt", "desc", PositionErrors.PageSizeInvalid)]
    [InlineData("open", 1, 25, "description", "desc", PositionErrors.SortFieldInvalid)]
    [InlineData("open", 1, 25, "UpdatedAt", "desc", PositionErrors.SortFieldInvalid)]
    [InlineData("open", 1, 25, "updatedAt", "sideways", PositionErrors.SortDirectionInvalid)]
    public async Task List_rejects_unsupported_input_before_querying(
        string status, int page, int pageSize, string sortField, string direction, string code)
    {
        var repository = new StubPositionRepository();
        var handler = new ListPositionsHandler(repository, Actor.Reader);

        var exception = await Assert.ThrowsAsync<RequestValidationException>(() =>
            handler.Handle(new(status, null, page, pageSize, sortField, direction), CancellationToken.None));

        Assert.Equal(code, Assert.Single(exception.Issues).Code);
        Assert.Null(repository.LastListOptions);
    }

    [Fact]
    public async Task List_maps_only_the_minimal_projection()
    {
        var repository = new StubPositionRepository();
        var seeded = repository.Seed("Programador sénior");
        var handler = new ListPositionsHandler(repository, Actor.Reader);

        var page = await handler.Handle(new(null, null, null, null, null, null), CancellationToken.None);

        var item = Assert.Single(page.Items);
        Assert.Equal(seeded.Id, item.Id);
        Assert.Equal(1, page.TotalCount);
        Assert.Equal(
            ["CandidateCount", "Id", "Location", "StageCounts", "Status", "Title", "UpdatedAtUtc", "Version"],
            typeof(PositionListItemResponse).GetProperties().Select(property => property.Name).Order());
        Assert.Equal(
            ["Hired", "Interview", "New", "Rejected", "Shortlisted"],
            typeof(PositionStageCountsResponse).GetProperties().Select(property => property.Name).Order());
    }

    [Fact]
    public async Task List_maps_the_stage_counts_of_each_position()
    {
        var repository = new StubPositionRepository();
        var seeded = repository.Seed("Programador sénior");
        repository.StageCounts[seeded.Id] = new PositionStageCounts(New: 3, Shortlisted: 0, Interview: 1, Hired: 0, Rejected: 2);
        var handler = new ListPositionsHandler(repository, Actor.Reader);

        var page = await handler.Handle(new(null, null, null, null, null, null), CancellationToken.None);

        var item = Assert.Single(page.Items);
        Assert.Equal(new PositionStageCountsResponse(3, 0, 1, 0, 2), item.StageCounts);
        Assert.Equal(6, item.CandidateCount);
    }

    // ---- get ----

    [Fact]
    public async Task Get_returns_the_full_position_with_normalized_requirements()
    {
        var repository = new StubPositionRepository();
        var seeded = repository.Seed("Programador sénior");
        var handler = new GetPositionHandler(repository, Actor.Reader);

        var position = await handler.Handle(new(seeded.Id), CancellationToken.None);

        Assert.Equal(seeded.Id, position.Id);
        Assert.Equal("<p>Descripción</p>", position.Description);
        Assert.NotNull(position.Requirements);
    }

    [Fact]
    public async Task Get_reports_a_missing_position_as_not_found()
    {
        var handler = new GetPositionHandler(new StubPositionRepository(), Actor.Reader);

        var exception = await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.Handle(new(Guid.NewGuid()), CancellationToken.None));

        Assert.Equal(PositionErrors.NotFound, exception.Code);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"version\":99}")]
    [InlineData("{\"version\":2,\"skillMode\":\"SOME\"}")]
    // KTL-36: a version 1 document is refused rather than upgraded on read.
    [InlineData("{\"version\":1,\"statusValues\":[\"new\"]}")]
    public async Task Get_refuses_unreadable_stored_requirements_instead_of_returning_empty_ones(string stored)
    {
        var repository = new StubPositionRepository();
        var position = new Position(Guid.CreateVersion7(), "Corrupta", string.Empty, string.Empty, stored, 1, DateTimeOffset.UtcNow);
        repository.Items.Add(position);
        var handler = new GetPositionHandler(repository, Actor.Reader);

        var exception = await Assert.ThrowsAsync<RequestValidationException>(() =>
            handler.Handle(new(position.Id), CancellationToken.None));

        Assert.Equal(PositionErrors.RequirementsInvalid, Assert.Single(exception.Issues).Code);
    }

    // ---- create ----

    [Fact]
    public async Task Create_stores_an_open_position_with_server_assigned_identity_and_utc_timestamps()
    {
        var repository = new StubPositionRepository();
        var sanitizer = new PassThroughSanitizer();
        var handler = new CreatePositionHandler(repository, sanitizer, Actor.Manager);
        var before = DateTimeOffset.UtcNow;

        var created = await handler.Handle(
            new("  Programador sénior ", "<p>Hola</p>", " Madrid ", NoFilters), CancellationToken.None);

        Assert.Equal(PositionStatuses.Open, created.Status);
        Assert.Equal("Programador sénior", created.Title);
        Assert.Equal("Madrid", created.Location);
        Assert.Equal(7, created.Id.Version);
        Assert.Equal(TimeSpan.Zero, created.CreatedAtUtc.Offset);
        Assert.InRange(created.CreatedAtUtc, before, DateTimeOffset.UtcNow);
        Assert.Equal(created.CreatedAtUtc, created.UpdatedAtUtc);
        Assert.Equal(["<p>Hola</p>"], sanitizer.Inputs);
        Assert.Equal(PositionAuditEvents.Created, repository.LastAuditEventType);
    }

    [Fact]
    public async Task Create_stores_normalized_requirements_that_read_back_with_the_same_meaning()
    {
        var repository = new StubPositionRepository();
        var handler = new CreatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);
        var requirements = new SearchFiltersInput(
            "  java ", null, [new SearchCriterionInput(" Java ", "")], "all", null, null, null, null, "yes");

        var created = await handler.Handle(new("Backend", null, null, requirements), CancellationToken.None);
        var read = await new GetPositionHandler(repository, Actor.Reader).Handle(new(created.Id), CancellationToken.None);

        Assert.Equal("java", read.Requirements.Text);
        Assert.Equal("ALL", read.Requirements.SkillMode);
        Assert.Equal("Java", Assert.Single(read.Requirements.SkillCriteria!)!.Value);
        Assert.Equal("yes", read.Requirements.HasCv);
        Assert.Contains("\"version\":2", repository.Items.Single().Requirements, StringComparison.Ordinal);
        Assert.Contains("\"availabilityValues\":[\"unknown\",\"available\",\"unavailable\"]", repository.Items.Single().Requirements, StringComparison.Ordinal);
        Assert.DoesNotContain("statusValues", repository.Items.Single().Requirements, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Create_accepts_empty_requirements()
    {
        var repository = new StubPositionRepository();
        var handler = new CreatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);

        var created = await handler.Handle(new("Cualquiera", null, null, null), CancellationToken.None);

        Assert.Empty(created.Requirements.SkillCriteria ?? []);
        Assert.Single(repository.Items);
    }

    [Theory]
    [MemberData(nameof(InvalidRequirements))]
    public async Task Create_rejects_invalid_requirements_and_stores_nothing(SearchFiltersInput requirements)
    {
        var repository = new StubPositionRepository();
        var handler = new CreatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);

        await Assert.ThrowsAsync<RequestValidationException>(() =>
            handler.Handle(new("Backend", null, null, requirements), CancellationToken.None));

        Assert.Empty(repository.Items);
        Assert.Null(repository.LastAuditEventType);
    }

    public static TheoryData<SearchFiltersInput> InvalidRequirements => new()
    {
        new SearchFiltersInput(null, ["no_such_status"], null, null, null, null, null, null, null),
        new SearchFiltersInput(null, null, [new SearchCriterionInput("Java", "")], "SOME", null, null, null, null, null),
        new SearchFiltersInput(null, null, null, null, null, null, null, null, "maybe"),
        new SearchFiltersInput(null, null, [new SearchCriterionInput(new string('j', 201), "")], "ANY", null, null, null, null, null),
    };

    [Fact]
    public async Task Create_rejects_a_description_that_is_too_long_after_sanitization()
    {
        var repository = new StubPositionRepository();
        var sanitizer = new PassThroughSanitizer(_ => new string('a', PositionText.MaximumDescriptionLength + 1));
        var handler = new CreatePositionHandler(repository, sanitizer, Actor.Manager);

        var exception = await Assert.ThrowsAsync<RequestValidationException>(() =>
            handler.Handle(new("Backend", "<p>corto</p>", null, NoFilters), CancellationToken.None));

        Assert.Equal(PositionErrors.DescriptionTooLong, Assert.Single(exception.Issues).Code);
        Assert.Empty(repository.Items);
    }

    [Fact]
    public async Task Create_reports_a_title_race_as_a_stable_conflict()
    {
        var repository = new StubPositionRepository { NextOutcome = PositionSaveOutcome.TitleConflict };
        var handler = new CreatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);

        var exception = await Assert.ThrowsAsync<ConflictException>(() =>
            handler.Handle(new("programador SENIOR", null, null, NoFilters), CancellationToken.None));

        Assert.Equal(PositionErrors.TitleConflict, exception.Code);
    }

    [Fact]
    public async Task Create_reports_a_database_constraint_violation_as_a_validation_problem()
    {
        var repository = new StubPositionRepository { NextOutcome = PositionSaveOutcome.ConstraintViolation };
        var handler = new CreatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);

        var exception = await Assert.ThrowsAsync<RequestValidationException>(() =>
            handler.Handle(new("Backend", null, null, NoFilters), CancellationToken.None));

        Assert.Equal(PositionErrors.RequirementsInvalid, Assert.Single(exception.Issues).Code);
    }

    [Fact]
    public void Create_validator_rejects_blank_and_overlong_fields()
    {
        var validator = new CreatePositionValidator();
        var over = new string('a', 201);

        var result = validator.Validate(new CreatePositionCommand("  ", new string('a', 20_001), over, NoFilters));

        Assert.Equal(
            [PositionErrors.TitleRequired, PositionErrors.LocationTooLong, PositionErrors.DescriptionTooLong],
            result.Errors.Select(error => error.ErrorCode));
        Assert.Equal(PositionErrors.TitleTooLong, Assert.Single(validator.Validate(new CreatePositionCommand(over, null, null, NoFilters)).Errors).ErrorCode);
    }

    // ---- update ----

    [Fact]
    public async Task Update_closes_a_position_without_changing_its_requirements()
    {
        var repository = new StubPositionRepository();
        var seeded = repository.Seed("Programador sénior");
        var storedRequirements = seeded.Requirements;
        var handler = new UpdatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);
        var current = seeded.ToTestResponse();

        var closed = await handler.Handle(
            new(seeded.Id, current.Title, current.Description, current.Location, PositionStatuses.Closed, current.Requirements, 3),
            CancellationToken.None);

        Assert.Equal(PositionStatuses.Closed, closed.Status);
        Assert.Equal(storedRequirements, seeded.Requirements);
        Assert.Contains(seeded, repository.Items);
        Assert.Equal(PositionAuditEvents.StatusChanged, repository.LastAuditEventType);
        Assert.Equal(3u, repository.ExpectedVersion);
    }

    [Fact]
    public async Task Update_reopens_a_closed_position()
    {
        var repository = new StubPositionRepository();
        var seeded = repository.Seed("Programador sénior");
        seeded.Update(seeded.Title, seeded.Description, seeded.Location, PositionStatuses.Closed, seeded.Requirements, 1, DateTimeOffset.UtcNow);
        var handler = new UpdatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);

        var reopened = await handler.Handle(
            new(seeded.Id, seeded.Title, null, null, PositionStatuses.Open, NoFilters, 1), CancellationToken.None);

        Assert.Equal(PositionStatuses.Open, reopened.Status);
        Assert.Equal(PositionAuditEvents.StatusChanged, repository.LastAuditEventType);
    }

    [Fact]
    public async Task Update_without_a_status_change_records_an_update_event()
    {
        var repository = new StubPositionRepository();
        var seeded = repository.Seed("Programador sénior");
        var handler = new UpdatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);

        var updated = await handler.Handle(
            new(seeded.Id, "Programadora sénior", "<p>Nueva</p>", "Bilbao", PositionStatuses.Open, NoFilters, 1),
            CancellationToken.None);

        Assert.Equal("Programadora sénior", updated.Title);
        Assert.Equal("Bilbao", updated.Location);
        Assert.Equal(PositionAuditEvents.Updated, repository.LastAuditEventType);
    }

    [Fact]
    public async Task Update_reports_a_missing_position_as_not_found()
    {
        var handler = new UpdatePositionHandler(new StubPositionRepository(), new PassThroughSanitizer(), Actor.Manager);

        var exception = await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(
            new(Guid.NewGuid(), "Otro", null, null, PositionStatuses.Open, NoFilters, 1), CancellationToken.None));

        Assert.Equal(PositionErrors.NotFound, exception.Code);
    }

    [Fact]
    public async Task Update_reports_a_stale_version_as_a_concurrency_conflict()
    {
        var repository = new StubPositionRepository { NextOutcome = PositionSaveOutcome.ConcurrencyConflict };
        var seeded = repository.Seed("Programador sénior");
        var handler = new UpdatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);

        var exception = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new(seeded.Id, "Otro", null, null, PositionStatuses.Open, NoFilters, 7), CancellationToken.None));

        Assert.Equal(PositionErrors.ConcurrencyConflict, exception.Code);
        Assert.Equal(7u, repository.ExpectedVersion);
    }

    [Fact]
    public async Task Update_reports_a_rename_race_as_a_title_conflict()
    {
        var repository = new StubPositionRepository { NextOutcome = PositionSaveOutcome.TitleConflict };
        var seeded = repository.Seed("Analista");
        var handler = new UpdatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);

        var exception = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(
            new(seeded.Id, "programador SENIOR", null, null, PositionStatuses.Open, NoFilters, 1), CancellationToken.None));

        Assert.Equal(PositionErrors.TitleConflict, exception.Code);
    }

    [Fact]
    public async Task Update_rejects_invalid_requirements_before_loading_the_position()
    {
        var repository = new StubPositionRepository();
        var seeded = repository.Seed("Programador sénior");
        var handler = new UpdatePositionHandler(repository, new PassThroughSanitizer(), Actor.Manager);

        await Assert.ThrowsAsync<RequestValidationException>(() => handler.Handle(
            new(seeded.Id, "Otro", null, null, PositionStatuses.Open,
                new SearchFiltersInput(null, null, null, null, null, null, null, null, "maybe"), 1),
            CancellationToken.None));

        Assert.Equal("Programador sénior", seeded.Title);
        Assert.Null(repository.LastAuditEventType);
    }

    [Theory]
    [InlineData("archived")]
    [InlineData("OPEN")]
    [InlineData("")]
    public void Update_validator_rejects_an_unsupported_status(string status)
    {
        var result = new UpdatePositionValidator().Validate(
            new UpdatePositionCommand(Guid.NewGuid(), "Título", null, null, status, NoFilters, 1));

        Assert.Equal(PositionErrors.StatusInvalid, Assert.Single(result.Errors).ErrorCode);
    }

    [Fact]
    public void Update_validator_requires_a_last_read_version()
    {
        var result = new UpdatePositionValidator().Validate(
            new UpdatePositionCommand(Guid.NewGuid(), "Título", null, null, PositionStatuses.Open, NoFilters, 0));

        Assert.Equal(PositionErrors.VersionInvalid, Assert.Single(result.Errors).ErrorCode);
    }

    // ---- doubles ----

    private sealed class PassThroughSanitizer(Func<string, string>? transform = null) : IRichTextSanitizer
    {
        public List<string> Inputs { get; } = [];

        public string Sanitize(string html, RichTextProfile profile)
        {
            Assert.Equal(RichTextProfile.PositionDescription, profile);
            Inputs.Add(html);
            return transform is null ? html : transform(html);
        }
    }

    private sealed class StubPositionRepository : IPositionRepository
    {
        public List<Position> Items { get; } = [];
        public int Calls { get; private set; }
        public PositionListOptions? LastListOptions { get; private set; }
        public Dictionary<Guid, PositionStageCounts> StageCounts { get; } = [];
        public string? LastAuditEventType { get; private set; }
        public uint? ExpectedVersion { get; private set; }
        public PositionSaveOutcome NextOutcome { get; set; } = PositionSaveOutcome.Saved;
        private readonly List<Position> _pending = [];

        public Position Seed(string title)
        {
            var filters = SearchFilterDocument.Serialize(SearchFilterNormalization.Normalize(null, "Requirements"));
            var position = new Position(Guid.CreateVersion7(), title, "<p>Descripción</p>", "Madrid", filters, 1, DateTimeOffset.UtcNow);
            Items.Add(position);
            return position;
        }

        public Task<PositionPage> ListAsync(PositionListOptions options, CancellationToken cancellationToken)
        {
            Calls++;
            LastListOptions = options;
            var items = Items
                .Where(item => options.Status == "all" || item.Status == options.Status)
                .Select(item =>
                {
                    var counts = StageCounts.GetValueOrDefault(item.Id, new PositionStageCounts(0, 0, 0, 0, 0));
                    var total = counts.New + counts.Shortlisted + counts.Interview + counts.Hired + counts.Rejected;
                    return new PositionSummary(item.Id, item.Title, item.Location, item.Status, item.UpdatedAtUtc, item.Version, total, counts);
                })
                .ToArray();
            return Task.FromResult(new PositionPage(items, options.Page, options.PageSize, items.Length));
        }

        public Task<Position?> FindAsync(Guid id, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(Items.SingleOrDefault(item => item.Id == id));
        }

        public void Add(Position position)
        {
            Calls++;
            _pending.Add(position);
        }

        public void ExpectVersion(Position position, uint version) => ExpectedVersion = version;

        public Task<PositionSaveOutcome> SaveAsync(string auditEventType, CancellationToken cancellationToken)
        {
            Calls++;
            if (NextOutcome == PositionSaveOutcome.Saved)
            {
                Items.AddRange(_pending);
                LastAuditEventType = auditEventType;
            }
            _pending.Clear();
            return Task.FromResult(NextOutcome);
        }

        // Link members belong to PositionCandidateHandlerTests; these handlers never call them.
        public Task<IReadOnlyList<PositionCandidateItem>> ListCandidatesAsync(Guid positionId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<PositionCandidateItem?> FindCandidateItemAsync(Guid positionId, Guid candidateId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<IReadOnlyList<CandidatePositionItem>> ListForCandidateAsync(Guid candidateId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<bool?> IsPositionOpenAsync(Guid positionId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<bool?> IsCandidateActiveAsync(Guid candidateId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<PositionCandidate?> FindLinkAsync(Guid positionId, Guid candidateId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<int> CountLinksAsync(Guid positionId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public void AddLink(PositionCandidate link) => throw new NotSupportedException();
        public void RemoveLink(PositionCandidate link) => throw new NotSupportedException();
        public void ExpectLinkVersion(PositionCandidate link, uint version) => throw new NotSupportedException();
        public Task<PositionSaveOutcome> SaveLinkAsync(string auditEventType, PositionCandidate link, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class Actor(bool authenticated, params string[] permissions) : ICurrentActor
    {
        public static Actor Manager => new(true, Permissions.PositionsRead, Permissions.PositionsManage);
        public static Actor Reader => new(true, Permissions.PositionsRead);
        public static Actor ManageOnly => new(true, Permissions.PositionsManage);
        public static Actor None => new(true, Permissions.CandidatesRead, Permissions.PresetsManage);
        public static Actor Unauthenticated => new(false, Permissions.PositionsRead, Permissions.PositionsManage);

        public string? ExternalKey => authenticated ? "test-actor" : null;
        public Guid? UserId => null;
        public bool IsAuthenticated => authenticated;
        public bool HasPermission(string permission) =>
            authenticated && permissions.Contains(permission, StringComparer.Ordinal);
    }
}

file static class PositionTestMapping
{
    public static PositionResponse ToTestResponse(this Position position) => new(
        position.Id,
        position.Title,
        position.Description,
        position.Location,
        position.Status,
        SearchFilterDocument.Parse(position.Requirements).ToInput(),
        position.CreatedAtUtc,
        position.UpdatedAtUtc,
        position.Version);
}
