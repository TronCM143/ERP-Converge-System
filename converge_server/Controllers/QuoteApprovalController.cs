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
                    a.RejectionReason,

                    /* Margin, the question actually behind "should this be
                       approved". Costs are the per-line snapshots taken when the
                       quotation was written, so a later supplier price rise
                       cannot retroactively change what was approved.

                       CostedLines vs total lines is reported alongside: a margin
                       computed from two costed lines out of nine is not a margin,
                       and the dashboard has to be able to say so rather than
                       print a confident wrong number. */
                    TotalCost = a.Quotation.MaterialItems
                        .Where(i => i.UnitCost != null)
                        .Sum(i => (decimal?)(i.UnitCost!.Value * i.Quantity)) ?? 0m,
                    CostedLines = a.Quotation.MaterialItems.Count(i => i.UnitCost != null),
                    TotalLines = a.Quotation.MaterialItems.Count,

                    /* Resubmission context. An approver who rejected this before
                       needs to know what changed, not to re-read the whole quote:
                       the previous cycle's amount and reason turn "is this fixed?"
                       into a comparison instead of a memory test. */
                    PreviousAmount = _context.QuoteApprovals
                        .Where(p => p.QuotationId == a.QuotationId && p.SubmittedAt < a.SubmittedAt)
                        .OrderByDescending(p => p.SubmittedAt)
                        .Select(p => (decimal?)p.AmountAtSubmission)
                        .FirstOrDefault(),
                    PreviousRejectionReason = _context.QuoteApprovals
                        .Where(p => p.QuotationId == a.QuotationId && p.SubmittedAt < a.SubmittedAt
                                    && p.Status == QuoteApprovalStatus.Rejected)
                        .OrderByDescending(p => p.SubmittedAt)
                        .Select(p => p.RejectionReason)
                        .FirstOrDefault(),
                    SubmissionCount = _context.QuoteApprovals.Count(p => p.QuotationId == a.QuotationId)
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
                var approval = await _approvalService.DecideAsync(approvalId, true, null, User.Identity?.Name ?? "engineer", User.IsInRole("admin"));
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

        public class BulkApproveDto
        {
            public List<int> ApprovalIds { get; set; } = new();
        }

        /* Approving several at once. Only ever APPROVE in bulk - rejection needs
           a reason, and one reason pasted across a batch is worse than no reason
           at all because it looks specific and is not.

           Each is decided individually rather than in one query so every one gets
           its own audit entry, notification and stage move; a failure on one does
           not silently swallow the rest. */
        [HttpPost("bulk-approve")]
        [Authorize(Roles = "engineer,admin")]
        public async Task<IActionResult> BulkApprove([FromBody] BulkApproveDto dto)
        {
            if (dto.ApprovalIds == null || dto.ApprovalIds.Count == 0)
            {
                return BadRequest(new { error = "Nothing selected." });
            }

            var decidedBy = User.Identity?.Name ?? "engineer";
            var approved = new List<int>();
            var failed = new List<object>();

            foreach (var id in dto.ApprovalIds.Distinct())
            {
                try
                {
                    await _approvalService.DecideAsync(id, true, null, decidedBy, User.IsInRole("admin"));
                    approved.Add(id);
                }
                catch (Exception ex)
                {
                    failed.Add(new { id, error = ex.Message });
                }
            }

            return Ok(new { approvedCount = approved.Count, approved, failed });
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
                var approval = await _approvalService.DecideAsync(approvalId, false, dto.Reason, User.Identity?.Name ?? "engineer", User.IsInRole("admin"));
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

        /* One-tap approval from the SMS or the email.

           Anonymous by necessity - the point is that an approver away from their
           desk can act without logging in - so the token IS the authorisation:
           an HMAC over the request id and its submission time, which nobody can
           forge without the server secret and which stops working the moment the
           request is decided or resubmitted.

           Approve only. Rejecting requires a reason, and a link cannot carry
           one, so the reject path stays in the dashboard where the approver can
           explain themselves to the salesperson who has to act on it. */
        [HttpGet("act/{approvalId:int}")]
        [AllowAnonymous]
        public async Task<IActionResult> ActOnLink(int approvalId, [FromQuery] string token = "")
        {
            var approval = await _context.QuoteApprovals
                .Include(a => a.Quotation)
                .FirstOrDefaultAsync(a => a.Id == approvalId);

            if (approval == null)
            {
                return Content(Page("Not found", "That approval request no longer exists."), "text/html");
            }

            if (!await _approvalService.ValidateDecisionTokenAsync(approval, token))
            {
                return Content(Page("Link not valid", "This link could not be verified. Open the dashboard and decide there."), "text/html");
            }

            if (approval.Status != QuoteApprovalStatus.Pending)
            {
                return Content(Page("Already decided",
                    $"{approval.Quotation?.QuotationNumber} was already {approval.Status.ToString().ToLowerInvariant()}"
                    + (approval.DecidedBy != null ? $" by {approval.DecidedBy}" : "") + "."), "text/html");
            }

            try
            {
                /* Decided as the link holder, recorded as such. "approver (link)"
                   rather than a real username because the token proves someone
                   who was sent the message acted, not which of them - and an
                   audit trail that names a specific person on that evidence
                   would be a guess presented as a fact. */
                await _approvalService.DecideAsync(approvalId, true, null, "approver (link)", deciderIsAdmin: false);
                return Content(Page("Approved",
                    $"{approval.Quotation?.QuotationNumber} is approved. The deal has moved to Proposal and sales has been told."), "text/html");
            }
            catch (UnauthorizedAccessException ex)
            {
                return Content(Page("Needs an admin", ex.Message), "text/html");
            }
            catch (InvalidOperationException ex)
            {
                return Content(Page("Could not approve", ex.Message), "text/html");
            }
        }

        // A phone opening this link gets a page, not JSON.
        private static string Page(string heading, string message) =>
            "<!doctype html><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:48px 24px;background:#0b1220;color:#e6edf7}"
            + "h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#9fb0c9}</style>"
            + $"<h1>{System.Net.WebUtility.HtmlEncode(heading)}</h1><p>{System.Net.WebUtility.HtmlEncode(message)}</p>";

        /* How fast this queue is actually being cleared.

           Decision time is measured from submission, and the slowest request is
           reported next to the average because an average of four hours across a
           week hides the one that sat for three days - and that one is the deal
           that was lost waiting. */
        [HttpGet("sla")]
        [Authorize(Roles = "engineer,admin")]
        public async Task<IActionResult> GetSla([FromQuery] int days = 30)
        {
            days = Math.Clamp(days, 1, 365);
            var since = DateTime.UtcNow.AddDays(-days);

            var decided = await _context.QuoteApprovals
                .AsNoTracking()
                .Where(a => a.DecidedAt != null && a.SubmittedAt >= since)
                .Select(a => new { a.Status, a.SubmittedAt, DecidedAt = a.DecidedAt!.Value, a.DecidedBy, a.AmountAtSubmission })
                .ToListAsync();

            var pending = await _context.QuoteApprovals
                .AsNoTracking()
                .Where(a => a.Status == QuoteApprovalStatus.Pending)
                .Select(a => new { a.SubmittedAt, a.AmountAtSubmission })
                .ToListAsync();

            var hours = decided.Select(d => (d.DecidedAt - d.SubmittedAt).TotalHours).ToList();

            return Ok(new
            {
                windowDays = days,
                decidedCount = decided.Count,
                averageHours = hours.Count > 0 ? Math.Round(hours.Average(), 1) : 0d,
                // Median as well as mean: one forgotten request drags an average
                // far from what the queue normally feels like.
                medianHours = hours.Count > 0 ? Math.Round(hours.OrderBy(h => h).ElementAt(hours.Count / 2), 1) : 0d,
                slowestHours = hours.Count > 0 ? Math.Round(hours.Max(), 1) : 0d,
                withinOneDay = hours.Count(h => h <= 24),
                approvedCount = decided.Count(d => d.Status == QuoteApprovalStatus.Approved),
                rejectedCount = decided.Count(d => d.Status == QuoteApprovalStatus.Rejected),
                oldestPendingHours = pending.Count > 0
                    ? Math.Round((DateTime.UtcNow - pending.Min(p => p.SubmittedAt)).TotalHours, 1)
                    : 0d,
                pendingValue = pending.Sum(p => p.AmountAtSubmission),
                byApprover = decided
                    .Where(d => d.DecidedBy != null)
                    .GroupBy(d => d.DecidedBy!)
                    .Select(g => new
                    {
                        approver = g.Key,
                        decided = g.Count(),
                        averageHours = Math.Round(g.Average(x => (x.DecidedAt - x.SubmittedAt).TotalHours), 1)
                    })
                    .OrderByDescending(g => g.decided)
            });
        }
    }
}
