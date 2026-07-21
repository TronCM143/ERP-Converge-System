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
        Task<List<AuditLogResponseDto>> GetRecentAsync(int limit, string? changedBy = null);
    }
}
