using System.Text.Json;
using KeplerTalento.Domain.Candidates;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Features;

/// <summary>
/// KTL-46 design D4. The cases live in <c>Tests/Fixtures/ktl-46/experience-years-cases.json</c>,
/// which the SPA's <c>candidate-period.logic.spec.ts</c> reads too, so the two formulas cannot
/// drift apart.
/// </summary>
public sealed class ExperienceYearsTests
{
    public static TheoryData<string> CaseNames()
    {
        var names = new TheoryData<string>();
        foreach (var item in Cases())
        {
            names.Add(item.Name);
        }
        return names;
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void Years_are_worked_out_from_the_dates(string name)
    {
        var item = Cases().Single(candidate => candidate.Name == name);

        var years = ExperienceYears.From(
            Date(item.StartDate),
            Date(item.EndDate),
            item.IsCurrent,
            DateOnly.Parse(item.Today, System.Globalization.CultureInfo.InvariantCulture));

        Assert.Equal(item.Years, years);
    }

    [Theory]
    [InlineData(-0.1)]
    [InlineData(100.1)]
    [InlineData(3.25)]
    public void A_value_outside_the_range_or_with_two_decimals_is_refused(double years)
    {
        var experience = new CandidateExperience(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "Empresa", "Puesto");

        Assert.Throws<ArgumentOutOfRangeException>(() => experience.SetYearsExperience((decimal)years));
    }

    [Fact]
    public void A_value_with_one_decimal_is_kept()
    {
        var experience = new CandidateExperience(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "Empresa", "Puesto");

        experience.SetYearsExperience(3.5m);

        Assert.Equal(3.5m, experience.YearsExperience);
    }

    private static DateOnly? Date(string? value) =>
        value is null ? null : DateOnly.Parse(value, System.Globalization.CultureInfo.InvariantCulture);

    private static IReadOnlyList<Case> Cases()
    {
        var path = Path.Combine(FindBackendRoot(), "Tests", "Fixtures", "ktl-46", "experience-years-cases.json");
        return JsonSerializer.Deserialize<List<Case>>(
            File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    }

    private static string FindBackendRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "KeplerTalento.slnx")))
            {
                return current.FullName;
            }
            current = current.Parent;
        }
        throw new DirectoryNotFoundException("Could not locate backend solution root.");
    }

    private sealed record Case(string Name, string? StartDate, string? EndDate, bool IsCurrent, string Today, decimal? Years);
}
