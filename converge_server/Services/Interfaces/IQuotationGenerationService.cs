using converge_server.Models.DTOs.Quotation;

namespace converge_server.Services.Interfaces
{
    public interface IQuotationGenerationService
    {
        Task<GenerateQuotationDraftResponseDto> GenerateDraftAsync(string prompt);
    }
}
