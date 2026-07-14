using System.ComponentModel.DataAnnotations;

namespace converge_server.Models.Entities
{
    /// <summary>
    /// Persisted in-app notification targeted at a role (e.g. "quotation").
    /// Stored so notifications survive refreshes and offline periods; the
    /// SignalR broadcast is only the live-push side of the same record.
    /// </summary>
    public class UserNotification
    {
        [Key]
        public long Id { get; set; }

        // Which role's header should show this ("quotation", "purchasing", "admin").
        [Required]
        [MaxLength(30)]
        public string TargetRole { get; set; } = string.Empty;

        // Machine-readable kind, e.g. "PurchaseOrderCreated".
        [Required]
        [MaxLength(50)]
        public string Type { get; set; } = string.Empty;

        // Ticker/dropdown text, e.g. "PO-xxx generated from Quotation QTN-xxx".
        [Required]
        [MaxLength(300)]
        public string Title { get; set; } = string.Empty;

        // Secondary line (client name, totals, ...).
        [MaxLength(300)]
        public string? Details { get; set; }

        public bool IsRead { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
