using KeplerTalento.Domain.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace KeplerTalento.Infrastructure.Persistence.Configurations;

/// <summary>
/// Application users. The row holds personal data — display name, email and the provider's
/// subject — so it is read by the API alone and none of the three ever reaches a response or a
/// log (non-negotiable 1).
/// </summary>
public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public const string Table = "ADM_Users";
    public const string UniqueSubjectIndex = "UX_ADM_Users_ExternalSubject";
    public const string UniqueEmailIndex = "UX_ADM_Users_Email";
    public const string RoleNameIndex = "IX_ADM_Users_RoleName";
    public const string UniqueUserNameIndex = "UX_ADM_Users_UserName";

    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable(Table, table =>
        {
            table.HasCheckConstraint(
                $"CK_{Table}_DisplayName",
                "char_length(btrim(\"DisplayName\")) > 0");
            // Shape only, matching the domain: the provider owns the address.
            table.HasCheckConstraint(
                $"CK_{Table}_Email",
                "\"Email\" = lower(\"Email\") AND position('@' in \"Email\") > 1");
            table.HasCheckConstraint(
                $"CK_{Table}_ExternalSubject",
                "\"ExternalSubject\" IS NULL OR char_length(btrim(\"ExternalSubject\")) > 0");
            table.HasCheckConstraint(
                $"CK_{Table}_Timestamps",
                "\"UpdatedAtUtc\" >= \"CreatedAtUtc\" AND (\"LastSignInAtUtc\" IS NULL OR \"LastSignInAtUtc\" >= \"CreatedAtUtc\")");
            // KTL-45. Same shape as User.IsValidUserName, so a value that bypassed the domain is
            // still refused.
            table.HasCheckConstraint(
                $"CK_{Table}_UserName",
                "\"UserName\" IS NULL OR \"UserName\" ~ '^[a-z0-9._-]{3,64}$'");
            // A password belongs to a local account; a hash with no name to sign in by is a defect.
            table.HasCheckConstraint(
                $"CK_{Table}_PasswordHash",
                "\"PasswordHash\" IS NULL OR \"UserName\" IS NOT NULL");
        });

        builder.HasKey(user => user.Id);
        builder.Property(user => user.ExternalSubject).HasMaxLength(200);
        builder.Property(user => user.DisplayName).HasMaxLength(200).IsRequired();
        builder.Property(user => user.Email).HasMaxLength(320).IsRequired();
        builder.Property(user => user.UserName).HasMaxLength(User.MaximumUserNameLength);
        builder.Property(user => user.PasswordHash).HasMaxLength(User.MaximumPasswordHashLength);
        builder.Property(user => user.RoleName).HasMaxLength(RoleName.MaximumLength).IsRequired();
        builder.Property(user => user.IsActive).IsRequired();
        builder.Property(user => user.CreatedAtUtc).IsRequired();
        builder.Property(user => user.UpdatedAtUtc).IsRequired();
        builder.Property(user => user.Version).IsRowVersion();

        // Unique where present. The bootstrap administrator is seeded by email with no subject
        // yet, and a partial index is what lets that row exist without colliding with the next
        // unlinked row (design D7, open question on bootstrap identification).
        builder.HasIndex(user => user.ExternalSubject)
            .IsUnique()
            .HasFilter("\"ExternalSubject\" IS NOT NULL")
            .HasDatabaseName(UniqueSubjectIndex);

        // The column is already stored lower-cased and a check constraint holds it that way, so
        // a plain unique index is the lower-cased uniqueness the design asks for.
        builder.HasIndex(user => user.Email).IsUnique().HasDatabaseName(UniqueEmailIndex);

        // KTL-45. Only local accounts have a user name, so unique where present, like the subject.
        builder.HasIndex(user => user.UserName)
            .IsUnique()
            .HasFilter("\"UserName\" IS NOT NULL")
            .HasDatabaseName(UniqueUserNameIndex);

        // Supports the foreign key and the "is any user still holding this role?" invariant.
        builder.HasIndex(user => user.RoleName).HasDatabaseName(RoleNameIndex);

        // Referenced by name rather than by id, which is why Role.Name is immutable: the
        // alternative is cascading updates on a natural key.
        builder.HasOne<Role>()
            .WithMany()
            .HasForeignKey(user => user.RoleName)
            .HasPrincipalKey(role => role.Name)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
