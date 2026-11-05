namespace KeplerTalento.Domain.Candidates;

/// <summary>
/// Plaintext length limits for candidate text (KTL-33).
/// </summary>
/// <remarks>
/// These were the <c>varchar</c> widths of the columns before they became encrypted
/// <c>text</c>. The values are unchanged; only where they are enforced moved: validators
/// refuse an overlong value with a stable code, and the encryption converter refuses to store
/// one from any writer that skipped them. Columns that were unbounded stay unbounded.
/// </remarks>
public static class CandidateTextLimits
{
    public const int FirstName = 120;
    public const int LastName = 180;
    public const int Phone = 40;
    public const int Email = 255;
    public const int Location = 160;
    public const int Province = 120;
    public const int Country = 120;
    public const int Source = 120;

    public const int Degree = 200;
    public const int Specialty = 200;
    public const int Institution = 200;
    public const int Company = 200;
    public const int Position = 200;
    public const int Certification = 160;

    /// <summary>
    /// Sanitised rich text of an experience's functions (KTL-46). Checked by the API only: the
    /// column was unbounded and stays unbounded for the operator migration tool.
    /// </summary>
    public const int Functions = 20_000;

    public const int DocumentFileName = 255;
}
