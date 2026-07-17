using System.Threading.Tasks;

namespace converge_server.Services.Interfaces
{
    public interface IQuotationPdfService
    {
        Task<byte[]> GeneratePdfAsync(Models.Entities.Quotation quotation);
    }
}
