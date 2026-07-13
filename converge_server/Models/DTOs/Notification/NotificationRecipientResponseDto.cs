using System;
using System.Collections.Generic;
using converge_server.Models.Entities;

namespace converge_server.Models.DTOs.Notification
{
    public class NotificationRecipientResponseDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = null!;
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public List<NotificationPreferenceDto> Preferences { get; set; } = new();
    }

    public class NotificationPreferenceDto
    {
        public NotificationType Type { get; set; }
        public bool EmailEnabled { get; set; }
        public bool SmsEnabled { get; set; }
    }
}
