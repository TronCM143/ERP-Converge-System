using System.Security.Claims;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    [ApiController]
    [Route("api/notifications")]
    [Authorize]
    public class NotificationsController : ControllerBase
    {
        private readonly IUserNotificationService _notificationService;

        public NotificationsController(IUserNotificationService notificationService)
        {
            _notificationService = notificationService;
        }

        private string? CallerRole => User.FindFirstValue(ClaimTypes.Role);

        [HttpGet]
        public async Task<IActionResult> GetMine()
        {
            var role = CallerRole;
            if (string.IsNullOrEmpty(role)) return Ok(Array.Empty<object>());

            var list = await _notificationService.GetForRoleAsync(role);
            return Ok(list.Select(n => new
            {
                n.Id,
                n.Type,
                n.Title,
                n.Details,
                n.IsRead,
                n.CreatedAt
            }));
        }

        [HttpPut("mark-read")]
        public async Task<IActionResult> MarkAllRead()
        {
            var role = CallerRole;
            if (string.IsNullOrEmpty(role)) return NoContent();

            await _notificationService.MarkAllReadAsync(role);
            return NoContent();
        }
    }
}
