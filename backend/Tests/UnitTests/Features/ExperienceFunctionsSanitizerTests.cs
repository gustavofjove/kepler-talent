using KeplerTalento.Application.Abstractions.RichText;
using KeplerTalento.Application.Features.Candidates;
using KeplerTalento.Infrastructure.RichText;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Features;

public sealed class ExperienceFunctionsSanitizerTests
{
    private static string Sanitize(string html) =>
        new RichTextSanitizer().Sanitize(html, RichTextProfile.ExperienceFunctions);

    [Fact]
    public void Emphasis_aliases_are_canonicalized_and_underline_is_unwrapped()
    {
        var result = Sanitize(
            "<p><b><span style='white-space: pre-wrap;'>Negrita</span></b> <i><span>cursiva</span></i> <u><span style='white-space: pre-wrap;'>subrayado</span></u></p>");

        Assert.Equal("<p><strong>Negrita</strong> <em>cursiva</em> subrayado</p>", result);
    }

    [Fact]
    public void Active_content_links_images_and_styles_are_removed()
    {
        var result = Sanitize(
            "<p onclick='alert(1)' style='color:red'>Tareas<script>alert(1)</script><a href='https://example.test'>enlace</a><img src='x' onerror='alert(1)'><iframe src='x'></iframe></p>");

        Assert.Equal("<p>Tareas</p>", result);
    }

    [Fact]
    public void Lists_are_kept_without_their_attributes()
    {
        var result = Sanitize("<ol><li value='1'>Uno</li></ol><ul><li value='1'>Dos</li></ul>");

        Assert.Equal("<ol><li>Uno</li></ol><ul><li>Dos</li></ul>", result);
    }

    [Fact]
    public void Sanitizer_output_is_passed_through_by_the_read_guard()
    {
        var sanitized = Sanitize("<p><em>a</em> &lt; b</p><ul><li><strong>c</strong></li></ul>");

        Assert.Equal(sanitized, RichTextLegacy.ToSafeHtml(sanitized));
    }

    [Fact]
    public void A_value_stored_with_underline_before_it_was_dropped_still_reads_as_rich_text()
    {
        const string stored = "<p><u>Coordinación</u> de equipos</p>";

        Assert.Equal(stored, RichTextLegacy.ToSafeHtml(stored));
    }

    [Fact]
    public void Legacy_plain_text_becomes_escaped_paragraphs()
    {
        var result = RichTextLegacy.ToSafeHtml("Gestión de equipos\r\n\r\nPlanificación\na < b & c > d");

        Assert.Equal("<p>Gestión de equipos</p><p>Planificación</p><p>a &lt; b &amp; c &gt; d</p>", result);
    }

    [Theory]
    [InlineData("<p onclick=\"alert(1)\">x</p>")]
    [InlineData("<p>x</p><img src=x onerror=alert(1)>")]
    [InlineData("<p><a href=\"javascript:alert(1)\">x</a></p>")]
    [InlineData("<p>x</p><script>alert(1)</script>")]
    [InlineData("<strong>no block element</strong>")]
    public void Legacy_markup_is_shown_as_text_and_never_passed_through(string stored)
    {
        var result = RichTextLegacy.ToSafeHtml(stored)!;

        Assert.StartsWith("<p>", result, StringComparison.Ordinal);
        Assert.DoesNotContain("<a", result, StringComparison.Ordinal);
        Assert.DoesNotContain("<img", result, StringComparison.Ordinal);
        Assert.DoesNotContain("<script", result, StringComparison.Ordinal);
        Assert.DoesNotContain("<p onclick", result, StringComparison.Ordinal);
        Assert.Contains("&lt;", result, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Blank_functions_stay_absent(string? stored)
    {
        Assert.Null(RichTextLegacy.ToSafeHtml(stored));
    }
}
