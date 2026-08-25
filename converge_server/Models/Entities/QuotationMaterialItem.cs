using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public class QuotationMaterialItem
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int QuotationId { get; set; }

        [ForeignKey(nameof(QuotationId))]
        public Quotation? Quotation { get; set; }

        // Product catalog link (optional, mirrors PurchaseRequestItem's pattern)
        public int? ProductId { get; set; }

        [ForeignKey(nameof(ProductId))]
        public Product? Product { get; set; }

        [Required]
        [MaxLength(300)]
        public string ItemName { get; set; } = string.Empty;

        [Required]
        public string Specification { get; set; } = string.Empty;

        [Required]
        [MaxLength(150)]
        public string Model { get; set; } = string.Empty;

        [Required]
        public int Quantity { get; set; }

        [Required]
        [MaxLength(20)]
        public string Unit { get; set; } = "pcs";

        [Column(TypeName = "decimal(14,2)")]
        public decimal UnitPrice { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal TaxPercent { get; set; }

        /* Flat peso amount off this line (NOT a percentage — TaxPercent is).
           The column already existed but this property had gone missing, so the
           discount the quotation editor sends was silently dropped on every
           save and never reached the totals. */
        [Column(TypeName = "decimal(18,2)")]
        public decimal DiscountAmount { get; set; }

        /* Snapshot of the product's reference data, copied when the line is
           created. The spec is explicit that a quotation uses the product's
           information AS AT generation: a catalog edit next month must not
           silently rewrite a quotation already sent to a client, and a product
           later deactivated or deleted must not blank an old quote's PDF.
           ItemName, Model and Specification already worked this way; these
           extend the same snapshot to what the document actually renders. */
        [MaxLength(60)]
        public string? Sku { get; set; }

        [MaxLength(100)]
        public string? Brand { get; set; }

        [MaxLength(500)]
        public string? ImageUrl { get; set; }

        [MaxLength(500)]
        public string? DatasheetUrl { get; set; }

        [MaxLength(150)]
        public string? Manufacturer { get; set; }

        public int SortOrder { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal LineTotal { get; set; }
    }
}
