namespace converge_server.Models.DTOs.Quotation
{
    public class GenerateQuotationDraftItemDto
    {
        // What the LLM extracted from the prompt, verbatim-ish (e.g. "Dahua CCTV camera").
        public string RequestedDescription { get; set; } = string.Empty;

        public int Quantity { get; set; } = 1;

        public bool Matched { get; set; }

        // Populated only when Matched is true.
        public int? ProductId { get; set; }
        public string? ProductName { get; set; }
        public string? Brand { get; set; }
        public string? Model { get; set; }
        public string? Category { get; set; }
        public decimal? UnitPrice { get; set; }
    }
}
