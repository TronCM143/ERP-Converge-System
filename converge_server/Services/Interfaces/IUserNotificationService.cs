using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface IUserNotificationService
    {
        /// <summary>Persist a notification for a role and push it live over SignalR.</summary>
        Task<UserNotification> AddAsync(string targetRole, string type, string title, string? details = null, string? linkUrl = null);

        Task<List<UserNotification>> GetForRoleAsync(string role, int limit = 30);

        Task MarkAllReadAsync(string role);

        /// <summary>
        /// Mark one notification read. Returns false when the id doesn't belong
        /// to this role, or is a synthetic (negative-id) live reminder that has
        /// no stored row to update.
        /// </summary>
        Task<bool> MarkReadAsync(string role, long id);
    }
}
