using KeplerTalento.Application.Features.Candidates;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Features;

public sealed class CandidateContactTests
{
    [Fact]
    public void Shared_contact_cases_match_both_write_validators()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !Directory.Exists(Path.Combine(root.FullName, "openspec"))) root = root.Parent;
        using var cases = System.Text.Json.JsonDocument.Parse(File.ReadAllText(
            Path.Combine(root!.FullName, "backend", "Tests", "Fixtures", "ktl-48", "contact-cases.json")));
        foreach (var item in cases.RootElement.EnumerateArray())
        {
            var phone = item.GetProperty("phone").GetString()!;
            var email = item.GetProperty("email").GetString()!;
            var accepted = item.GetProperty("accepted").GetBoolean();
            Assert.Equal(accepted, new CreateCandidateValidator().Validate(new CreateCandidateCommand(
                "Ana", "Perez", phone, email, "", "", "", "", "", null, null, null)).IsValid);
            Assert.Equal(accepted, new UpdateCandidateValidator().Validate(new UpdateCandidateCommand(
                Guid.NewGuid(), "Ana", "Perez", phone, email, "", "", "", "", "", null, null, null, 1)).IsValid);
        }
    }
    [Theory]
    [InlineData("", true)]
    [InlineData("   ", true)]
    [InlineData("612345678", true)]
    [InlineData("+34 (612) 345 678", true)]
    [InlineData("61234567", false)]
    [InlineData("+(12) 345 678", false)]
    [InlineData("612-345-678", false)]
    [InlineData("612.345.678", false)]
    [InlineData("612345678 ext 1", false)]
    public void Phone_rules_apply_to_create_and_update(string phone, bool accepted)
    {
        var create = new CreateCandidateCommand("Ana", "Perez", phone, "", "", "", "", "", "", null, null, null);
        var update = new UpdateCandidateCommand(Guid.NewGuid(), "Ana", "Perez", phone, "", "", "", "", "", "", null, null, null, 1);
        Assert.Equal(accepted, new CreateCandidateValidator().Validate(create).IsValid);
        Assert.Equal(accepted, new UpdateCandidateValidator().Validate(update).IsValid);
    }

    [Theory]
    [InlineData("", true)]
    [InlineData("ana.perez+rrhh@example.com", true)]
    [InlineData("ana", false)]
    [InlineData("ana@", false)]
    [InlineData("@example.com", false)]
    [InlineData("ana@@example.com", false)]
    [InlineData("Ana <ana@example.com>", false)]
    public void Email_format_is_checked_without_requiring_a_value(string email, bool accepted)
    {
        var command = new CreateCandidateCommand("Ana", "Perez", "", email, "", "", "", "", "", null, null, null);
        Assert.Equal(accepted, new CreateCandidateValidator().Validate(command).IsValid);
    }

    [Fact]
    public void Education_accepts_a_blank_centre()
    {
        var command = new SetCandidateEducationCommand(Guid.NewGuid(),
            [new CandidateEducationInput(null, "Grado", "ADE", null, "", "Finalizada", 2020, null)], 1);
        Assert.True(new SetCandidateEducationValidator().Validate(command).IsValid);
    }
}
