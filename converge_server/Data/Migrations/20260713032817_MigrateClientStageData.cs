using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <inheritdoc />
    public partial class MigrateClientStageData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Convert old enum values to new ones:
            // Old: Leads=0, RFQ=1, Proposal=2, Negotiation=3, Won=4, Lost=5
            // New: Leads=0, Quote=1, Proposal=2, Won=3

            // Won value changed from 4 to 3
            migrationBuilder.Sql("UPDATE \"Clients\" SET \"Stage\" = 3 WHERE \"Stage\" = 4");

            // Convert Negotiation (3) and Lost (5) to Quote (1)
            migrationBuilder.Sql("UPDATE \"Clients\" SET \"Stage\" = 1 WHERE \"Stage\" = 3 OR \"Stage\" = 5");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Reverse the changes
            migrationBuilder.Sql("UPDATE \"Clients\" SET \"Stage\" = 4 WHERE \"Stage\" = 3");
            migrationBuilder.Sql("UPDATE \"Clients\" SET \"Stage\" = 3 WHERE \"Stage\" = 1");
        }
    }
}
