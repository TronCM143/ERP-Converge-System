using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public class PurchaseOrder
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        // Parent BOM
        [Required]
        public Guid BillOfMaterialId { get; set; }

        [ForeignKey(nameof(BillOfMaterialId))]
        public BillOfMaterial? BillOfMaterial { get; set; }

        // Supplier (FK will be added later)
        public Guid? SupplierId { get; set; }

        [Required]
        [MaxLength(20)]
        public string PONumber { get; set; } = string.Empty;

        public DateTime OrderDate { get; set; } = DateTime.Now;

        public DateTime? ExpectedArrivalDate { get; set; }

        [Required]
        public string ShippingAddress { get; set; } = string.Empty;

        public decimal UntaxedAmount { get; set; }

        public decimal VATAmount { get; set; }

        public decimal DiscountAmount { get; set; }

        public decimal GrandTotal { get; set; }

        [Required]
        [MaxLength(30)]
        public string Status { get; set; } = "Draft";

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public DateTime? UpdatedAt { get; set; }

        public string? Remarks { get; set; }
        // Navigation
        public ICollection<PurchaseOrderItem> Items { get; set; } = new List<PurchaseOrderItem>();
    }
}