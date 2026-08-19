using System;
using System.Collections.Generic;

namespace converge_server.Models.Entities
{
    public enum NotificationType
    {
        StageChanged = 0,
        WonApproval = 1,
        PurchaseRequestCompleted = 2,
        // A quotation is waiting on engineer sign-off.
        QuotationApproval = 3
    }

    public class NotificationRecipient
    {
        public int Id { get; set; }
        public string Name { get; set; } = null!;
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<NotificationPreference> Preferences { get; set; } = new List<NotificationPreference>();
    }

    public class NotificationPreference
    {
        public int Id { get; set; }
        public int NotificationRecipientId { get; set; }
        public NotificationRecipient? Recipient { get; set; }
        public NotificationType Type { get; set; }
        public bool EmailEnabled { get; set; } = true;
        public bool SmsEnabled { get; set; } = false;
    }
}
