using System.Text;
using KeplerTalento.Application.Import.Rows;
using KeplerTalento.Tools.DataMigration.Export;
using KeplerTalento.Tools.DataMigration.Validation;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Tools;

public sealed class RowValidatorTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"ktl-validate-{Guid.NewGuid():N}");

    private const string CleanCandidate =
        "C-001,Nombre,Apellido,+34 600 000 001,uno@example.invalid,Ciudad,Provincia,España,"
        + "Inmediata,available,Email,Notas,2026-01-10,2026-01-10,2028-01-10,true,";

    public RowValidatorTests()
    {
        Directory.CreateDirectory(_root);
        Directory.CreateDirectory(Path.Combine(_root, ExportContract.FilesDirectory));
        foreach (var file in ExportContract.Files)
        {
            Write(file);
        }
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private void Write(string file, params string[] rows) =>
        File.WriteAllText(
            Path.Combine(_root, file),
            string.Join(',', ExportContract.Columns[file]) + "\n"
                + (rows.Length == 0 ? string.Empty : string.Join('\n', rows) + "\n"),
            new UTF8Encoding(false));

    private IReadOnlyList<RowProblem> Validate()
    {
        Assert.True(new ExportReader().TryRead(_root, out var exportSet, out var structural),
            string.Join("; ", structural));
        return new RowValidator().Validate(exportSet);
    }

    [Fact]
    public void A_clean_candidate_produces_no_problems()
    {
        Write(ExportContract.Candidates, CleanCandidate);

        Assert.Empty(Validate());
    }

    [Fact]
    public void A_candidate_without_a_consent_date_is_rejected()
    {
        Write(ExportContract.Candidates, CleanCandidate.Replace(",2026-01-10,2028-01-10", ",,2028-01-10", StringComparison.Ordinal));

        var problem = Assert.Single(Validate());
        Assert.Equal("ConsentAt", problem.Field);
        Assert.Equal(ReasonCodes.ConsentMissing, problem.ReasonCode);
    }

    [Fact]
    public void A_malformed_email_is_rejected()
    {
        Write(ExportContract.Candidates, CleanCandidate.Replace("uno@example.invalid", "no-es-un-email", StringComparison.Ordinal));

        var problem = Assert.Single(Validate());
        Assert.Equal(ReasonCodes.EmailInvalid, problem.ReasonCode);
    }

    [Fact]
    public void An_absent_email_is_accepted_because_the_contract_allows_it()
    {
        Write(ExportContract.Candidates, CleanCandidate.Replace("uno@example.invalid", string.Empty, StringComparison.Ordinal));

        Assert.Empty(Validate());
    }

    [Fact]
    public void A_status_outside_the_five_codes_is_rejected_rather_than_guessed()
    {
        Write(ExportContract.Candidates, CleanCandidate.Replace(",available,", ",Disponible,", StringComparison.Ordinal));

        var problem = Assert.Single(Validate());
        Assert.Equal(ReasonCodes.StatusUnknown, problem.ReasonCode);
    }

    [Fact]
    public void An_inactive_candidate_must_carry_a_removal_date()
    {
        Write(ExportContract.Candidates, CleanCandidate.Replace(",true,", ",false,", StringComparison.Ordinal));

        var problem = Assert.Single(Validate());
        Assert.Equal(ReasonCodes.DeletedAtInconsistent, problem.ReasonCode);
    }

    [Fact]
    public void An_active_candidate_must_not_carry_a_removal_date()
    {
        Write(ExportContract.Candidates, CleanCandidate + "2026-02-01");

        var problem = Assert.Single(Validate());
        Assert.Equal(ReasonCodes.DeletedAtInconsistent, problem.ReasonCode);
    }

    [Fact]
    public void A_logically_removed_candidate_with_its_date_is_accepted()
    {
        Write(ExportContract.Candidates, CleanCandidate.Replace(",true,", ",false,", StringComparison.Ordinal) + "2026-02-01");

        Assert.Empty(Validate());
    }

    [Theory]
    [InlineData("NULL")]
    [InlineData("#N/A")]
    public void A_value_that_only_looks_absent_is_rejected_rather_than_treated_as_absent(string falseEmpty)
    {
        Write(ExportContract.Candidates, CleanCandidate.Replace(",2028-01-10,", $",{falseEmpty},", StringComparison.Ordinal));

        var problem = Assert.Single(Validate());
        Assert.Equal("ReviewDueAt", problem.Field);
        Assert.Equal(ReasonCodes.DateInvalid, problem.ReasonCode);
    }

    [Fact]
    public void A_child_row_pointing_at_no_candidate_is_reported()
    {
        Write(ExportContract.Candidates, CleanCandidate);
        Write(ExportContract.Skills, "S-1,C-999,Análisis,Alto,");

        var problem = Assert.Single(Validate());
        Assert.Equal(ReasonCodes.UnknownCandidate, problem.ReasonCode);
    }

    [Fact]
    public void A_child_of_a_rejected_candidate_is_reported_with_its_own_reason()
    {
        // Not itself wrong — it simply has nowhere to go. Keeping the cause legible matters
        // when an operator is deciding what to fix.
        Write(ExportContract.Candidates, CleanCandidate.Replace("uno@example.invalid", "roto", StringComparison.Ordinal));
        Write(ExportContract.Skills, "S-1,C-001,Análisis,Alto,");

        var problems = Validate();

        Assert.Contains(problems, problem => problem.ReasonCode == ReasonCodes.EmailInvalid);
        Assert.Contains(problems, problem => problem.ReasonCode == ReasonCodes.CandidateRejected);
    }

    [Fact]
    public void Every_problem_is_reported_in_one_pass_rather_than_stopping_at_the_first()
    {
        Write(
            ExportContract.Candidates,
            CleanCandidate.Replace("uno@example.invalid", "roto", StringComparison.Ordinal)
                .Replace(",available,", ",Disponible,", StringComparison.Ordinal));

        var problems = Validate();

        Assert.Contains(problems, problem => problem.ReasonCode == ReasonCodes.EmailInvalid);
        Assert.Contains(problems, problem => problem.ReasonCode == ReasonCodes.StatusUnknown);
    }

    [Fact]
    public void An_experience_ending_before_it_starts_is_rejected()
    {
        Write(ExportContract.Candidates, CleanCandidate);
        Write(ExportContract.Experience, "X-1,C-001,Empresa,Puesto,Servicios,,2024-01-01,2020-01-01,1,false,");

        var problem = Assert.Single(Validate());
        Assert.Equal(ReasonCodes.PeriodInconsistent, problem.ReasonCode);
    }

    [Fact]
    public void A_current_experience_cannot_have_an_end_date()
    {
        Write(ExportContract.Candidates, CleanCandidate);
        Write(ExportContract.Experience, "X-1,C-001,Empresa,Puesto,Servicios,,2020-01-01,2024-01-01,1,true,");

        var problem = Assert.Single(Validate());
        Assert.Equal(ReasonCodes.PeriodInconsistent, problem.ReasonCode);
    }

    [Theory]
    [InlineData("-1")]
    [InlineData("101")]
    public void Experience_years_outside_the_domain_range_are_rejected(string years)
    {
        Write(ExportContract.Candidates, CleanCandidate);
        Write(ExportContract.Experience, $"X-1,C-001,Empresa,Puesto,Servicios,,,,{years},false,");

        var problem = Assert.Single(Validate());
        Assert.Equal(ReasonCodes.IntegerInvalid, problem.ReasonCode);
        Assert.Equal("YearsExperience", problem.Field);
    }

    [Fact]
    public void Education_requires_a_degree_and_an_institution()
    {
        Write(ExportContract.Candidates, CleanCandidate);
        Write(ExportContract.Education, "E-1,C-001,Grado,,,,Finalizada,2020,");

        var problems = Validate();

        Assert.Equal(2, problems.Count);
        Assert.All(problems, problem => Assert.Equal(ReasonCodes.RequiredFieldMissing, problem.ReasonCode));
    }

    [Theory]
    [InlineData("../../etc/passwd")]
    [InlineData("/etc/passwd")]
    [InlineData("C:\\Windows\\notepad.exe")]
    [InlineData("\\\\server\\share\\cv.txt")]
    public void A_manifest_path_that_escapes_the_export_is_rejected(string path)
    {
        Write(ExportContract.Candidates, CleanCandidate);
        Write(ExportContract.Documents, $"D-1,C-001,{path},CV,cv.txt,text/plain,{new string('a', 64)},true");

        var problems = Validate();

        Assert.Contains(problems, problem => problem.ReasonCode == ReasonCodes.DocumentPathUnsafe);
    }

    [Fact]
    public void A_problem_never_carries_the_value_that_caused_it()
    {
        // The type has no field for it, which is the control. This asserts the rendering
        // does not reintroduce one by another route.
        Write(ExportContract.Candidates, CleanCandidate.Replace("uno@example.invalid", "SECRETO-FILTRADO", StringComparison.Ordinal));

        var problem = Assert.Single(Validate());

        Assert.DoesNotContain("SECRETO-FILTRADO", problem.ToString(), StringComparison.Ordinal);
        Assert.Equal("C-001", problem.SourceKey);
        Assert.Equal("Email", problem.Field);
    }
}
