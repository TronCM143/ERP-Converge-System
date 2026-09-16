using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface ISalesTrackerService
    {
        Task<bool> SyncQuotationAsync(Quotation quotation, Client client);
    }
}