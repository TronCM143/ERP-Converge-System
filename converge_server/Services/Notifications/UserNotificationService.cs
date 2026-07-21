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

        public async Task<List<UserNotification>> GetForRoleAsync(string role, int limit = 30)
        {
            var stored = await _context.UserNotifications
                .AsNoTracking()
                .Where(n => n.TargetRole == role)
                .OrderByDescending(n => n.CreatedAt)
                .Take(limit)
                .ToListAsync();

            if (role != "purchasing")
            {
                return stored;
            }

            var reminders = await GetDeliveryTodayRemindersAsync();
            return reminders.Concat(stored).ToList();
        }

        // "Delivery today" isn't a one-time event, so it isn't stored — it's
        // recomputed live from BOM items whenever purchasing loads their
        // notifications, and merged into the same feed with negative ids so
        // it never collides with a real, persisted row.
        private async Task<List<UserNotification>> GetDeliveryTodayRemindersAsync()
        {
            var today = DateTime.UtcNow.Date;
            var dueItems = await _context.BillOfMaterialItems
                .AsNoTracking()
                .Include(i => i.BillOfMaterial)
                    .ThenInclude(b => b!.PurchaseRequest)
                .Where(i => i.DeliveryDate.HasValue
                    && i.DeliveryDate.Value.Date == today
                    && i.Status != "Received"
                    && i.Status != "Cancelled")
                .ToListAsync();

            return dueItems.Select((item, index) => new UserNotification
            {
                Id = -1 - index,
                TargetRole = "purchasing",
                Type = "DeliveryToday",
                Title = $"🚚 {item.ItemName.Replace('_', ' ')} arriving today — {item.BillOfMaterial?.PurchaseRequest?.ClientName ?? "Unknown client"}",
                Details = item.BillOfMaterial?.PurchaseRequest?.PRNumber,
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            }).ToList();
        }

        public async Task MarkAllReadAsync(string role)
        {
            await _context.UserNotifications
                .Where(n => n.TargetRole == role && !n.IsRead)
                .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));
        }
    }
}
