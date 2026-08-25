using System.ComponentModel.DataAnnotations;
using converge_server.Data;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace converge_server.Controllers
{
    /* Quotation approvals: sales submits, an engineer decides.

       Roles are split deliberately. Submitting is a sales action, deciding is
       not — an account that can raise a quotation must not be able to approve
       its own, or the gate is decorative. Admin can read the dashboard and
       decide as an escalation path when no engineer is available. */
    [ApiController]
    [Route("api/approvals")]
    [Authorize]
    public class QuoteApprovalController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IQuoteApprovalService _approvalService;

        public QuoteApprovalController(AppDbContext context, IQuoteApprovalService approvalService)
        {
            _context = context;
            _approvalService = approvalService;
        }

        public class RejectDto
        {
            [Required]
            [MinLength(3)]
            [MaxLength(1000)]
            public string Reason { get; set; } = string.Empty;
        }

        public class ThresholdDto
        {
            [Range(0, 999_999_999)]
            public decimal Threshold { get; set; }
        }

        /// <summary>The dashboard feed. status: pending | approved | rejected | all.</summary>
        [HttpGet]
        [Authorize(Roles = "engineer,admin")]
        public async Task<IActionResult> GetApprovals([FromQuery] string status = "pending", [FromQuery] int limit = 50)
        {
            limit = Math.Clamp(limit, 1, 200);

            var query = _context.QuoteApprovals
                .AsNoTracking()
                .Include(a => a.Quotation)!
                .ThenInclude(q => q!.Client)
                .AsQueryable();

            query = status.ToLowerInvariant() switch
            {
                "approved" => query.Where(a => a.Status == QuoteApprovalStatus.Approved),
                "rejected" => query.Where(a => a.Status == QuoteApprovalStatus.Rejected),
                "all" => query,
                _ => query.Where(a => a.Status == QuoteApprovalStatus.Pending)
            };

            var rows = await query
                // Pending sorts oldest-first: the longest wait is the most
                // urgent. Decided lists sort newest-first, as history.
                .OrderBy(a => a.Status == QuoteApprovalStatus.Pending ? a.SubmittedAt : DateTime.MaxValue)
                .ThenByDescending(a => a.DecidedAt ?? a.SubmittedAt)
                .Take(limit)
                .Select(a => new
                {
                    a.Id,
                    a.QuotationId,
                    QuotationNumber = a.Quotation!.QuotationNumber,
                    QuotationName = a.Quotation.QuotationName,
                    ClientName = a.Quotation.Client != null ? a.Quotation.Client.Name : "",
                    Salesperson = a.SubmittedBy,
                    Amount = a.AmountAtSubmission,
                    ItemCount = a.Quotation.MaterialItems.Count,
                    a.SubmittedAt,
                    Status = a.Status.ToString(),
                    a.DecidedBy,
                    a.DecidedAt,
                    a.RejectionReason
                })
                .ToListAsync();

            return Ok(rows);
        }

        /// <summary>Counts behind the dashboard's headline tiles.</summary>
        [HttpGet("stats")]
        [Authorize(Roles = "engineer,admin")]
        public async Task<IActionResult> GetStats()
        {
            var since = DateTime.UtcNow.AddDays(-7);

            var stats = await _context.QuoteApprovals
                .AsNoTracking()
                .GroupBy(a => a.Status)
                .Select(g => new { Status = g.Key, Count = g.Count(), Value = g.Sum(a => a.AmountAtSubmission) })
                .ToListAsync();

            decimal ValueOf(QuoteApprovalStatus s) => stats.FirstOrDefault(x => x.Status == s)?.Value ?? 0m;
            int CountOf(QuoteApprovalStatus s) => stats.FirstOrDefault(x => x.Status == s)?.Count ?? 0;

            return Ok(new
            {
                pendingCount = CountOf(QuoteApprovalStatus.Pending),
                pendingValue = ValueOf(QuoteApprovalStatus.Pending),
                approvedCount = CountOf(QuoteApprovalStatus.Approved),
                approvedValue = ValueOf(QuoteApprovalStatus.Approved),
                rejectedCount = CountOf(QuoteApprovalStatus.Rejected),
                recentlySubmitted = await _context.QuoteApprovals.CountAsync(a => a.SubmittedAt >= since),
                threshold = await _approvalService.GetThresholdAsync()
            });
        }

        /// <summary>Whether this client may move Quote to Proposal, and why not.</summary>
        [HttpGet("gate/{clientId:int}")]
        [Authorize(Roles = "quotation,admin")]
        public async Task<IActionResult> GetGate(int clientId)
        {
            var gate = await _approvalService.EvaluateClientAsync(clientId);
            return Ok(new
            {
                allowed = gate.Allowed,
                reason = gate.Reason,
                quotationId = gate.QuotationId,
                quotationNumber = gate.QuotationNumber,
                amount = gate.Amount,
                threshold = await _approvalService.GetThresholdAsync()
            });
        }

        /* Who can be sent an approval request. Accounts that can actually decide
           one (engineer or admin) and are contactable - an approver with neither
           an email nor a phone cannot be notified, so offering them as a tick box
           would be a lie. Managed in Settings > Users. */
        [HttpGet("approvers")]
        [Authorize(Roles = "quotation,admin,engineer")]
        public async Task<IActionResult> GetApprovers()
        {
            var approvers = await _context.Users
                .AsNoTracking()
                .Where(u => (u.Role == "engineer" || u.Role == "admin")
                            && ((u.Email != null && u.Email != "") || (u.Phone != null && u.Phone != "")))
                .OrderBy(u => u.Username)
                .Select(u => new { u.Id, u.Username, u.Role, u.Email, u.Phone })
                .ToListAsync();

            return Ok(approvers);
        }

        public class SubmitDto
        {
            /// <summary>Approver user ids ticked in the dialog.</summary>
            public List<int>? NotifyUserIds { get; set; }
        }

        [HttpPost("submit/{quotationId:int}")]
        [Authorize(Roles = "quotation")]
        public async Task<IActionResult> Submit(int quotationId, [FromBody] SubmitDto? dto = null)
        {
            try
            {
                var approval = await _approvalService.SubmitAsync(
                    quotationId, User.Identity?.Name ?? "sales", dto?.NotifyUserIds);
                return Ok(new { approval.Id, approval.QuotationId, Status = approval.Status.ToString(), approval.SubmittedAt });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("{approvalId:int}/approve")]
        [Authorize(Roles = "engineer,admin")]
        public async Task<IActionResult> Approve(int approvalId)
        {
            try
            {
                var approval = await _approvalService.DecideAsync(approvalId, true, null, User.Identity?.Name ?? "engineer");
                return Ok(new { approval.Id, Status = approval.Status.ToString(), approval.DecidedBy, approval.DecidedAt });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("{approvalId:int}/reject")]
        [Authorize(Roles = "engineer,admin")]
        public async Task<IActionResult> Reject(int approvalId, [FromBody] RejectDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var approval = await _approvalService.DecideAsync(approvalId, false, dto.Reason, User.Identity?.Name ?? "engineer");
                return Ok(new { approval.Id, Status = approval.Status.ToString(), approval.DecidedBy, approval.DecidedAt, approval.RejectionReason });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("threshold")]
        [Authorize(Roles = "admin,engineer,quotation")]
        public async Task<IActionResult> GetThreshold()
        {
            return Ok(new { threshold = await _approvalService.GetThresholdAsync() });
        }

        [HttpPut("threshold")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> SetThreshold([FromBody] ThresholdDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            await _approvalService.SetThresholdAsync(dto.Threshold, User.Identity?.Name ?? "admin");
            return Ok(new { threshold = dto.Threshold });
        }

        /// <summary>Every cycle for one quotation, newest first — the approval history.</summary>
        [HttpGet("history/{quotationId:int}")]
        [Authorize(Roles = "engineer,admin,quotation")]
        public async Task<IActionResult> GetHistory(int quotationId)
        {
            var rows = await _context.QuoteApprovals
                .AsNoTracking()
                .Where(a => a.QuotationId == quotationId)
                .OrderByDescending(a => a.SubmittedAt)
                .Select(a => new
                {
                    a.Id,
                    Status = a.Status.ToString(),
                    a.AmountAtSubmission,
                    a.SubmittedBy,
                    a.SubmittedAt,
                    a.DecidedBy,
                    a.DecidedAt,
                    a.RejectionReason
                })
                .ToListAsync();

            return Ok(rows);
        }
    }
}
