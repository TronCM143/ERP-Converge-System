namespace converge_server.Models.DTOs.Quotation
{
    public class QuotationMaterialItemResponseDto
    {
        public int Id { get; set; }
        public int? ProductId { get; set; }
        public string ItemName { get; set; } = string.Empty;
        public string Note { get; set; } = string.Empty;
        public string Model { get; set; } = string.Empty;
        // Product reference data as it stood when the line was created.
        public string? Sku { get; set; }
        public string? Brand { get; set; }
        public string? ImageUrl { get; set; }
        public string? DatasheetUrl { get; set; }
        public string? Manufacturer { get; set; }
        public int Quantity { get; set; }
        public string Unit { get; set; } = string.Empty;
        public decimal UnitPrice { get; set; }
        public decimal TaxPercent { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal LineTotal { get; set; }
    }

    public class QuotationLaborItemResponseDto
    {
        public int Id { get; set; }
        public string Description { get; set; } = string.Empty;
        public int Days { get; set; }
        public int Persons { get; set; }
        public decimal RatePerPersonPerDay { get; set; }
        public decimal LineTotal { get; set; }
    }

    public class QuotationResponseDto
    {
        public int Id { get; set; }
        public string QuotationNumber { get; set; } = string.Empty;
        public string ServiceRequestNumber { get; set; } = string.Empty;
        public string QuotationName { get; set; } = string.Empty;
        public string? ProjectType { get; set; }
        public string? ProcurementType { get; set; }
        public string? OriginalPrompt { get; set; }
        public string? Notes { get; set; }
        public string? EndorsedBy { get; set; }
        public DateTime? EndorsementDate { get; set; }
        public int ClientId { get; set; }
        public string ClientName { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;

        /// <summary>
        /// Engineer sign-off state: NotRequired / Pending / Approved / Rejected.
        /// Separate from Status, which means won/lost.
        /// </summary>
        public string ApprovalState { get; set; } = string.Empty;

        /// <summary>Reason from the most recent rejection, so sales can act on it.</summary>
        public string? RejectionReason { get; set; }
        public decimal MaterialsTotal { get; set; }
        public decimal LaborTotal { get; set; }
        public decimal GrandTotal { get; set; }
        public Guid? PurchaseRequestId { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<QuotationMaterialItemResponseDto> MaterialItems { get; set; } = new List<QuotationMaterialItemResponseDto>();
        public List<QuotationLaborItemResponseDto> LaborItems { get; set; } = new List<QuotationLaborItemResponseDto>();
    }
}
