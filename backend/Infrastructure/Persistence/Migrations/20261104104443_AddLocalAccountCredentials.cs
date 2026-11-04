using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLocalAccountCredentials : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                table: "ADM_Users",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserName",
                table: "ADM_Users",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "UX_ADM_Users_UserName",
                table: "ADM_Users",
                column: "UserName",
                unique: true,
                filter: "\"UserName\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ADM_Users_PasswordHash",
                table: "ADM_Users",
                sql: "\"PasswordHash\" IS NULL OR \"UserName\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ADM_Users_UserName",
                table: "ADM_Users",
                sql: "\"UserName\" IS NULL OR \"UserName\" ~ '^[a-z0-9._-]{3,64}$'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_ADM_Users_UserName",
                table: "ADM_Users");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ADM_Users_PasswordHash",
                table: "ADM_Users");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ADM_Users_UserName",
                table: "ADM_Users");

            migrationBuilder.DropColumn(
                name: "PasswordHash",
                table: "ADM_Users");

            migrationBuilder.DropColumn(
                name: "UserName",
                table: "ADM_Users");
        }
    }
}
