using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace converge_server.Data.Migrations
{
    /// <summary>
    /// Restores the pricing properties on BillOfMaterialItem and
    /// QuotationMaterialItem to the EF model, and backfills BOM lines that were
    /// created while those properties were missing.
    ///
    /// All four COLUMNS already exist in the database — earlier migrations added
    /// them — but the properties had gone missing from the entities, so EF
    /// stopped mapping them. The visible symptom: BOM lines were saved with a
    /// null UnitPrice, the API never returned a price, and the client's
    /// bomTotals() (which skips null-priced lines) summed every PO/PR to ₱0.00
    /// while the item table showed rows. On the quotation side, the per-line
    /// discount the editor sends was silently discarded on every save.
    ///
    /// Hand-written rather than left as EF's scaffolded AddColumn calls, which
    /// would fail with "column ... already exists". ADD COLUMN IF NOT EXISTS is
    /// a no-op where they're present and a real add on a fresh database.
    /// </summary>
    public partial class RestoreBomAndQuotationPricing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""QuotationMaterialItems""
                    ADD COLUMN IF NOT EXISTS ""DiscountAmount"" numeric(18,2) NOT NULL DEFAULT 0;

                ALTER TABLE ""BillOfMaterialItems""
                    ADD COLUMN IF NOT EXISTS ""DiscountAmount"" numeric(18,2) NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS ""TaxPercent""     numeric(5,2)  NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS ""UnitPrice""      numeric(14,2) NULL;
            ");

            /* Backfill: every BOM line created while the mapping was missing has
               a null price. Recover it from the quotation line the BOM was built
               from, matched the same way BOM creation matches (product id first,
               then item name), so historical purchase orders stop reading ₱0.00.

               Resolved in a CTE rather than a plain UPDATE ... FROM: PostgreSQL
               will not let the UPDATE target be referenced inside a JOIN
               condition in the FROM clause (it fails with errorMissingRTE), and
               the match needs to join PurchaseRequestItems on a column of the
               row being updated. Inside the CTE it is an ordinary FROM entry.

               ROW_NUMBER picks one row when several quotation lines match the
               same BOM line, preferring the product-id match over the
               name match — the same precedence BOM creation uses. */
            migrationBuilder.Sql(@"
                WITH priced AS (
                    SELECT bi.""Id""          AS item_id,
                           q.""UnitPrice""    AS unit_price,
                           q.""TaxPercent""   AS tax_percent,
                           ROW_NUMBER() OVER (
                               PARTITION BY bi.""Id""
                               ORDER BY (pri.""ProductId"" IS NOT NULL
                                         AND q.""ProductId"" = pri.""ProductId"") DESC,
                                        q.""Id""
                           ) AS rn
                    FROM ""BillOfMaterialItems"" bi
                    JOIN ""BillOfMaterials"" b       ON b.""Id""  = bi.""BillOfMaterialId""
                    JOIN ""PurchaseRequests"" pr     ON pr.""Id"" = b.""PurchaseRequestId""
                    JOIN ""QuotationMaterialItems"" q ON q.""QuotationId"" = pr.""QuotationId""
                    LEFT JOIN ""PurchaseRequestItems"" pri ON pri.""Id"" = bi.""PurchaseRequestItemId""
                    WHERE bi.""UnitPrice"" IS NULL
                      AND (
                            (pri.""ProductId"" IS NOT NULL AND q.""ProductId"" = pri.""ProductId"")
                         OR lower(q.""ItemName"") = lower(bi.""ItemName"")
                      )
                )
                UPDATE ""BillOfMaterialItems"" t
                SET ""UnitPrice""  = p.unit_price,
                    ""TaxPercent"" = p.tax_percent
                FROM priced p
                WHERE t.""Id"" = p.item_id
                  AND p.rn = 1;
            ");

            // Anything still unpriced (no quotation behind it) falls back to the
            // product catalog, matched on the slugified name BOM lines carry.
            migrationBuilder.Sql(@"
                UPDATE ""BillOfMaterialItems"" bi
                SET ""UnitPrice"" = p.""Price""
                FROM ""Products"" p
                WHERE bi.""UnitPrice"" IS NULL
                  AND lower(p.""ProductName"") = lower(bi.""ItemName"");
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""QuotationMaterialItems"" DROP COLUMN IF EXISTS ""DiscountAmount"";
                ALTER TABLE ""BillOfMaterialItems""
                    DROP COLUMN IF EXISTS ""DiscountAmount"",
                    DROP COLUMN IF EXISTS ""TaxPercent"",
                    DROP COLUMN IF EXISTS ""UnitPrice"";
            ");
        }
    }
}
