using KeplerTalento.Domain.Candidates;
using KeplerTalento.Domain.Catalogs;
using KeplerTalento.Infrastructure.Encryption;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace KeplerTalento.Infrastructure.Persistence.Configurations;

public sealed class CandidateEducationConfiguration : IEntityTypeConfiguration<CandidateEducation>
{
    private const string Table = "CND_CandidateEducation";

    public void Configure(EntityTypeBuilder<CandidateEducation> builder)
    {
        builder.ToTable(Table, table =>
        {
            table.HasCheckConstraint(
                $"CK_{Table}_EducationTypeFamily",
                CandidateRelationMapping.FamilyCheck("EducationTypeFamily", CatalogFamilies.EducationType));
            table.HasCheckConstraint(
                $"CK_{Table}_StatusFamily",
                CandidateRelationMapping.FamilyCheck("StatusFamily", CatalogFamilies.EducationStatus));
            // KTL-33: Degree and Institution are ciphertext; their non-empty rule moved to the
            // validator and the encryption converter.
            table.HasCheckConstraint(
                $"CK_{Table}_EndYear",
                "\"EndYear\" IS NULL OR (\"EndYear\" BETWEEN 1900 AND 2200)");
        });
        builder.ConfigureRelation(Table, candidate => candidate.Education);
        builder.Property(education => education.Degree).IsEncrypted(Table, CandidateTextLimits.Degree, requireText: true).IsRequired();
        builder.Property(education => education.Specialty).IsEncrypted(Table, CandidateTextLimits.Specialty);
        builder.Property(education => education.Institution).IsEncrypted(Table, CandidateTextLimits.Institution).IsRequired();
        builder.HasCatalogReference(
            education => new { education.EducationTypeId, education.EducationTypeFamily },
            education => education.EducationTypeFamily);
        builder.HasCatalogReference(
            education => new { education.StatusId, education.StatusFamily },
            education => education.StatusFamily);
    }
}
