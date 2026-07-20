using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBomItemSupplierAndEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EvidenceImageUrl",
                table: "BillOfMaterialItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Supplier",
                table: "BillOfMaterialItems",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EvidenceImageUrl",
                table: "BillOfMaterialItems");

            migrationBuilder.DropColumn(
                name: "Supplier",
                table: "BillOfMaterialItems");
        }
    }
}
