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

        // True once an image search has been attempted for this product,
        // regardless of outcome — prevents re-searching on every click when
        // nothing was found. Cleared only by an explicit manual refresh.
        public bool ImageSearchAttempted { get; set; }
    }
}