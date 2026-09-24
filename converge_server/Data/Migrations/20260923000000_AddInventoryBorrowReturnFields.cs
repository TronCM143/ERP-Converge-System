using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    [Migration("20260923000000_AddInventoryBorrowReturnFields")]
    public partial class AddInventoryBorrowReturnFields : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PointPerson",
                table: "InventoryTransactions",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "BorrowedAt",
                table: "InventoryTransactions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReturnedAt",
                table: "InventoryTransactions",
                type: "timestamp with time zone",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "PointPerson", table: "InventoryTransactions");
            migrationBuilder.DropColumn(name: "BorrowedAt", table: "InventoryTransactions");
            migrationBuilder.DropColumn(name: "ReturnedAt", table: "InventoryTransactions");
        }
    }
}
