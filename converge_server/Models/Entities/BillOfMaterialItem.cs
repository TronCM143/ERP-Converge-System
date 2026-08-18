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

        /* Procurement pricing.

           These COLUMNS already existed in the database but the properties had
           gone missing from this entity, so EF never mapped them: the API
           returned no price, the frontend's BOMItem.price was always undefined,
           and bomTotals() — which skips any line with a null price — summed
           every PO/PR to ₱0.00 while the item table showed rows.

           UnitPrice is nullable on purpose: an item with no linked product has
           no price yet, and a null line is excluded from the totals rather than
           counted as free. Discount is a flat peso amount off the line; tax is
           a percentage of the line's gross. */
        [Column(TypeName = "decimal(14,2)")]
        public decimal? UnitPrice { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal DiscountAmount { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal TaxPercent { get; set; }

        // Who this item is being purchased from.
        [MaxLength(200)]
        public string? Supplier { get; set; }

        // Where that supplier is — a street address, a store, a branch. Its own
        // column rather than free text inside Remarks: the note is the buyer's
        // running commentary on the line, and burying an address in it makes
        // the address unreadable by anything but a human.
        [MaxLength(300)]
        public string? SupplierAddress { get; set; }

        // Uploaded proof of the transaction backing the current status
        // (receipt / delivery photo), e.g. "/images/evidence/{id}-{ticks}.jpg".
        public string? EvidenceImageUrl { get; set; }
    }
}