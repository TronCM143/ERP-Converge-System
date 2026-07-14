namespace converge_server.Models.DTOs.Quotation
{
    public class QuotationMaterialItemResponseDto
    {
        public int Id { get; set; }
        public int? ProductId { get; set; }
        public string ItemName { get; set; } = string.Empty;
        public string Note { get; set; } = string.Empty;
        public string Model { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public string Unit { get; set; } = string.Empty;
        public decimal UnitPrice { get; set; }
        public decimal TaxPercent { get; set; }
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
        public string QuotationName { get; set; } = string.Empty;
        public string? OriginalPrompt { get; set; }
        public string? Notes { get; set; }
        public int ClientId { get; set; }
        public string ClientName { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
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
