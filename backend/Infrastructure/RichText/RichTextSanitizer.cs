using Ganss.Xss;
using KeplerTalento.Application.Abstractions.RichText;

namespace KeplerTalento.Infrastructure.RichText;

public sealed class RichTextSanitizer : IRichTextSanitizer
{
    // `u` is parsed only to be unwrapped below: neither profile keeps underline, but a disallowed
    // element is dropped with its text, and Lexical underlines on Ctrl+U even without a button.
    private static readonly string[] ParserTags =
        ["p", "br", "strong", "em", "ul", "ol", "li", "span", "b", "i", "u"];

    public string Sanitize(string html, RichTextProfile profile)
    {
        if (!Enum.IsDefined(profile))
        {
            throw new ArgumentOutOfRangeException(nameof(profile));
        }
        var sanitizer = new HtmlSanitizer();
        sanitizer.AllowedTags.Clear();
        sanitizer.AllowedAttributes.Clear();
        sanitizer.AllowedCssProperties.Clear();
        sanitizer.AllowedSchemes.Clear();
        foreach (var tag in ParserTags) sanitizer.AllowedTags.Add(tag);
        // Lexical wraps text in styled spans and exports emphasis using b/i. Attributes and
        // CSS are removed above; canonicalize those inert editor wrappers to the API allowlist.
        return sanitizer.Sanitize(html)
            .Replace("<span>", string.Empty, StringComparison.Ordinal)
            .Replace("</span>", string.Empty, StringComparison.Ordinal)
            .Replace("<u>", string.Empty, StringComparison.Ordinal)
            .Replace("</u>", string.Empty, StringComparison.Ordinal)
            .Replace("<b>", "<strong>", StringComparison.Ordinal)
            .Replace("</b>", "</strong>", StringComparison.Ordinal)
            .Replace("<i>", "<em>", StringComparison.Ordinal)
            .Replace("</i>", "</em>", StringComparison.Ordinal)
            .Trim();
    }
}
