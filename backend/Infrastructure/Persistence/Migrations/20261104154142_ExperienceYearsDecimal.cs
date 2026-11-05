using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ExperienceYearsDecimal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_CND_CandidateExperience_YearsExperience",
                table: "CND_CandidateExperience");

            migrationBuilder.AlterColumn<decimal>(
                name: "YearsExperience",
                table: "CND_CandidateExperience",
                type: "numeric(4,1)",
                precision: 4,
                scale: 1,
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_CND_CandidateExperience_YearsExperience",
                table: "CND_CandidateExperience",
                sql: "\"YearsExperience\" IS NULL OR (\"YearsExperience\" >= 0 AND \"YearsExperience\" <= 100)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_CND_CandidateExperience_YearsExperience",
                table: "CND_CandidateExperience");

            migrationBuilder.AlterColumn<int>(
                name: "YearsExperience",
                table: "CND_CandidateExperience",
                type: "integer",
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "numeric(4,1)",
                oldPrecision: 4,
                oldScale: 1,
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_CND_CandidateExperience_YearsExperience",
                table: "CND_CandidateExperience",
                sql: "\"YearsExperience\" IS NULL OR \"YearsExperience\" >= 0");
        }
    }
}
