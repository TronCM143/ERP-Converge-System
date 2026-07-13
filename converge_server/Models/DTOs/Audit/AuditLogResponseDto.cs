using System;

namespace converge_server.Models.DTOs.Audit
{
    public class AuditLogResponseDto
    {
        public long Id { get; set; }
        public string EntityType { get; set; } = null!;
        public string EntityId { get; set; } = null!;
        public string Action { get; set; } = null!;
        public string ChangedBy { get; set; } = null!;
        public DateTime ChangedAt { get; set; }
        public string? OldValue { get; set; }
        public string? NewValue { get; set; }
        public string? Details { get; set; }
    }
}
