using converge_server.Models.Entities;

namespace converge_server.Models.DTOs.Notification
{
    public class UpdateNotificationPreferenceDto
    {
        public NotificationType Type { get; set; }
        public bool EmailEnabled { get; set; }
        public bool SmsEnabled { get; set; }
    }
}
