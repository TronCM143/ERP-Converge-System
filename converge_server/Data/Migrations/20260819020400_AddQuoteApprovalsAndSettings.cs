using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddQuoteApprovalsAndSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ApprovalState",
                table: "Quotations",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "AppSettings",
                columns: table => new
                {
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Value = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppSettings", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "QuoteApprovals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    QuotationId = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    AmountAtSubmission = table.Column<decimal>(type: "numeric(14,2)", nullable: false),
                    SubmittedBy = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DecidedBy = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DecidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RejectionReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuoteApprovals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QuoteApprovals_Quotations_QuotationId",
                        column: x => x.QuotationId,
                        principalTable: "Quotations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QuoteApprovals_QuotationId",
                table: "QuoteApprovals",
                column: "QuotationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AppSettings");

            migrationBuilder.DropTable(
                name: "QuoteApprovals");

            migrationBuilder.DropColumn(
                name: "ApprovalState",
                table: "Quotations");
        }
    }
}
