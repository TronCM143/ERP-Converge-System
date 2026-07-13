using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Migrations
{
    /// <inheritdoc />
    public partial class AddClientCrmFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContactPerson",
                table: "Clients",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Stage",
                table: "Clients",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Clients that already had a quotation before this feature shipped shouldn't
            // appear stuck at "Leads" (0) once the CRM board goes live - bump them to "RFQ" (1).
            migrationBuilder.Sql(@"
                UPDATE ""Clients""
                SET ""Stage"" = 1
                WHERE ""Stage"" = 0
                  AND EXISTS (
                      SELECT 1 FROM ""Quotations"" q WHERE q.""ClientId"" = ""Clients"".""Id""
                  );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContactPerson",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "Stage",
                table: "Clients");
        }
    }
}
