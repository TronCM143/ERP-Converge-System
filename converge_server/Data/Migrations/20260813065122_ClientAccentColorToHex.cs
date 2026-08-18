using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <summary>
    /// Clients.AccentColor moves from an ordinal into a fixed 4-colour palette
    /// to a free CSS hex string, so the card colour can be chosen from a full
    /// colour picker on the client profile.
    ///
    /// Hand-written rather than left as EF's scaffolded AlterColumn: PostgreSQL
    /// will not cast integer -> varchar implicitly, so a bare
    /// "ALTER COLUMN ... TYPE character varying(9)" fails with
    /// "column cannot be cast automatically to type character varying".
    /// The USING clause below does the cast AND maps the old ordinals onto the
    /// hex values they used to render as, so colours already chosen on the
    /// board survive the change instead of being wiped to null.
    /// </summary>
    public partial class ClientAccentColorToHex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""Clients""
                ALTER COLUMN ""AccentColor"" TYPE character varying(9)
                USING CASE ""AccentColor""
                    WHEN 1 THEN '#1f6fb2'
                    WHEN 2 THEN '#e8770f'
                    WHEN 3 THEN '#0f766e'
                    WHEN 4 THEN '#7e22ce'
                    ELSE NULL
                END;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Only the four original palette colours can be mapped back to an
            // ordinal; anything else picked from the full picker has no integer
            // equivalent and reverts to null.
            migrationBuilder.Sql(@"
                ALTER TABLE ""Clients""
                ALTER COLUMN ""AccentColor"" TYPE integer
                USING CASE lower(""AccentColor"")
                    WHEN '#1f6fb2' THEN 1
                    WHEN '#e8770f' THEN 2
                    WHEN '#0f766e' THEN 3
                    WHEN '#7e22ce' THEN 4
                    ELSE NULL
                END;
            ");
        }
    }
}
