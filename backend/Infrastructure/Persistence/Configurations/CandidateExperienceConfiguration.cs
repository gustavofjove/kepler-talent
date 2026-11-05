using KeplerTalento.Domain.Candidates;
using KeplerTalento.Domain.Catalogs;
using KeplerTalento.Infrastructure.Encryption;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace KeplerTalento.Infrastructure.Persistence.Configurations;

public sealed class CandidateExperienceConfiguration : IEntityTypeConfiguration<CandidateExperience>
{
    private const string Table = "CND_CandidateExperience";

    public void Configure(EntityTypeBuilder<CandidateExperience> builder)
    {
        builder.ToTable(Table, table =>
        {
            table.HasCheckConstraint(
                $"CK_{Table}_SectorFamily",
                CandidateRelationMapping.FamilyCheck("SectorFamily", CatalogFamilies.Sector));
            // KTL-33: Company and Position are ciphertext; their non-empty rule moved to the
            // validator and the encryption converter.
            table.HasCheckConstraint(
                $"CK_{Table}_Period",
                "(\"StartDate\" IS NULL OR \"EndDate\" IS NULL OR \"EndDate\" >= \"StartDate\") "
                    + "AND (NOT \"IsCurrent\" OR \"EndDate\" IS NULL)");
            // KTL-46: one decimal, up to the ExperienceYears.Maximum the domain enforces.
            table.HasCheckConstraint(
                $"CK_{Table}_YearsExperience",
                "\"YearsExperience\" IS NULL OR (\"YearsExperience\" >= 0 AND \"YearsExperience\" <= 100)");
        });
        builder.Property(experience => experience.YearsExperience).HasPrecision(4, 1);
        builder.ConfigureRelation(Table, candidate => candidate.Experience);
        builder.Property(experience => experience.Company).IsEncrypted(Table, CandidateTextLimits.Company, requireText: true).IsRequired();
        builder.Property(experience => experience.Position).IsEncrypted(Table, CandidateTextLimits.Position, requireText: true).IsRequired();
        builder.Property(experience => experience.Functions).IsEncrypted(Table);
        builder.HasCatalogReference(
            experience => new { experience.SectorId, experience.SectorFamily },
            experience => experience.SectorFamily);
    }
}
