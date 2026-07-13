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

        public int SortOrder { get; set; }

        [Column(TypeName = "decimal(14,2)")]
        public decimal LineTotal { get; set; }
    }
}
