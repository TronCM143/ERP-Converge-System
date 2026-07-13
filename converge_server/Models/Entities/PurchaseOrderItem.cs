using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public class PurchaseOrderItem
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        // Parent Purchase Order
        [Required]
        public Guid PurchaseOrderId { get; set; }

        [ForeignKey(nameof(PurchaseOrderId))]
        public PurchaseOrder? PurchaseOrder { get; set; }

        // Source BOM Item
        [Required]
        public Guid BillOfMaterialItemId { get; set; }

        [ForeignKey(nameof(BillOfMaterialItemId))]
        public BillOfMaterialItem? BillOfMaterialItem { get; set; }

        [Required]
        [MaxLength(200)]
        public string ItemName { get; set; } = string.Empty;

        [Required]
        public int Quantity { get; set; }

        [Required]
        [MaxLength(20)]
        public string Unit { get; set; } = "pcs";

        [Column(TypeName = "numeric(18,2)")]
        public decimal UnitPrice { get; set; }

        [Column(TypeName = "numeric(18,2)")]
        public decimal DiscountAmount { get; set; }

        [Column(TypeName = "numeric(18,2)")]
        public decimal VATAmount { get; set; }

        [Column(TypeName = "numeric(18,2)")]
        public decimal LineTotal { get; set; }

        public string? Remarks { get; set; }
    }
}