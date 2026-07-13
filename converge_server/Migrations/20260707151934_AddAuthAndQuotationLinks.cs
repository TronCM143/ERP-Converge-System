using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace converge_server.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthAndQuotationLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // NOTE: Clients, Quotations, QuotationMaterialItems, QuotationLaborItems
            // already exist in the database (created by an earlier, separate effort on
            // this same feature) with a schema matching the entities added in this
            // change. Only the genuinely new pieces are applied here: auth (Users),
            // PR provenance tracking, and the new Quotation -> PurchaseRequest link.

            migrationBuilder.AddColumn<int>(
                name: "QuotationId",
                table: "PurchaseRequests",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Source",
                table: "PurchaseRequests",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseRequestId",
                table: "Quotations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Username = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: false),
                    Role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ActiveSessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActiveSessionIssuedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_Username",
                table: "Users",
                column: "Username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Quotations_PurchaseRequestId",
                table: "Quotations",
                column: "PurchaseRequestId");

            migrationBuilder.AddForeignKey(
                name: "FK_Quotations_PurchaseRequests_PurchaseRequestId",
                table: "Quotations",
                column: "PurchaseRequestId",
                principalTable: "PurchaseRequests",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Quotations_PurchaseRequests_PurchaseRequestId",
                table: "Quotations");

            migrationBuilder.DropIndex(
                name: "IX_Quotations_PurchaseRequestId",
                table: "Quotations");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropColumn(
                name: "PurchaseRequestId",
                table: "Quotations");

            migrationBuilder.DropColumn(
                name: "QuotationId",
                table: "PurchaseRequests");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "PurchaseRequests");
        }
    }
}
