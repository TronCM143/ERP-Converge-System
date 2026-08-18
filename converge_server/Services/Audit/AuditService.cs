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

        public async Task<List<AuditLogResponseDto>> GetRecentAsync(int limit, string? changedBy = null, List<string>? entityTypes = null)
        {
            // Activity feed: everything sales/purchasing did, minus notification-dispatch
            // noise. Narrowed to one actor when changedBy is supplied, and to one module's
            // record types when entityTypes is — the filters are composed here rather than
            // in one expression so EF can translate each to a plain WHERE / IN.
            var query = _context.AuditLogs
                .AsNoTracking()
                .Where(a => a.EntityType != "Notification");

            if (changedBy != null)
            {
                query = query.Where(a => a.ChangedBy == changedBy);
            }

            if (entityTypes != null && entityTypes.Count > 0)
            {
                query = query.Where(a => entityTypes.Contains(a.EntityType));
            }

            return await query
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
