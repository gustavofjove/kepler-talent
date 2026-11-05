using KeplerTalento.Application.Abstractions.RichText;
using KeplerTalento.Infrastructure.RichText;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Features;

public sealed class PositionSanitizerTests
{
    private static string Sanitize(string html) =>
        new RichTextSanitizer().Sanitize(html, RichTextProfile.PositionDescription);

    [Fact]
    public void Allowed_structure_is_retained_and_active_content_is_removed()
    {
        var result = Sanitize("<p onclick='alert(1)'><strong>Hola</strong><script>alert(1)</script><a href='javascript:alert(1)'>mundo</a></p><svg><script>x</script></svg>");
        Assert.Equal("<p><strong>Hola</strong></p>", result);
        Assert.DoesNotContain("onclick", result, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("script", result, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("href", result, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("svg", result, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Lexical_list_text_is_retained_without_its_span_or_style()
    {
        var result = Sanitize(
            "<ul><li value='1'><span style='white-space: pre-wrap;'>Primer punto</span></li><li value='2'><span style='white-space: pre-wrap;'>Segundo punto</span></li></ul>");

        Assert.Equal("<ul><li>Primer punto</li><li>Segundo punto</li></ul>", result);
        Assert.DoesNotContain("span", result, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("style", result, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("value", result, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Lexical_emphasis_aliases_are_canonicalized_without_editor_wrappers()
    {
        var result = Sanitize(
            "<p><b><span style='white-space: pre-wrap;'>Texto en negrita</span></b> <i><span style='white-space: pre-wrap;'>texto en cursiva</span></i></p>");

        Assert.Equal(
            "<p><strong>Texto en negrita</strong> <em>texto en cursiva</em></p>",
            result);
        Assert.DoesNotContain("span", result, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("style", result, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Underline_is_removed_but_its_text_is_kept()
    {
        var result = Sanitize("<p>Texto <u><span style='white-space: pre-wrap;'>subrayado</span></u></p>");

        Assert.Equal("<p>Texto subrayado</p>", result);
    }
}
