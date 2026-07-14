using System.Collections.Generic;
using System.Threading.Tasks;
using converge_server.Models.DTOs.Notification;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    [ApiController]
    [Route("api/admin/notification-recipients")]
    [Authorize(Roles = "admin,quotation")]
    public class NotificationRecipientsController : ControllerBase
    {
        private readonly INotificationRecipientService _recipientService;
        private readonly INotificationDispatchService _dispatchService;

        public NotificationRecipientsController(
            INotificationRecipientService recipientService,
            INotificationDispatchService dispatchService)
        {
            _recipientService = recipientService;
            _dispatchService = dispatchService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var recipients = await _recipientService.GetAllAsync();
            return Ok(recipients);
        }

        [HttpGet("{recipientId}")]
        public async Task<IActionResult> Get(int recipientId)
        {
            var recipient = await _recipientService.GetAsync(recipientId);
            if (recipient == null)
                return NotFound(new { error = "Recipient not found." });

            return Ok(recipient);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateNotificationRecipientDto dto)
        {
            try
            {
                var recipient = await _recipientService.CreateAsync(dto);
                return CreatedAtAction(nameof(Get), new { recipientId = recipient.Id }, recipient);
            }
            catch (System.ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPut("{recipientId}")]
        public async Task<IActionResult> Update(int recipientId, [FromBody] UpdateNotificationRecipientDto dto)
        {
            try
            {
                var recipient = await _recipientService.UpdateAsync(recipientId, dto);
                if (recipient == null)
                    return NotFound(new { error = "Recipient not found." });

                return Ok(recipient);
            }
            catch (System.ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpDelete("{recipientId}")]
        public async Task<IActionResult> Delete(int recipientId)
        {
            var success = await _recipientService.DeleteAsync(recipientId);
            if (!success)
                return NotFound(new { error = "Recipient not found." });

            return NoContent();
        }

        [HttpPut("{recipientId}/preferences")]
        public async Task<IActionResult> UpdatePreferences(int recipientId, [FromBody] List<UpdateNotificationPreferenceDto> preferences)
        {
            var success = await _recipientService.UpdatePreferencesAsync(recipientId, preferences);
            if (!success)
                return NotFound(new { error = "Recipient not found." });

            var recipient = await _recipientService.GetAsync(recipientId);
            return Ok(recipient);
        }

        [HttpPost("test")]
        public async Task<IActionResult> SendTest([FromBody] SendTestNotificationDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Type))
                return BadRequest(new { error = "Type is required." });

            if (!System.Enum.TryParse<NotificationType>(dto.Type, ignoreCase: true, out var notificationType))
                return BadRequest(new { error = $"Invalid notification type: {dto.Type}" });

            var subject = "Test Notification from Converge";
            var body = $"<p>This is a test notification for <strong>{notificationType}</strong>.</p><p>If you received this, your notification settings are working correctly.</p>";

            await _dispatchService.DispatchAsync(notificationType, subject, body);

            return Ok(new { message = "Test notification sent to all active recipients." });
        }
    }

    public class SendTestNotificationDto
    {
        public string Type { get; set; } = null!;
        public int? RecipientId { get; set; }
    }
}
