using System.Globalization;
using FluentValidation;
using KeplerTalento.Application.Abstractions.Import;
using KeplerTalento.Application.Features.Candidates;
using KeplerTalento.Application.Import.Rows;
using KeplerTalento.Domain.Candidates;
using KeplerTalento.Domain.Catalogs;
using KeplerTalento.Domain.Import;

namespace KeplerTalento.Application.Import;

/// <summary>A language pair resolved onto catalog entries.</summary>
public sealed record ImportedLanguage(Guid LanguageId, Guid LevelId);

/// <summary>
/// What one row would become. Exactly one of three outcomes; a loadable row carries the create
/// command and its resolved relations, a rejected or skipped row carries a field and a code.
/// </summary>
public sealed record RowEvaluation(
    int RowNumber,
    RowOutcome Outcome,
    string? Field,
    string? ReasonCode,
    CreateCandidateCommand? Command,
    IReadOnlyList<ImportedLanguage> Languages)
{
    public RowProblem? Problem => Outcome == RowOutcome.Loaded
        ? null
        : new RowProblem(CandidateImportContract.Entity, RowNumber.ToString(CultureInfo.InvariantCulture), Field ?? string.Empty, ReasonCode!);
}

/// <summary>
/// The one definition of a valid import row, used by the dry run and by the commit alike so the
/// two can never disagree about what a row is.
/// </summary>
/// <remarks>
/// <para>
/// Rules run in a fixed order and the first failure wins, so a row gets one explicit outcome and
/// one reason. The candidate create validator runs last, as a backstop: whatever a direct create
/// refuses, an import refuses too, even if a check here missed it.
/// </para>
/// <para>
/// Duplicates are decided last and only among rows that are otherwise loadable. A broken row
/// does not "claim" an email address, so a later, correct row for the same person still loads.
/// The duplicate rule (design D5): two rows describe the same person when their email addresses
/// are equal after trimming and lower-casing; a row whose address a candidate already holds is
/// a duplicate of that candidate.
/// </para>
/// <para>
/// Nothing here logs, and no evaluation carries a value from the row outside the command a
/// loadable row needs to become a candidate.
/// </para>
/// </remarks>
public sealed class CandidateImportRowEvaluator(
    CatalogResolver resolver,
    IReadOnlySet<string> existingEmails)
{
    private static readonly CreateCandidateValidator CandidateRules = new();
    private readonly HashSet<string> _emailsInFile = new(StringComparer.Ordinal);

    public static string NormalizeEmail(string? value) => (value ?? string.Empty).Trim().ToLowerInvariant();

    public RowEvaluation Evaluate(ImportFileRow row)
    {
        var rowNumber = row.RowNumber;
        RowEvaluation Reject(string field, string code) =>
            new(rowNumber, RowOutcome.Rejected, field, code, null, []);

        if (!row.ShapeValid)
        {
            return Reject("row", ImportReasonCodes.RowShapeInvalid);
        }

        foreach (var required in CandidateImportContract.RequiredColumns)
        {
            if (string.IsNullOrWhiteSpace(row[required]))
            {
                return Reject(required, ImportReasonCodes.FieldRequired);
            }
        }

        foreach (var (column, maximum) in CandidateImportContract.MaximumLengths)
        {
            var value = column == CandidateImportContract.Notes ? row[column] : row[column].Trim();
            if (value.Length > maximum)
            {
                return Reject(column, ImportReasonCodes.FieldTooLong);
            }
        }

        var email = row[CandidateImportContract.Email].Trim();
        if (!IsEmail(email))
        {
            return Reject(CandidateImportContract.Email, ImportReasonCodes.EmailInvalid);
        }

        foreach (var column in new[] { CandidateImportContract.ReceivedAt, CandidateImportContract.ConsentAt, CandidateImportContract.ReviewDueAt })
        {
            if (!IsContractDate(row[column]))
            {
                return Reject(column, ImportReasonCodes.DateInvalid);
            }
        }

        var languages = new List<ImportedLanguage>();
        var languageFailure = ResolveLanguages(row[CandidateImportContract.Languages], languages);
        if (languageFailure is not null)
        {
            return Reject(CandidateImportContract.Languages, languageFailure);
        }

        var command = new CreateCandidateCommand(
            row[CandidateImportContract.FirstName].Trim(),
            row[CandidateImportContract.LastName].Trim(),
            row[CandidateImportContract.Phone].Trim(),
            email,
            row[CandidateImportContract.Location].Trim(),
            row[CandidateImportContract.Province].Trim(),
            row[CandidateImportContract.Country].Trim(),
            row[CandidateImportContract.Source].Trim(),
            row[CandidateImportContract.Notes],
            row[CandidateImportContract.ReceivedAt].Trim(),
            row[CandidateImportContract.ConsentAt].Trim(),
            row[CandidateImportContract.ReviewDueAt].Trim());

        var refusal = CandidateRules.Validate(command).Errors.FirstOrDefault();
        if (refusal is not null)
        {
            return Reject(ColumnOf(refusal.PropertyName), ImportReasonCodes.CandidateRefused);
        }

        var normalizedEmail = NormalizeEmail(email);
        if (!_emailsInFile.Add(normalizedEmail) || existingEmails.Contains(normalizedEmail))
        {
            return new RowEvaluation(
                rowNumber,
                RowOutcome.Skipped,
                CandidateImportContract.Email,
                ImportReasonCodes.CandidateDuplicate,
                null,
                []);
        }

        return new RowEvaluation(rowNumber, RowOutcome.Loaded, null, null, command, languages);
    }

    /// <summary>
    /// Marks an address as already taken by an earlier row, without evaluating that row. A
    /// resumed commit calls this for rows it already loaded, so the rows after them are judged
    /// exactly as they were in the uninterrupted run.
    /// </summary>
    public void RecordEarlierLoad(string normalizedEmail) => _emailsInFile.Add(normalizedEmail);

    private string? ResolveLanguages(string raw, List<ImportedLanguage> languages)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }
        string? failure = null;
        var seen = new HashSet<Guid>();
        foreach (var entry in raw.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = entry.Split(':', StringSplitOptions.TrimEntries);
            if (parts.Length != 2 || parts[0].Length == 0 || parts[1].Length == 0)
            {
                return ImportReasonCodes.ReferenceMalformed;
            }
            // Both halves are resolved even after a failure, so every unresolved value in the row
            // reaches the report rather than only the first.
            var language = resolver.Resolve(CatalogFamilies.Language, parts[0]);
            var level = resolver.Resolve(CatalogFamilies.LanguageLevel, parts[1]);
            if (!language.Resolved || !level.Resolved)
            {
                failure ??= ImportReasonCodes.ReferenceUnresolved;
                continue;
            }
            if (!seen.Add(language.CatalogItemId!.Value))
            {
                failure ??= ImportReasonCodes.ReferenceDuplicate;
                continue;
            }
            languages.Add(new ImportedLanguage(language.CatalogItemId.Value, level.CatalogItemId!.Value));
        }
        return failure;
    }

    /// <summary>
    /// The import contract's date encoding is ISO <c>yyyy-MM-dd</c> exactly. Stricter than the
    /// create endpoint's parser on purpose: a file written with a locale date format would
    /// otherwise have its day and month silently swapped.
    /// </summary>
    private static bool IsContractDate(string value)
    {
        var trimmed = value.Trim();
        return trimmed.Length == 0
            || DateOnly.TryParseExact(trimmed, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }

    /// <summary>
    /// Shape only, as the migration's check: text that cannot be an address is refused, an
    /// unusual but real one is not.
    /// </summary>
    private static bool IsEmail(string trimmed)
    {
        var at = trimmed.IndexOf('@', StringComparison.Ordinal);
        if (at <= 0 || at != trimmed.LastIndexOf('@') || at == trimmed.Length - 1)
        {
            return false;
        }
        var domain = trimmed[(at + 1)..];
        return domain.Contains('.', StringComparison.Ordinal)
            && !domain.StartsWith('.')
            && !domain.EndsWith('.')
            && !trimmed.Any(char.IsWhiteSpace);
    }

    private static string ColumnOf(string propertyName) => propertyName switch
    {
        nameof(CreateCandidateCommand.Phone) => CandidateImportContract.Phone,
        nameof(CreateCandidateCommand.Email) => CandidateImportContract.Email,
        nameof(CreateCandidateCommand.FirstName) => CandidateImportContract.FirstName,
        nameof(CreateCandidateCommand.LastName) => CandidateImportContract.LastName,
        nameof(CreateCandidateCommand.ReceivedAt) => CandidateImportContract.ReceivedAt,
        nameof(CreateCandidateCommand.ConsentAt) => CandidateImportContract.ConsentAt,
        nameof(CreateCandidateCommand.ReviewDueAt) => CandidateImportContract.ReviewDueAt,
        _ => "row",
    };
}
