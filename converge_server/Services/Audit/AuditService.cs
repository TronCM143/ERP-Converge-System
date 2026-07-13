using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using converge_server.Data;
using converge_server.Models.DTOs.Audit;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.Audit
{
    public class AuditService : IAuditService
    {
        private readonly AppDbContext _context;

        public AuditService(AppDbContext context)
        {
            _context = context;
        }

        public async Task LogAsync(string entityType, string entityId, string action, string changedBy, string? oldValue = null, string? newValue = null, string? details = null)
        {
            var auditLog = new AuditLog
            {
                EntityType = entityType,
                EntityId = entityId,
                Action = action,
                ChangedBy = changedBy,
                ChangedAt = DateTime.UtcNow,
                OldValue = oldValue,
                NewValue = newValue,
                Details = details
            };

            _context.AuditLogs.Add(auditLog);
            await _context.SaveChangesAsync();
        }

        public async Task<List<AuditLogResponseDto>> GetHistoryAsync(string entityType, string entityId)
        {
            return await _context.AuditLogs
                .AsNoTracking()
                .Where(a => a.EntityType == entityType && a.EntityId == entityId)
                .OrderByDescending(a => a.ChangedAt)
                .Select(a => new AuditLogResponseDto
                {
                    Id = a.Id,
                    EntityType = a.EntityType,
                    EntityId = a.EntityId,
                    Action = a.Action,
                    ChangedBy = a.ChangedBy,
                    ChangedAt = a.ChangedAt,
                    OldValue = a.OldValue,
                    NewValue = a.NewValue,
                    Details = a.Details
                })
                .ToListAsync();
        }

        public async Task<List<AuditLogResponseDto>> GetRecentAsync(int limit)
        {
            // Global activity feed: everything sales/purchasing did, minus notification-dispatch noise
            return await _context.AuditLogs
                .AsNoTracking()
                .Where(a => a.EntityType != "Notification")
                .OrderByDescending(a => a.ChangedAt)
                .Take(limit)
                .Select(a => new AuditLogResponseDto
                {
                    Id = a.Id,
                    EntityType = a.EntityType,
                    EntityId = a.EntityId,
                    Action = a.Action,
                    ChangedBy = a.ChangedBy,
                    ChangedAt = a.ChangedAt,
                    OldValue = a.OldValue,
                    NewValue = a.NewValue,
                    Details = a.Details
                })
                .ToListAsync();
        }
    }
}
