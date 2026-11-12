using FluentValidation;

namespace KeplerTalento.Application.Features.Candidates;

internal static class CandidateContactRules
{
    public static IRuleBuilderOptions<T, string?> ContactLength<T>(this IRuleBuilder<T, string?> rule, int maximum) =>
        rule.Must(value => value is null || value.Trim().Length <= maximum)
            .WithErrorCode(CandidateErrors.FieldTooLong)
            .WithMessage(CandidateErrors.FieldTooLongMessage);

    public static IRuleBuilderOptions<T, string?> ValidEmail<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(value => string.IsNullOrWhiteSpace(value) ||
                System.Text.RegularExpressions.Regex.IsMatch(value.Trim(), @"^[^\s@<>,;]+@[^\s@<>,;]+$"))
            .WithErrorCode("candidate.email.invalid")
            .WithMessage("Introduce un correo electrónico válido.");

    public static void Phone<T>(AbstractValidator<T> validator, System.Linq.Expressions.Expression<Func<T, string>> field)
    {
        validator.RuleFor(field)
            .Must(value => value is null || value.All(c => char.IsAsciiDigit(c) || c is '+' or '(' or ')' || char.IsWhiteSpace(c)))
            .WithErrorCode("candidate.phone.characters")
            .WithMessage("El teléfono solo puede contener dígitos, +, paréntesis y espacios.");
        validator.RuleFor(field)
            .Must(value => string.IsNullOrWhiteSpace(value) || value.Count(char.IsAsciiDigit) >= 9 ||
                value.Any(c => !char.IsAsciiDigit(c) && c is not ('+' or '(' or ')') && !char.IsWhiteSpace(c)))
            .WithErrorCode("candidate.phone.too_short")
            .WithMessage("El teléfono debe contener al menos 9 dígitos.");
    }
}
