using KeplerTalento.Application.Import.Rows;
using KeplerTalento.Domain.Candidates;
using KeplerTalento.Tools.DataMigration.Export;
using KeplerTalento.Tools.DataMigration.Loading;

namespace KeplerTalento.Tools.DataMigration.Validation;

/// <summary>
/// Per-row rules from the export contract, applied to the whole set in one pass so an
/// operator sees every problem at once rather than one run at a time.
/// </summary>
public sealed class RowValidator
{
    public IReadOnlyList<RowProblem> Validate(ExportSet exportSet)
    {
        var problems = new List<RowProblem>();
        var candidateKeys = ValidateCandidates(exportSet, problems);
        var rejectedCandidates = problems
            .Where(problem => problem.Entity == MigrationEntities.Candidate)
            .Select(problem => problem.SourceKey)
            .ToHashSet(StringComparer.Ordinal);

        ValidateChildren(exportSet, candidateKeys, rejectedCandidates, problems);
        return problems;
    }

    private static HashSet<string> ValidateCandidates(ExportSet exportSet, List<RowProblem> problems)
    {
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in exportSet[ExportContract.Candidates].Rows)
        {
            var key = row[ExportContract.SourceKeyColumn].Trim();
            keys.Add(key);
            void Problem(string field, string reason) =>
                problems.Add(new RowProblem(MigrationEntities.Candidate, key, field, reason));

            foreach (var required in new[] { "FirstName", "LastName" })
            {
                if (row.IsEmpty(required))
                {
                    Problem(required, ReasonCodes.RequiredFieldMissing);
                }
            }

            if (!row.IsEmpty("Email") && !FieldParsers.IsEmail(row["Email"]))
            {
                Problem("Email", ReasonCodes.EmailInvalid);
            }

            if (!LegacyCandidateStatuses.IsKnown(row["Status"].Trim()))
            {
                Problem("Status", ReasonCodes.StatusUnknown);
            }

            foreach (var dateField in new[] { "ReceivedAt", "ConsentAt", "ReviewDueAt", "DeletedAt" })
            {
                if (!FieldParsers.TryDate(row[dateField], out _))
                {
                    Problem(dateField, ReasonCodes.DateInvalid);
                }
            }

            // Consent is the one absence that rejects a row. A candidate whose consent state
            // cannot be established must not be loaded with a substituted date.
            if (FieldParsers.TryDate(row["ConsentAt"], out var consentAt) && consentAt is null)
            {
                Problem("ConsentAt", ReasonCodes.ConsentMissing);
            }

            if (!FieldParsers.TryBoolean(row["IsActive"], out var isActive))
            {
                Problem("IsActive", ReasonCodes.BooleanInvalid);
                continue;
            }

            // Logical removal must arrive as logical state: an inactive row carries the
            // moment it was removed, an active one carries none.
            if (FieldParsers.TryDate(row["DeletedAt"], out var deletedAt)
                && isActive == (deletedAt is not null))
            {
                Problem("DeletedAt", ReasonCodes.DeletedAtInconsistent);
            }
        }
        return keys;
    }

    private static void ValidateChildren(
        ExportSet exportSet,
        HashSet<string> candidateKeys,
        HashSet<string> rejectedCandidates,
        List<RowProblem> problems)
    {
        foreach (var file in ExportContract.ChildFiles)
        {
            var entity = EntityOf(file);
            foreach (var row in exportSet[file].Rows)
            {
                var key = row[ExportContract.SourceKeyColumn].Trim();
                var candidateKey = row[ExportContract.CandidateSourceKeyColumn].Trim();
                void Problem(string field, string reason) =>
                    problems.Add(new RowProblem(entity, key, field, reason));

                if (!candidateKeys.Contains(candidateKey))
                {
                    Problem(ExportContract.CandidateSourceKeyColumn, ReasonCodes.UnknownCandidate);
                    continue;
                }

                // A child of a rejected candidate is not itself wrong; it simply has nowhere
                // to go. Reporting it separately keeps the cause legible.
                if (rejectedCandidates.Contains(candidateKey))
                {
                    Problem(ExportContract.CandidateSourceKeyColumn, ReasonCodes.CandidateRejected);
                    continue;
                }

                ValidateChildFields(file, row, Problem);
            }
        }
    }

    private static void ValidateChildFields(string file, CsvRow row, Action<string, string> problem)
    {
        switch (file)
        {
            case ExportContract.Programs:
                if (!FieldParsers.TryInteger(row["YearsExperience"], out _))
                {
                    problem("YearsExperience", ReasonCodes.IntegerInvalid);
                }
                break;

            case ExportContract.Languages:
            case ExportContract.Skills:
                // Both carry only catalog references and free-text notes. Their reference
                // values are checked by the resolver, not here.
                break;

            case ExportContract.Education:
                foreach (var required in new[] { "Degree", "Institution" })
                {
                    if (row.IsEmpty(required))
                    {
                        problem(required, ReasonCodes.RequiredFieldMissing);
                    }
                }
                if (!FieldParsers.TryInteger(row["EndYear"], out var endYear))
                {
                    problem("EndYear", ReasonCodes.IntegerInvalid);
                }
                else if (endYear is < 1900 or > 2200)
                {
                    problem("EndYear", ReasonCodes.IntegerInvalid);
                }
                break;

            case ExportContract.Experience:
                foreach (var required in new[] { "Company", "Position" })
                {
                    if (row.IsEmpty(required))
                    {
                        problem(required, ReasonCodes.RequiredFieldMissing);
                    }
                }
                if (!FieldParsers.TryInteger(row["YearsExperience"], out var experienceYears))
                {
                    problem("YearsExperience", ReasonCodes.IntegerInvalid);
                }
                else if (experienceYears is < 0 or > (int)ExperienceYears.Maximum)
                {
                    // KTL-46: the range the domain enforces, reported here rather than failing the load.
                    problem("YearsExperience", ReasonCodes.IntegerInvalid);
                }
                ValidateExperiencePeriod(row, problem);
                break;

            case ExportContract.Documents:
                ValidateDocumentRow(row, problem);
                break;

            default:
                break;
        }
    }

    private static void ValidateExperiencePeriod(CsvRow row, Action<string, string> problem)
    {
        var startParsed = FieldParsers.TryDate(row["StartDate"], out var startDate);
        var endParsed = FieldParsers.TryDate(row["EndDate"], out var endDate);
        if (!startParsed)
        {
            problem("StartDate", ReasonCodes.DateInvalid);
        }
        if (!endParsed)
        {
            problem("EndDate", ReasonCodes.DateInvalid);
        }
        if (!FieldParsers.TryBoolean(row["IsCurrent"], out var isCurrent))
        {
            problem("IsCurrent", ReasonCodes.BooleanInvalid);
            return;
        }
        if (!startParsed || !endParsed)
        {
            return;
        }
        if (startDate is not null && endDate is not null && endDate < startDate)
        {
            problem("EndDate", ReasonCodes.PeriodInconsistent);
        }
        if (isCurrent && endDate is not null)
        {
            problem("EndDate", ReasonCodes.PeriodInconsistent);
        }
    }

    private static void ValidateDocumentRow(CsvRow row, Action<string, string> problem)
    {
        foreach (var required in new[] { "RelativePath", "OriginalFileName", "ContentType", "Sha256" })
        {
            if (row.IsEmpty(required))
            {
                problem(required, ReasonCodes.RequiredFieldMissing);
            }
        }
        if (!row.IsEmpty("RelativePath") && !FieldParsers.IsSafeRelativePath(row["RelativePath"]))
        {
            problem("RelativePath", ReasonCodes.DocumentPathUnsafe);
        }
        var hash = row["Sha256"].Trim();
        if (hash.Length > 0 && (hash.Length != 64 || !hash.All(Uri.IsHexDigit)))
        {
            problem("Sha256", ReasonCodes.RequiredFieldMissing);
        }
        if (!FieldParsers.TryBoolean(row["IsPrimary"], out _))
        {
            problem("IsPrimary", ReasonCodes.BooleanInvalid);
        }
    }

    private static string EntityOf(string file) => file switch
    {
        ExportContract.Languages => MigrationEntities.Language,
        ExportContract.Programs => MigrationEntities.Program,
        ExportContract.Education => MigrationEntities.Education,
        ExportContract.Experience => MigrationEntities.Experience,
        ExportContract.Skills => MigrationEntities.Skill,
        ExportContract.Documents => MigrationEntities.Document,
        _ => throw new ArgumentOutOfRangeException(nameof(file)),
    };
}
