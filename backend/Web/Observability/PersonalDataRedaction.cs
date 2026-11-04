using Serilog.Core;
using Serilog.Events;

namespace KeplerTalento.Web.Observability;

/// <summary>
/// Masks candidate personal data in log events, whatever put it there.
/// </summary>
/// <remarks>
/// This exists instead of relying on slices not to log these fields. "No slice logs a
/// candidate name" is true until someone adds a slice, adds a diagnostic, or a library
/// destructures a request object into its properties — and the failure is silent and
/// permanent, because logs are shipped and retained. An enricher stays true as the
/// application grows, which is the only form of this guarantee worth having.
///
/// It masks by property name, at every depth, so a candidate field caught inside a
/// destructured request or an exception's structured data is masked as readily as one
/// logged directly.
/// </remarks>
public sealed class PersonalDataRedactionEnricher : ILogEventEnricher
{
    public const string Mask = "[redacted]";

    /// <summary>
    /// The candidate fields that are personal data. Consent and retention dates are in
    /// the set because when someone consented, and when their record is due for review,
    /// say something about that person too.
    /// </summary>
    private static readonly HashSet<string> ProtectedNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "firstName",
        "lastName",
        "phone",
        "email",
        "location",
        "province",
        "notes",
        "body",
        "tags",
        "authorDisplayName",
        "receivedAt",
        "consentAt",
        "reviewDueAt",
        "originalFilename",
        "originalFileName",
        // KTL-10. A search term is whatever an employee typed to find a person, so it is at
        // least as personal as the field it matched: "Marta Ruiz" in a log is the same
        // disclosure whether it arrived as a candidate's name or as the query for it.
        "text",
        // The filter families are masked whole rather than by their inner value/level
        // members, which masks every criterion inside them without masking the word "value"
        // everywhere else in the application.
        "filters",
        "skillCriteria",
        "tagCriteria",
        "languageCriteria",
        "programCriteria",
        // A saved search's name is its owner's free text and routinely describes a person
        // ("Candidatos de Marta"), so it is treated as personal data rather than as a label.
        "name",
        "normalizedName",
        "presetName",
        // KTL-16. A user row holds a display name, an email and the provider's subject, and a
        // token carries the same claims. The subject is not merely personal data, it is the key
        // that identifies a person at the provider, and it never appears in a response either.
        "displayName",
        "externalSubject",
        "externalKey",
        "subject",
        "sub",
        "oid",
        "upn",
        "preferred_username",
        "given_name",
        "family_name",
        // KTL-45. A local account's sign-in name can name a person, and a password or its hash
        // has no business in a log under any spelling.
        "userName",
        "password",
        "passwordHash",
        // KTL-17. An import file is a bulk collection of candidate data, so its column names are
        // masked as readily as the candidate properties they become, and the uploaded file's own
        // name — caller text that routinely names a person — along with every spelling of it.
        // The storage key is not personal data, but it is an internal location no log needs.
        "first_name",
        "last_name",
        "received_at",
        "consent_at",
        "review_due_at",
        "country",
        "availability",
        "source",
        "languages",
        "fileName",
        "file_name",
        "importFileName",
        "storageKey",
        // KTL-15. A position's title, description and location are free HR text that can name a
        // person or an internal situation, and its requirements are a stored search, masked for
        // the same reason as "filters". "location" is already covered above.
        "title",
        "normalizedTitle",
        "normalizedLocation",
        "description",
        "requirements",
        // Credentials. A token in a log is a usable credential for as long as it lives, and
        // logs outlive tokens.
        "token",
        "accessToken",
        "access_token",
        "idToken",
        "id_token",
        "authorization",
        "signingKey",
    };

    /// <summary>
    /// A JWS compact serialization: three base64url segments. Matching the shape rather than the
    /// property name is what catches a token logged as part of a header string, an exception
    /// message or a URL, where no property is called "token" at all.
    /// </summary>
    private static readonly System.Text.RegularExpressions.Regex TokenShape = new(
        @"eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+",
        System.Text.RegularExpressions.RegexOptions.Compiled);

    public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
    {
        foreach (var property in logEvent.Properties.ToList())
        {
            var redacted = Redact(property.Key, property.Value);
            if (!ReferenceEquals(redacted, property.Value))
            {
                logEvent.AddOrUpdateProperty(new LogEventProperty(property.Key, redacted));
            }
        }
    }

    private static LogEventPropertyValue Redact(string name, LogEventPropertyValue value)
    {
        if (ProtectedNames.Contains(name))
        {
            return new ScalarValue(Mask);
        }
        return value switch
        {
            StructureValue structure => RedactStructure(structure),
            SequenceValue sequence => RedactSequence(sequence),
            DictionaryValue dictionary => RedactDictionary(dictionary),
            ScalarValue scalar => RedactScalar(scalar),
            _ => value,
        };
    }

    /// <summary>
    /// Masks a bearer token wherever it appears inside a logged string, whatever the property is
    /// called. Property-name masking cannot catch "Authorization: Bearer eyJ..." logged as one
    /// message, and that is the shape a token most often reaches a log in.
    /// </summary>
    private static LogEventPropertyValue RedactScalar(ScalarValue scalar)
    {
        if (scalar.Value is not string text || text.Length < 20 || !text.Contains("eyJ", StringComparison.Ordinal))
        {
            return scalar;
        }
        var masked = TokenShape.Replace(text, Mask);
        return ReferenceEquals(masked, text) || masked == text ? scalar : new ScalarValue(masked);
    }

    private static LogEventPropertyValue RedactStructure(StructureValue structure)
    {
        var properties = structure.Properties
            .Select(property => new LogEventProperty(property.Name, Redact(property.Name, property.Value)))
            .ToList();
        return new StructureValue(properties, structure.TypeTag);
    }

    private static LogEventPropertyValue RedactSequence(SequenceValue sequence) =>
        new SequenceValue(sequence.Elements.Select(element => Redact(string.Empty, element)).ToList());

    private static LogEventPropertyValue RedactDictionary(DictionaryValue dictionary) =>
        new DictionaryValue(dictionary.Elements.Select(element => KeyValuePair.Create(
            element.Key,
            Redact(element.Key.Value as string ?? string.Empty, element.Value))));
}
