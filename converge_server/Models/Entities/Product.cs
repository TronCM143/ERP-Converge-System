using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    [Table("Products")]
    public class Product
    {
        [Key]
        public int Id { get; set; }

        public string Category { get; set; } = string.Empty;

        public string Subcategory { get; set; } = string.Empty;

        public string Brand { get; set; } = string.Empty;

        public string Model { get; set; } = string.Empty;

        public string ProductName { get; set; } = string.Empty;

        public string Specs { get; set; } = string.Empty;

        public decimal Price { get; set; }

        public bool IsActive { get; set; }

        public DateTime CreatedAt { get; set; }

        public DateTime? UpdatedAt { get; set; }

        // Stable per-product identifier used on labels/QR codes. Backfilled
        // for existing rows as "SKU-{Id:D6}"; generated the same way on create.
        public string Sku { get; set; } = string.Empty;

        // Local path (e.g. "/images/products/SKU-000123.jpg") once an image has
        // been found and cached. Null means "not resolved yet".
        public string? ImageUrl { get; set; }

        /* What we pay for it, against Price which is what we charge.

           Nullable on purpose: an unknown cost is a different fact from a zero
           cost, and treating "not filled in yet" as free would report a 100%
           margin on every un-costed line - the most dangerous possible default
           on a screen someone approves prices from. A null cost makes the margin
           unknown, and the approval dashboard says so. */
        [Column(TypeName = "decimal(14,2)")]
        public decimal? Cost { get; set; }

        /* Reference material that belongs to the PRODUCT, not to whoever is
           writing a quotation. Entered once here and pulled onto every
           quotation line that uses this product - the spec's point being that
           nobody should retype a datasheet link per quote. All optional: a
           catalog row is useful long before anyone fills these in. */
        [MaxLength(2000)]
        public string? Description { get; set; }

        [MaxLength(150)]
        public string? Manufacturer { get; set; }

        [MaxLength(500)]
        public string? DatasheetUrl { get; set; }

        [MaxLength(500)]
        public string? ProductUrl { get; set; }

        public ICollection<ProductAttachment> Attachments { get; set; } = new List<ProductAttachment>();

        // True once an image search has been attempted for this product,
        // regardless of outcome — prevents re-searching on every click when
        // nothing was found. Cleared only by an explicit manual refresh.
        public bool ImageSearchAttempted { get; set; }

        // Current quantity on hand. Only ever changed through
        // ProductService.AdjustStockAsync, which also writes the matching
        // InventoryTransaction row — never edited directly elsewhere, so the
        // two stay in sync.
        public int StockQuantity { get; set; }
    }
}