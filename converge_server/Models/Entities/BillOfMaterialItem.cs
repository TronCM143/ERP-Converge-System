using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace converge_server.Models.Entities
{
    public class BillOfMaterialItem
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        // Parent BOM
        [Required]
        public Guid BillOfMaterialId { get; set; }

        [ForeignKey(nameof(BillOfMaterialId))]
        public BillOfMaterial? BillOfMaterial { get; set; }

        // Original PR Item
        [Required]
        public Guid PurchaseRequestItemId { get; set; }

        [ForeignKey(nameof(PurchaseRequestItemId))]
        public PurchaseRequestItem? PurchaseRequestItem { get; set; }

        // Item Information
        [Required]
        [MaxLength(200)]
        public string ItemName { get; set; } = string.Empty;

        [Required]
        public int RequiredQuantity { get; set; }

        [Required]
        [MaxLength(50)]
        public string Unit { get; set; } = "pcs";


        // Inventory Status
        public int AvailableStock { get; set; } = 0;

        public int QuantityToPurchase { get; set; } = 0;

        // Procurement Status
        [Required]
        [MaxLength(30)]
        public string Status { get; set; } = "Pending";

        // Date this item was ordered from the supplier, editable independently
        // of any generated Purchase Order.
        public DateTime? OrderDate { get; set; }

        // Expected arrival date assigned by purchasing staff.
        public DateTime? DeliveryDate { get; set; }

        // Stamped automatically the moment the item is marked Received.
        public DateTime? ReceivedAt { get; set; }

        public string? Remarks { get; set; }

        // Who this item is being purchased from.
        [MaxLength(200)]
        public string? Supplier { get; set; }

        // Uploaded proof of the transaction backing the current status
        // (receipt / delivery photo), e.g. "/images/evidence/{id}-{ticks}.jpg".
        public string? EvidenceImageUrl { get; set; }
    }
}