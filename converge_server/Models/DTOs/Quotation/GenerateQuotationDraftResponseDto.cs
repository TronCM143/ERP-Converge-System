namespace converge_server.Models.DTOs.Quotation
{
    public class GenerateQuotationDraftResponseDto
    {
        public string OriginalPrompt { get; set; } = string.Empty;
        public List<GenerateQuotationDraftItemDto> Items { get; set; } = new List<GenerateQuotationDraftItemDto>();
        // Labor mentioned in the prompt itself (e.g. "installation for 2 days
        // 3 people") - extracted separately from physical items since it maps
        // to the quotation's Labor section, not a product row. Null fields
        // mean that aspect wasn't mentioned.
        public GenerateQuotationLaborSuggestionDto? Labor { get; set; }
    }

    public class GenerateQuotationLaborSuggestionDto
    {
        public int? Persons { get; set; }
        public int? Days { get; set; }
    }
}
