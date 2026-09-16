using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddQuotationTrackerFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ProcurementType",
                table: "Quotations",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProjectType",
                table: "Quotations",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceRequestNumber",
                table: "Quotations",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProcurementType",
                table: "Quotations");

            migrationBuilder.DropColumn(
                name: "ProjectType",
                table: "Quotations");

            migrationBuilder.DropColumn(
                name: "ServiceRequestNumber",
                table: "Quotations");
        }
    }
}
