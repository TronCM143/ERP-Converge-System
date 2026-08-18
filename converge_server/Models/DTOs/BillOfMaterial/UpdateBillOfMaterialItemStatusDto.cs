using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.BillOfMaterial
{
    public class UpdateBillOfMaterialItemStatusDto
    {
        [Required]
        public string Status { get; set; } = string.Empty;

        public string? Remarks { get; set; }

        // Date this item was ordered from the supplier (yyyy-MM-dd).
        public DateTime? OrderDate { get; set; }

        // Expected arrival date assigned by purchasing staff (yyyy-MM-dd).
        public DateTime? DeliveryDate { get; set; }

        // Null means "leave unchanged"; an empty string clears the supplier.
        public string? Supplier { get; set; }

        // Same convention as Supplier.
        public string? SupplierAddress { get; set; }

        /* Everything below was already being sent by the purchasing table and
           had nowhere to land: model binding dropped each one silently, so the
           request succeeded and the edit vanished. That is why the attachment's
           delete button appeared to do nothing, and why a changed quantity,
           price, discount or tax reverted on the next refresh.

           Null means "leave unchanged" throughout; the two Clear* flags are the
           explicit resets, since null cannot express "set this back to empty". */
        public bool ClearEvidence { get; set; }

        public decimal? UnitPrice { get; set; }

        public bool ClearUnitPrice { get; set; }

        public decimal? DiscountAmount { get; set; }

        public decimal? TaxPercent { get; set; }

        public int? RequiredQuantity { get; set; }
    }
}
