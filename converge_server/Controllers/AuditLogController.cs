using System;
using System.Linq;
using System.Threading.Tasks;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace converge_server.Controllers
{
    [ApiController]
    [Route("api/audit-logs")]
    [Authorize]
    public class AuditLogController : ControllerBase
    {
        private readonly IAuditService _auditService;

        public AuditLogController(IAuditService auditService)
        {
            _auditService = auditService;
        }

        [HttpGet]
        public async Task<IActionResult> GetHistory([FromQuery] string entityType, [FromQuery] string entityId)
        {
            if (string.IsNullOrWhiteSpace(entityType) || string.IsNullOrWhiteSpace(entityId))
            {
                return BadRequest("entityType and entityId are required.");
            }

            var history = await _auditService.GetHistoryAsync(entityType, entityId);
            return Ok(history);
        }

        [HttpGet("recent")]
        // entityTypes is a comma-separated list ("PurchaseRequest,Product"); omitted
        // means every type. It is what makes the purchasing feed a purchasing feed
        // rather than a copy of the sales one.
        public async Task<IActionResult> GetRecent(
            [FromQuery] int limit = 30,
            [FromQuery] string? changedBy = null,
            [FromQuery] string? entityTypes = null)
        {
            if (limit < 1) limit = 1;
            if (limit > 100) limit = 100;

            var types = string.IsNullOrWhiteSpace(entityTypes)
                ? null
                : entityTypes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

            var recent = await _auditService.GetRecentAsync(
                limit,
                string.IsNullOrWhiteSpace(changedBy) ? null : changedBy,
                types);
            return Ok(recent);
        }
    }
}
