using converge_server.Models.DTOs.Quotation;
using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface IQuotationService
    {
        Task<Quotation> CreateQuotationAsync(CreateQuotationDto dto);
        Task<IEnumerable<Quotation>> GetQuotationsAsync(int? clientId = null);
        Task<Quotation?> GetQuotationAsync(int quotationId);
        Task<PurchaseRequest> SendToPurchasingAsync(int quotationId);
        Task ApproveAsync(int quotationId, string actorUsername);
        Task RejectAsync(int quotationId, string actorUsername);
    }
}
