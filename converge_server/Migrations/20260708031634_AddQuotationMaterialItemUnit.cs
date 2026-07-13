using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Migrations
{
    /// <inheritdoc />
    public partial class AddQuotationMaterialItemUnit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Unit",
                table: "QuotationMaterialItems",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "pcs");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Unit",
                table: "QuotationMaterialItems");
        }
    }
}
