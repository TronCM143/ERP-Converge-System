using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface IUserNotificationService
    {
        /// <summary>Persist a notification for a role and push it live over SignalR.</summary>
        Task<UserNotification> AddAsync(string targetRole, string type, string title, string? details = null);

        Task<List<UserNotification>> GetForRoleAsync(string role, int limit = 30);

        Task MarkAllReadAsync(string role);
    }
}
