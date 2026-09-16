using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProductCostAndLineCost : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "UnitCost",
                table: "QuotationMaterialItems",
                type: "numeric(14,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Cost",
                table: "Products",
                type: "numeric(14,2)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UnitCost",
                table: "QuotationMaterialItems");

            migrationBuilder.DropColumn(
                name: "Cost",
                table: "Products");
        }
    }
}
