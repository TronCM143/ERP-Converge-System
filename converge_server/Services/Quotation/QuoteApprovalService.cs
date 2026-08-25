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

        public async Task<QuoteApproval> SubmitAsync(int quotationId, string submittedBy, List<int>? notifyUserIds = null)
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
                /* The subject doubles as the SMS body (see NotificationDispatchService),
                   so it has to identify the quotation on its own - a text saying only
                   "approval required" tells the approver nothing they can act on, and
                   there is no HTML body to fall back to on a phone. Kept short enough
                   to survive a single 160-character segment in the common case. */
                var smsText = $"New quote request for approval: {quotation.QuotationNumber} from {submittedBy} for {clientName}, {quotation.GrandTotal:N0}.";

                var body = $"<p>{headline}</p><p>Amount: {quotation.GrandTotal:N2}</p>";

                /* Chosen recipients when the dialog supplied any, otherwise the
                   role-based fan-out. Both paths exist on purpose: the dialog is
                   the normal route, and a submission made any other way (an API
                   call, a future automation) still reaches the approvers rather
                   than silently notifying nobody. */
                if (notifyUserIds != null && notifyUserIds.Count > 0)
                {
                    await _dispatchService.DispatchToUsersAsync(NotificationType.QuotationApproval, smsText, body, notifyUserIds);
                }
                else
                {
                    await _dispatchService.DispatchAsync(NotificationType.QuotationApproval, smsText, body);
                }
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

            /* Approval moves the deal itself. Waiting for the salesperson to
               drag the card again was busywork: approval IS the decision that
               the quote may proceed, and a card sitting in Quote with an
               "approved" quotation is a state nobody wants to see.

               Done inline rather than through ClientService because that service
               depends on THIS one for the gate - calling back into it would be a
               circular dependency. Entering Proposal has no side effects of its
               own (unlike Won, which books revenue, or Lost, which rejects a
               quotation), so the stage write and its audit entry are all that is
               needed. */
            if (approve)
            {
                var client = await _context.Clients.FirstOrDefaultAsync(c => c.Id == quotation.ClientId);
                if (client != null && client.Stage != ClientStage.Proposal && client.Stage != ClientStage.Won)
                {
                    var oldStage = client.Stage;
                    client.Stage = ClientStage.Proposal;
                    await _auditService.LogAsync("Client", client.Id.ToString(), "StageChanged", decidedBy,
                        oldStage.ToString(), ClientStage.Proposal.ToString(),
                        $"Moved to Proposal automatically - {quotation.QuotationNumber} approved by {decidedBy}");
                }
            }

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
                    ? $"Quote #{quotation.QuotationNumber} approved by {decidedBy} — moved to Proposal."
                    : $"Quote #{quotation.QuotationNumber} rejected by {decidedBy}.",
                approve ? null : approval.RejectionReason,
                $"/sales/quotations?quotation={quotation.Id}");

            return approval;
        }
    }
}
