using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    /// <summary>Why a client card cannot leave the Quote stage yet.</summary>
    public record ApprovalGate(bool Allowed, string? Reason, int? QuotationId, string? QuotationNumber, decimal Amount);

    public interface IQuoteApprovalService
    {
        Task<decimal> GetThresholdAsync();
        Task SetThresholdAsync(decimal threshold, string actorUsername);

        /// <summary>
        /// Whether this client may move Quote to Proposal. The single source of
        /// truth for the rule - both the API gate and the board pre-check call
        /// it, so the dialog can never disagree with what the server allows.
        /// </summary>
        Task<ApprovalGate> EvaluateClientAsync(int clientId);

        /// <param name="notifyUserIds">
        /// Approvers the salesperson ticked in the dialog. They get the email and
        /// the SMS; everyone else is left alone. Empty means nobody is contacted -
        /// the request still exists and still shows on the dashboard.
        /// </param>
        Task<QuoteApproval> SubmitAsync(int quotationId, string submittedBy, List<int>? notifyUserIds = null);
        /// <param name="deciderIsAdmin">
        /// Whether the caller holds the admin role. Amount-band routing is
        /// enforced here rather than in the controller so every path into a
        /// decision - dashboard, bulk approve, one-tap link - is held to the
        /// same rule.
        /// </param>
        Task<QuoteApproval> DecideAsync(int approvalId, bool approve, string? rejectionReason, string decidedBy, bool deciderIsAdmin = false);

        /// <summary>The figure an engineer may decide up to. 0 means no ceiling.</summary>
        Task<decimal> GetEngineerCeilingAsync();

        /// <summary>A signed, one-tap approval link for this request, or null when no public URL is configured.</summary>
        Task<string?> BuildApprovalLinkAsync(QuoteApproval approval);

        /// <summary>Validates a one-tap link token against the request it claims to be for.</summary>
        Task<bool> ValidateDecisionTokenAsync(QuoteApproval approval, string token);

        /// <summary>Chases approvers about requests left pending too long. Returns how many were escalated.</summary>
        Task<int> EscalateStalePendingAsync();
    }
}
