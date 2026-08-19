using converge_server.Data;
using converge_server.Models.Entities;
using converge_server.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

// Namespace is the PLURAL Quotations, matching QuotationService here. The
// singular would be a namespace named exactly like the Quotation entity, and
// every sibling file resolving a bare "Quotation" would bind to the namespace
// instead of the type - which is what CS0118 was reporting across the project.
namespace converge_server.Services.Quotations
{
    /* Engineer sign-off on high-value quotations.

       The rule lives in one place (EvaluateClientAsync) because the spec
       requires the gate to be enforced by the API rather than the UI: the board
       calls it to decide whether to show the dialog, and ClientService calls the
       same method before committing a stage change, so a hand-rolled PUT to
       /api/clients/reorder cannot skip it. */
    public class QuoteApprovalService : IQuoteApprovalService
    {
        // Used until an admin sets one. A real figure rather than "everything
        // needs approval" so an unconfigured install does not halt sales.
        private const decimal DefaultThreshold = 100_000m;

        private readonly AppDbContext _context;
        private readonly IAuditService _auditService;
        private readonly IUserNotificationService _userNotifications;
        private readonly INotificationDispatchService _dispatchService;
        private readonly ILogger<QuoteApprovalService> _logger;

        public QuoteApprovalService(
            AppDbContext context,
            IAuditService auditService,
            IUserNotificationService userNotifications,
            INotificationDispatchService dispatchService,
            ILogger<QuoteApprovalService> logger)
        {
            _context = context;
            _auditService = auditService;
            _userNotifications = userNotifications;
            _dispatchService = dispatchService;
            _logger = logger;
        }

        public async Task<decimal> GetThresholdAsync()
        {
            var row = await _context.AppSettings
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.Key == AppSettingKeys.QuoteApprovalThreshold);

            return row != null && decimal.TryParse(row.Value, out var parsed) ? parsed : DefaultThreshold;
        }

