namespace KeplerTalento.Domain.Candidates;

/// <summary>
/// The years an experience spans, worked out from its dates (KTL-46 design D4). The SPA mirrors
/// this formula in <c>candidate-period.logic.ts</c>; both are tested on the same cases.
/// </summary>
/// <remarks>
/// Experience dates are entered as a month and a year, so only those count: the day of a date,
/// including one migrated from Access, is ignored.
/// </remarks>
public static class ExperienceYears
{
    /// <summary>The largest value an experience may hold.</summary>
    public const decimal Maximum = 100m;

    /// <summary>
    /// The months from the start month to the end month, both included, divided by 12 and rounded
    /// to one decimal half away from zero; a current role runs to <paramref name="today"/>'s month.
    /// <see langword="null"/> when there is no start date, neither an end date nor a current role,
    /// or the end month is before the start month.
    /// </summary>
    public static decimal? From(DateOnly? startDate, DateOnly? endDate, bool isCurrent, DateOnly today)
    {
        if (startDate is not { } start)
        {
            return null;
        }
        DateOnly? until = isCurrent ? today : endDate;
        if (until is not { } end)
        {
            return null;
        }
        var months = MonthNumber(end) - MonthNumber(start) + 1;
        if (months < 1)
        {
            return null;
        }
        var years = decimal.Round(months / 12m, 1, MidpointRounding.AwayFromZero);
        return Math.Min(years, Maximum);
    }

    private static int MonthNumber(DateOnly date) => date.Year * 12 + date.Month;
}
