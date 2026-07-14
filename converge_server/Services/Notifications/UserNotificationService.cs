using converge_server.Data;
using converge_server.Hubs;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Services.Notifications
{
    public class UserNotificationService : IUserNotificationService
    {
        private readonly AppDbContext _context;
        private readonly IHubContext<NotificationHub> _hubContext;
        private readonly ILogger<UserNotificationService> _logger;

        public UserNotificationService(AppDbContext context, IHubContext<NotificationHub> hubContext, ILogger<UserNotificationService> logger)
        {
            _context = context;
            _hubContext = hubContext;
            _logger = logger;
        }

        public async Task<UserNotification> AddAsync(string targetRole, string type, string title, string? details = null)
        {
            var notification = new UserNotification
            {
                TargetRole = targetRole,
                Type = type,
                Title = title,
                Details = details,
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            };

            _context.UserNotifications.Add(notification);
            await _context.SaveChangesAsync();

            // Live push is best-effort: the row is already stored, so a
            // disconnected client will pick it up on the next page load.
            try
            {
                await _hubContext.Clients.Group(targetRole).SendAsync("UserNotification", new
                {
                    notification.Id,
                    notification.Type,
                    notification.Title,
                    notification.Details,
                    notification.IsRead,
                    notification.CreatedAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to push notification {Id} to group {Role}", notification.Id, targetRole);
            }

            return notification;
        }

        public Task<List<UserNotification>> GetForRoleAsync(string role, int limit = 30)
        {
            return _context.UserNotifications
                .AsNoTracking()
                .Where(n => n.TargetRole == role)
                .OrderByDescending(n => n.CreatedAt)
                .Take(limit)
                .ToListAsync();
        }

        public async Task MarkAllReadAsync(string role)
        {
            await _context.UserNotifications
                .Where(n => n.TargetRole == role && !n.IsRead)
                .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));
        }
    }
}
