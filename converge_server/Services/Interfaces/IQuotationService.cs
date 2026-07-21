using converge_server.Models.DTOs.Quotation;
using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface IQuotationService
    {
        Task<Quotation> CreateQuotationAsync(CreateQuotationDto dto);
        Task<Quotation> UpdateQuotationAsync(int quotationId, CreateQuotationDto dto, string actorUsername);
        Task<IEnumerable<Quotation>> GetQuotationsAsync(int? clientId = null);
        Task<Quotation?> GetQuotationAsync(int quotationId);
        Task<PurchaseRequest> SendToPurchasingAsync(int quotationId);
        Task<bool> ApproveAsync(int quotationId, string actorUsername, List<string>? notifyEmails = null);
        Task RejectAsync(int quotationId, string actorUsername);
        Task<(byte[] Bytes, string FileName)> GenerateQuotationPdfAsync(int quotationId);
        Task<int> SendQuotationPdfAsync(int quotationId, List<string> emails, string actorUsername);
    }
}
