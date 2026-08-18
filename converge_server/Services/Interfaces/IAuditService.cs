using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using converge_server.Models.DTOs.Audit;

namespace converge_server.Services.Interfaces
{
    public interface IAuditService
    {
        Task LogAsync(string entityType, string entityId, string action, string changedBy, string? oldValue = null, string? newValue = null, string? details = null);
        Task<List<AuditLogResponseDto>> GetHistoryAsync(string entityType, string entityId);
        /* entityTypes narrows the feed to one module's records ("PurchaseRequest",
           "Product" for purchasing; "Client", "Quotation" for sales). Filtering here
           rather than in the client matters: the limit is applied AFTER the filter,
           so a busy sales day can't crowd every purchasing row out of the page. */
        Task<List<AuditLogResponseDto>> GetRecentAsync(int limit, string? changedBy = null, List<string>? entityTypes = null);
    }
}
