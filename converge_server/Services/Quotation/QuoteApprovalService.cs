using System.Security.Cryptography;
using System.Text;
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

        private async Task<string?> ReadSettingAsync(string key)
        {
            var row = await _context.AppSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == key);
            return string.IsNullOrWhiteSpace(row?.Value) ? null : row!.Value.Trim();
        }

        public async Task<decimal> GetEngineerCeilingAsync()
        {
            var raw = await ReadSettingAsync(AppSettingKeys.QuoteApprovalEngineerCeiling);
            return raw != null && decimal.TryParse(raw, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var parsed) && parsed > 0 ? parsed : 0m;
        }

        /* The signing key for one-tap approval links. Generated once and kept in
           the settings table rather than appsettings.json so it survives a
           redeploy and never sits in source control. It is deliberately not in
           the settings API whitelist: anyone who can read it can approve
           anything. */
        private async Task<byte[]> GetLinkSecretAsync()
        {
            var existing = await _context.AppSettings.FirstOrDefaultAsync(s => s.Key == AppSettingKeys.ApprovalLinkSecret);
            if (existing != null && existing.Value.Length >= 32)
            {
                return Convert.FromBase64String(existing.Value);
            }

            var generated = RandomNumberGenerator.GetBytes(32);
            var encoded = Convert.ToBase64String(generated);

            if (existing == null)
            {
                _context.AppSettings.Add(new AppSetting { Key = AppSettingKeys.ApprovalLinkSecret, Value = encoded });
            }
            else
            {
                existing.Value = encoded;
                existing.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
            return generated;
        }

        /* The token binds the request id AND its submission time. Resubmitting a
           rejected quotation creates a new row with a new time, so a link from an
           old cycle cannot decide the new one. Single use comes from state rather
           than a stored flag: the endpoint only acts on a Pending request, so a
           second tap on the same link finds nothing to decide. */
        private async Task<string> SignAsync(QuoteApproval approval)
        {
            var secret = await GetLinkSecretAsync();
            var payload = $"{approval.Id}:{approval.SubmittedAt.Ticks}";
            using var hmac = new HMACSHA256(secret);
            var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
            return Convert.ToBase64String(hash).Replace("+", "-").Replace("/", "_").TrimEnd('=');
        }

        public async Task<bool> ValidateDecisionTokenAsync(QuoteApproval approval, string token)
        {
            if (string.IsNullOrWhiteSpace(token)) return false;

            var expected = await SignAsync(approval);
            // Fixed-time compare: a token is a credential, and plain string
            // equality leaks how much of a guess was right.
            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(token));
        }

        public async Task<string?> BuildApprovalLinkAsync(QuoteApproval approval)
        {
            var baseUrl = await ReadSettingAsync(AppSettingKeys.PublicBaseUrl);
            if (string.IsNullOrWhiteSpace(baseUrl)) return null;

            var token = await SignAsync(approval);
            return $"{baseUrl.TrimEnd('/')}/api/approvals/act/{approval.Id}?token={Uri.EscapeDataString(token)}";
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

                /* One-tap approval. The link is signed and only ever approves -
                   rejecting needs a reason, and a reason cannot be typed into a
                   tapped link, so the reject path stays in the dashboard where
                   the approver can say why. Null when no public URL is
                   configured, and then the text simply goes out without it. */
                var link = await BuildApprovalLinkAsync(approval);
                if (link != null)
                {
                    smsText += $" Approve: {link}";
                }

                var body = $"<p>{headline}</p><p>Amount: {quotation.GrandTotal:N2}</p>"
                           + (link != null ? $"<p><a href=\"{link}\">Approve this quote</a></p>" : "");

                /* Chosen recipients when the dialog supplied any, otherwise the
                   role-based fan-out. Both paths exist on purpose: the dialog is
                   the normal route, and a submission made any other way (an API
                   call, a future automation) still reaches the approvers rather
                   than silently notifying nobody. */
                if (notifyUserIds != null)
                {
                    /* An explicit choice is honoured exactly, INCLUDING an empty
                       one: unticking every approver in the dialog has to mean
                       nobody is texted, or the checkboxes are decorative. The
                       request still exists and still shows on the dashboard.

                       Null is different - it means no choice was expressed (an
                       API call, a future automation), and then the role fan-out
                       runs so a submission never silently notifies nobody. */
                    if (notifyUserIds.Count > 0)
                    {
                        await _dispatchService.DispatchToUsersAsync(NotificationType.QuotationApproval, smsText, body, notifyUserIds);
                    }
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

        public async Task<QuoteApproval> DecideAsync(int approvalId, bool approve, string? rejectionReason, string decidedBy, bool deciderIsAdmin = false)
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

            /* Amount-band routing. Above the ceiling the decision is admin-only,
               and the check lives here so the dashboard, the bulk endpoint and
               the one-tap link are all bound by the same rule.

               Rejection stays open to the engineer at any amount: sending work
               back is never the risky direction, and blocking it would only
               leave the request rotting while sales waits for an answer. */
            var ceiling = await GetEngineerCeilingAsync();
            if (approve && ceiling > 0 && approval.AmountAtSubmission > ceiling && !deciderIsAdmin)
            {
                throw new UnauthorizedAccessException(
                    $"{approval.AmountAtSubmission:N2} is above the {ceiling:N2} an engineer may approve. This one needs an admin.");
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

        /* Chase requests nobody has decided.

           Escalation is a second notification, not a reassignment: the request
           stays where it is and stays visible on the dashboard. Handing it to
           someone else would mean the person originally asked can no longer act
           on the link already in their pocket, which is a worse failure than one
           extra text. EscalatedAt is stamped so a request is chased once rather
           than on every sweep - an approver texted every ten minutes stops
           reading the texts. */
        public async Task<int> EscalateStalePendingAsync()
        {
            var raw = await ReadSettingAsync(AppSettingKeys.QuoteApprovalEscalationHours);
            if (raw == null || !int.TryParse(raw, out var hours) || hours <= 0)
            {
                return 0;
            }

            var cutoff = DateTime.UtcNow.AddHours(-hours);

            var stale = await _context.QuoteApprovals
                .Include(a => a.Quotation)!
                .ThenInclude(q => q!.Client)
                .Where(a => a.Status == QuoteApprovalStatus.Pending
                            && a.SubmittedAt <= cutoff
                            && a.EscalatedAt == null)
                .ToListAsync();

            if (stale.Count == 0) return 0;

            foreach (var approval in stale)
            {
                approval.EscalatedAt = DateTime.UtcNow;

                var number = approval.Quotation?.QuotationNumber ?? $"#{approval.QuotationId}";
                var clientName = approval.Quotation?.Client?.Name ?? "a client";
                var waited = (int)Math.Round((DateTime.UtcNow - approval.SubmittedAt).TotalHours);

                await _userNotifications.AddAsync(
                    "admin", "QuotationApproval",
                    $"Quote #{number} has been waiting {waited}h for approval.",
                    $"{approval.AmountAtSubmission:N2} - submitted by {approval.SubmittedBy}",
                    "/engineer/approvals");

                try
                {
                    var link = await BuildApprovalLinkAsync(approval);
                    var sms = $"Still awaiting approval after {waited}h: {number} for {clientName}, {approval.AmountAtSubmission:N0}."
                              + (link != null ? $" Approve: {link}" : "");

                    await _dispatchService.DispatchAsync(NotificationType.QuotationApproval, sms,
                        $"<p>Quote #{number} for {clientName} has been pending approval for {waited} hours.</p>"
                        + $"<p>Amount: {approval.AmountAtSubmission:N2}</p>"
                        + (link != null ? $"<p><a href=\"{link}\">Approve it</a></p>" : ""));
                }
                catch (Exception ex)
                {
                    /* An escalation that cannot be sent must not block the stamp.
                       Otherwise the sweep retries the same rows forever and
                       floods every approver the moment the provider recovers. */
                    _logger.LogWarning(ex, "Escalation dispatch failed for approval {Id}", approval.Id);
                }
            }

            await _context.SaveChangesAsync();
            _logger.LogInformation("Escalated {Count} pending approval(s) older than {Hours}h", stale.Count, hours);
            return stale.Count;
        }
    }
}
