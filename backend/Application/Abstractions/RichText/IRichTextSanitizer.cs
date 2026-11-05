namespace KeplerTalento.Application.Abstractions.RichText;

/// <summary>The allowlist a rich-text value is reduced to before it is stored.</summary>
public enum RichTextProfile
{
    /// <summary>Position descriptions (KTL-15): paragraphs, line breaks, bold, italic and lists.</summary>
    PositionDescription,

    /// <summary>
    /// Experience functions (KTL-46). The same allowlist as positions today; a profile of its own
    /// so the two can differ without touching either caller.
    /// </summary>
    ExperienceFunctions,
}

/// <summary>
/// Reduces editor HTML to the elements a profile allows, with no attribute, style or scheme, and
/// with the editor's equivalent tags canonicalised (KTL-46 design D2).
/// </summary>
public interface IRichTextSanitizer
{
    string Sanitize(string html, RichTextProfile profile);
}
