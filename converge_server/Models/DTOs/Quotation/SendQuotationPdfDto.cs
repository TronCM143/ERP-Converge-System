namespace converge_server.Models.DTOs.Quotation
{
    public class SendQuotationPdfDto
    {
        public List<string> Emails { get; set; } = new();
    }
}
