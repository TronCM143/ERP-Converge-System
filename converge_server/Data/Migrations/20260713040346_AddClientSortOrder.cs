using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddClientSortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "Clients",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Give existing clients a stable initial position (creation order).
            migrationBuilder.Sql("UPDATE \"Clients\" SET \"SortOrder\" = \"Id\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "Clients");
        }
    }
}
