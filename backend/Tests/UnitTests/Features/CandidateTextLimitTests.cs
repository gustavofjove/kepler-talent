using KeplerTalento.Application.Features.Candidates;
using KeplerTalento.Domain.Candidates;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Features;

/// <summary>
/// KTL-33 moved candidate text limits from the column widths to the validators. The values must
/// not change; only where they are enforced did.
/// </summary>
public sealed class CandidateTextLimitTests
{
    private static string ValidText(string field, int length) => field switch
    {
        nameof(CreateCandidateCommand.Phone) => new string('1', length),
        nameof(CreateCandidateCommand.Email) => new string('a', length - 12) + "@example.com",
        _ => new string('a', length),
    };

    public static TheoryData<string, int> CandidateFields() => new()
    {
        { nameof(CreateCandidateCommand.FirstName), 120 },
        { nameof(CreateCandidateCommand.LastName), 180 },
        { nameof(CreateCandidateCommand.Phone), 40 },
        { nameof(CreateCandidateCommand.Email), 255 },
        { nameof(CreateCandidateCommand.Location), 160 },
        { nameof(CreateCandidateCommand.Province), 120 },
        { nameof(CreateCandidateCommand.Country), 120 },
        { nameof(CreateCandidateCommand.Source), 120 },
    };

    [Theory]
    [MemberData(nameof(CandidateFields))]
    public async Task Create_accepts_a_field_at_its_limit_and_refuses_one_character_more(string field, int limit)
    {
        var validator = new CreateCandidateValidator();

        var atLimit = await validator.ValidateAsync(Create(field, ValidText(field, limit)));
        var overLimit = await validator.ValidateAsync(Create(field, ValidText(field, limit + 1)));

        Assert.True(atLimit.IsValid);
        var error = Assert.Single(overLimit.Errors);
        Assert.Equal(CandidateErrors.FieldTooLong, error.ErrorCode);
        Assert.Equal(field, error.PropertyName);
    }

    [Theory]
    [MemberData(nameof(CandidateFields))]
    public async Task Update_applies_the_same_limits(string field, int limit)
    {
        var overLimit = await new UpdateCandidateValidator().ValidateAsync(Update(field, ValidText(field, limit + 1)));

        Assert.Equal(CandidateErrors.FieldTooLong, Assert.Single(overLimit.Errors).ErrorCode);
    }

    [Fact]
    public async Task Notes_stay_unbounded_as_they_were()
    {
        var result = await new CreateCandidateValidator().ValidateAsync(Create(nameof(CreateCandidateCommand.Notes), new string('a', 20_000)));

        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task Relation_text_limits_apply_per_item()
    {
        var languages = await new SetCandidateLanguagesValidator().ValidateAsync(new SetCandidateLanguagesCommand(
            Guid.NewGuid(),
            [new CandidateLanguageInput(null, "Inglés", "B2", new string('c', 160), null), new CandidateLanguageInput(null, "Francés", "B2", new string('c', 161), null)],
            1));
        var education = await new SetCandidateEducationValidator().ValidateAsync(new SetCandidateEducationCommand(
            Guid.NewGuid(),
            [new CandidateEducationInput(null, "Grado", new string('d', 201), new string('s', 201), new string('i', 201), "Finalizado", null, null)],
            1));
        var experience = await new SetCandidateExperienceValidator().ValidateAsync(new SetCandidateExperienceCommand(
            Guid.NewGuid(),
            [new CandidateExperienceInput(null, new string('c', 201), new string('p', 200), "TIC", null, null, null, null, false, null)],
            1));

        Assert.Single(languages.Errors);
        Assert.Equal(3, education.Errors.Count);
        Assert.Single(experience.Errors);
        Assert.All(
            languages.Errors.Concat(education.Errors).Concat(experience.Errors),
            error => Assert.Equal(CandidateErrors.FieldTooLong, error.ErrorCode));
    }

    [Fact]
    public void The_limits_are_the_former_column_widths()
    {
        Assert.Equal(200, CandidateTextLimits.Degree);
        Assert.Equal(200, CandidateTextLimits.Specialty);
        Assert.Equal(200, CandidateTextLimits.Institution);
        Assert.Equal(200, CandidateTextLimits.Company);
        Assert.Equal(200, CandidateTextLimits.Position);
        Assert.Equal(160, CandidateTextLimits.Certification);
        Assert.Equal(255, CandidateTextLimits.DocumentFileName);
    }

    [Fact]
    public void Experience_functions_take_the_position_description_limit()
    {
        Assert.Equal(20_000, CandidateTextLimits.Functions);
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData(0.0, true)]
    [InlineData(3.5, true)]
    [InlineData(100.0, true)]
    [InlineData(-0.1, false)]
    [InlineData(100.1, false)]
    [InlineData(2.25, false)]
    public async Task Experience_years_hold_one_decimal_from_0_to_100(double? years, bool valid)
    {
        var result = await new SetCandidateExperienceValidator().ValidateAsync(new SetCandidateExperienceCommand(
            Guid.NewGuid(),
            [new CandidateExperienceInput(null, "Empresa", "Puesto", "TIC", null, null, null, (decimal?)years, false, null)],
            1));

        Assert.Equal(valid, result.IsValid);
        if (!valid)
        {
            var error = Assert.Single(result.Errors);
            Assert.Equal(CandidateErrors.ExperienceYearsInvalid, error.ErrorCode);
            Assert.DoesNotContain(years!.Value.ToString(System.Globalization.CultureInfo.InvariantCulture), error.ErrorMessage, StringComparison.Ordinal);
        }
    }

    private static CreateCandidateCommand Create(string field, string value) => new(
        field == nameof(CreateCandidateCommand.FirstName) ? value : "Ana",
        field == nameof(CreateCandidateCommand.LastName) ? value : "López",
        field == nameof(CreateCandidateCommand.Phone) ? value : "",
        field == nameof(CreateCandidateCommand.Email) ? value : "",
        field == nameof(CreateCandidateCommand.Location) ? value : "",
        field == nameof(CreateCandidateCommand.Province) ? value : "",
        field == nameof(CreateCandidateCommand.Country) ? value : "",
        field == nameof(CreateCandidateCommand.Source) ? value : "",
        field == nameof(CreateCandidateCommand.Notes) ? value : "",
        null,
        null,
        null);

    private static UpdateCandidateCommand Update(string field, string value)
    {
        var create = Create(field, value);
        return new UpdateCandidateCommand(
            Guid.NewGuid(), create.FirstName, create.LastName, create.Phone, create.Email, create.Location,
            create.Province, create.Country, create.Source, create.Notes,
            null, null, null, 1);
    }
}
