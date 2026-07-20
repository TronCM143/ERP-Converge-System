using System.Threading.Tasks;

namespace converge_server.Services.Interfaces
{
    public interface IPurchaseRequestPdfService
    {
        Task<byte[]> GeneratePdfAsync(Models.Entities.PurchaseRequest purchaseRequest);
    }
}
