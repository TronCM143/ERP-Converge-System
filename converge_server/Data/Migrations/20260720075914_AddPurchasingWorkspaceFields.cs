using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPurchasingWorkspaceFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttachmentPdfUrl",
                table: "PurchaseRequests",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsSeenByPurchasing",
                table: "PurchaseRequests",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "OrderDate",
                table: "BillOfMaterialItems",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttachmentPdfUrl",
                table: "PurchaseRequests");

            migrationBuilder.DropColumn(
                name: "IsSeenByPurchasing",
                table: "PurchaseRequests");

            migrationBuilder.DropColumn(
                name: "OrderDate",
                table: "BillOfMaterialItems");
        }
    }
}
