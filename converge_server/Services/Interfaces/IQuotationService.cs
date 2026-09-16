using converge_server.Models.DTOs.Quotation;
using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface IQuotationService
    {
        Task<Quotation> CreateQuotationAsync(CreateQuotationDto dto);

        /* The reference the NEXT created quotation would be given, so the
           editor can show it in its header before anything is saved.
           A preview, not a reservation: it takes no lock and reserves no
           sequence, so two people starting a quotation at the same moment
           both see the same string and the second one to save gets the
           following number. Nothing is built on it being final. */
        Task<string> GetNextQuotationNumberAsync();
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
