using System;

namespace converge_server.Models.Entities
{
    public class AuditLog
    {
        public long Id { get; set; }
        public string EntityType { get; set; } = null!; // "Client", "Quotation", "PurchaseRequest", "Product", etc.
        public string EntityId { get; set; } = null!; // stringified PK (int or Guid)
        public string Action { get; set; } = null!; // "Created", "Updated", "StageChanged", "Approved", "Rejected", etc.
        public string ChangedBy { get; set; } = null!; // username, or "system"
        public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
        public string? OldValue { get; set; } // free text or JSON
        public string? NewValue { get; set; }
        public string? Details { get; set; } // human-readable one-liner for the timeline UI
    }
}
