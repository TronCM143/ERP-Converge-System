using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <summary>
    /// Restores UserNotification.LinkUrl to the EF model.
    ///
    /// The COLUMN already exists in the database — an earlier migration added
    /// it — but the property had gone missing from the entity, so EF stopped
    /// mapping it: the API returned no linkUrl and every notification was inert
    /// on click. Re-adding the property is the actual fix; this migration exists
    /// only to bring the model snapshot back in line with it.
    ///
    /// Hand-written rather than left as EF's scaffolded AddColumn, which would
    /// fail with "column \"LinkUrl\" of relation \"UserNotifications\" already
    /// exists" on any database that has it. IF NOT EXISTS makes it a no-op where
    /// the column is present and a real add on a fresh database.
    /// </summary>
    public partial class RestoreNotificationLinkUrl : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""UserNotifications""
                ADD COLUMN IF NOT EXISTS ""LinkUrl"" character varying(500) NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""UserNotifications""
                DROP COLUMN IF EXISTS ""LinkUrl"";
            ");
        }
    }
}