        public async Task SetThresholdAsync(decimal threshold, string actorUsername)
        {
            if (threshold < 0) threshold = 0;

            var row = await _context.AppSettings
                .FirstOrDefaultAsync(s => s.Key == AppSettingKeys.QuoteApprovalThreshold);

            if (row == null)
            {
                row = new AppSetting { Key = AppSettingKeys.QuoteApprovalThreshold };
                _context.AppSettings.Add(row);
            }

            var previous = row.Value;
            row.Value = threshold.ToString(System.Globalization.CultureInfo.InvariantCulture);
            row.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Setting", AppSettingKeys.QuoteApprovalThreshold, "Updated",
                actorUsername, previous, row.Value, "Quote approval threshold changed");
        }

        public async Task<ApprovalGate> EvaluateClientAsync(int clientId)
        {
            var threshold = await GetThresholdAsync();

            // The quotation on the table right now - the same "current
            // opportunity" the board shows on the card, i.e. the newest one.
            var quotation = await _context.Quotations
                .AsNoTracking()
                .Where(q => q.ClientId == clientId)
                .OrderByDescending(q => q.CreatedAt)
                .Select(q => new { q.Id, q.QuotationNumber, q.GrandTotal, q.ApprovalState })
                .FirstOrDefaultAsync();

            // Nothing quoted yet, so approval cannot be what blocks the move.
            // (Leaving Leads without a quotation is a separate rule.)
            if (quotation == null)
            {
                return new ApprovalGate(true, null, null, null, 0m);
            }

            if (quotation.GrandTotal < threshold)
            {
                return new ApprovalGate(true, null, quotation.Id, quotation.QuotationNumber, quotation.GrandTotal);
            }

            return quotation.ApprovalState switch
            {
                QuotationApprovalState.Approved =>
                    new ApprovalGate(true, null, quotation.Id, quotation.QuotationNumber, quotation.GrandTotal),
                QuotationApprovalState.Pending =>
                    new ApprovalGate(false, "awaiting-approval", quotation.Id, quotation.QuotationNumber, quotation.GrandTotal),
                QuotationApprovalState.Rejected =>
                    new ApprovalGate(false, "rejected", quotation.Id, quotation.QuotationNumber, quotation.GrandTotal),
                _ =>
                    new ApprovalGate(false, "approval-required", quotation.Id, quotation.QuotationNumber, quotation.GrandTotal)
            };
        }

        public async Task<QuoteApproval> SubmitAsync(int quotationId, string submittedBy)
        {
            var quotation = await _context.Quotations
                .Include(q => q.Client)
                .FirstOrDefaultAsync(q => q.Id == quotationId);

            if (quotation == null)
            {
                throw new KeyNotFoundException("Quotation not found.");
            }

            if (quotation.ApprovalState == QuotationApprovalState.Pending)
            {
                throw new InvalidOperationException("This quotation is already awaiting approval.");
            }

            var approval = new QuoteApproval
            {
                QuotationId = quotation.Id,
                Status = QuoteApprovalStatus.Pending,
                AmountAtSubmission = quotation.GrandTotal,
                SubmittedBy = submittedBy,
                SubmittedAt = DateTime.UtcNow
            };
            _context.QuoteApprovals.Add(approval);

            var previousState = quotation.ApprovalState;
            quotation.ApprovalState = QuotationApprovalState.Pending;
            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Quotation", quotation.Id.ToString(), "SubmittedForApproval",
                submittedBy, previousState.ToString(), QuotationApprovalState.Pending.ToString(),
                $"Sent for approval by {submittedBy}");

            var clientName = quotation.Client?.Name ?? "a client";
            var headline = $"Quote #{quotation.QuotationNumber} from {submittedBy} for {clientName} requires approval.";

            // In-system, targeted at the role that owns the dashboard.
            await _userNotifications.AddAsync(
                "engineer", "QuotationApproval", headline,
                $"{quotation.GrandTotal:N2} - submitted {approval.SubmittedAt:g}",
                "/engineer/approvals");

            /* SMS and email go through the existing dispatcher rather than a
               provider call here: it already fans out to the configured
               recipients and is the abstraction the spec asked not to hard-code
               around. A failure to notify must not undo a submission that is
               already committed, so it is caught and logged. */
            try
            {
                await _dispatchService.DispatchAsync(NotificationType.QuotationApproval,
                    "Quotation approval required", $"<p>{headline}</p>");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Approval submitted but notification dispatch failed for quotation {Id}", quotation.Id);
            }

            return approval;
        }

        public async Task<QuoteApproval> DecideAsync(int approvalId, bool approve, string? rejectionReason, string decidedBy)
        {
            var approval = await _context.QuoteApprovals
                .Include(a => a.Quotation)
                .FirstOrDefaultAsync(a => a.Id == approvalId);

            if (approval == null)
            {
                throw new KeyNotFoundException("Approval request not found.");
            }

            if (approval.Status != QuoteApprovalStatus.Pending)
            {
                throw new InvalidOperationException("This request has already been decided.");
            }

            if (!approve && string.IsNullOrWhiteSpace(rejectionReason))
            {
                throw new InvalidOperationException("A rejection reason is required.");
            }

            approval.Status = approve ? QuoteApprovalStatus.Approved : QuoteApprovalStatus.Rejected;
            approval.DecidedBy = decidedBy;
            approval.DecidedAt = DateTime.UtcNow;
            approval.RejectionReason = approve ? null : rejectionReason!.Trim();

            var quotation = approval.Quotation!;
            var previousState = quotation.ApprovalState;
            quotation.ApprovalState = approve ? QuotationApprovalState.Approved : QuotationApprovalState.Rejected;

            await _context.SaveChangesAsync();

            await _auditService.LogAsync("Quotation", quotation.Id.ToString(),
                approve ? "ApprovalGranted" : "ApprovalRejected", decidedBy,
                previousState.ToString(), quotation.ApprovalState.ToString(),
                approve ? $"Approved by {decidedBy}" : $"Rejected by {decidedBy} - {approval.RejectionReason}");

            // Sales sees the outcome without having to watch the dashboard.
            await _userNotifications.AddAsync(
                "quotation",
                approve ? "QuotationApproved" : "QuotationRejected",
                approve
                    ? $"Quote #{quotation.QuotationNumber} approved by {decidedBy}."
                    : $"Quote #{quotation.QuotationNumber} rejected by {decidedBy}.",
                approve ? null : approval.RejectionReason,
                $"/sales/quotations?quotation={quotation.Id}");

            return approval;
        }
    }
}
