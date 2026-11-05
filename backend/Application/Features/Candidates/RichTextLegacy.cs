using System.Text.RegularExpressions;

namespace KeplerTalento.Application.Features.Candidates;

/// <summary>
/// The read-side guard for experience functions (KTL-46 design D3): only the sanitizer's own
/// canonical output reaches the browser as markup.
/// </summary>
/// <remarks>
/// Functions written through the API are sanitised before they are stored. Those loaded from
/// Access by <c>ktl-migrate</c> are plain text the sanitizer never saw. Rather than parse every
/// value again on every read, a value is passed through only when it already has the canonical
/// form (attribute-less allowed tags, every other <c>&lt;</c> and <c>&gt;</c> encoded). Anything
/// else is treated as text, so legacy markup is shown, never interpreted.
/// </remarks>
public static partial class RichTextLegacy
{
    public static string? ToSafeHtml(string? stored)
    {
        if (string.IsNullOrWhiteSpace(stored))
        {
            return null;
        }
        if (IsCanonical(stored))
        {
            return stored;
        }
        var paragraphs = stored
            .Split(["\r\n", "\n", "\r"], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(line => $"<p>{Encode(line)}</p>");
        return string.Concat(paragraphs);
    }

    private static bool IsCanonical(string value)
    {
        if (!BlockTag().IsMatch(value))
        {
            return false;
        }
        var text = CanonicalTag().Replace(value, string.Empty);
        return !text.Contains('<') && !text.Contains('>');
    }

    private static string Encode(string text) => text
        .Replace("&", "&amp;", StringComparison.Ordinal)
        .Replace("<", "&lt;", StringComparison.Ordinal)
        .Replace(">", "&gt;", StringComparison.Ordinal);

    [GeneratedRegex("<(p|ul|ol)>", RegexOptions.CultureInvariant)]
    private static partial Regex BlockTag();

    // `u` stays readable: the sanitizer no longer keeps it, but a few values were saved with it
    // before underline was dropped, and the tag is inert.
    [GeneratedRegex("</?(p|br|strong|em|u|ul|ol|li)>", RegexOptions.CultureInvariant)]
    private static partial Regex CanonicalTag();
}
