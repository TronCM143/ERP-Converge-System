namespace converge_server.Models.DTOs.Notification
{
    public class CreateNotificationRecipientDto
    {
        public string Name { get; set; } = null!;
        public string? Email { get; set; }
        public string? Phone { get; set; }
    }
}
