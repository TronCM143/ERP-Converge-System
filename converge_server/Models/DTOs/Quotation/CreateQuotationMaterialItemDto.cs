using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.DTOs.Quotation
{
    public class CreateQuotationMaterialItemDto
    {
        [Required]
        public int ProductId { get; set; }

        [Required]
        [Range(1, int.MaxValue)]
        public int Quantity { get; set; }

        // Optional override; defaults to the product's catalog price when omitted
        public decimal? UnitPrice { get; set; }

        [Range(0, 100)]
        public int TaxPercent { get; set; } = 0;

        public string Unit { get; set; } = "pcs";

        // Free-text note from the sales team about this line item (e.g. "needs black casing")
        public string? Note { get; set; }
    }
}
