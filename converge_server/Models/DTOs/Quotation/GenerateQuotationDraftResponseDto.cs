namespace converge_server.Models.DTOs.Quotation
{
    public class GenerateQuotationDraftResponseDto
    {
        public string OriginalPrompt { get; set; } = string.Empty;
        public List<GenerateQuotationDraftItemDto> Items { get; set; } = new List<GenerateQuotationDraftItemDto>();
    }
}
