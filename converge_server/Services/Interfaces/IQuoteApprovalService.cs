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

        Task<QuoteApproval> SubmitAsync(int quotationId, string submittedBy);
        Task<QuoteApproval> DecideAsync(int approvalId, bool approve, string? rejectionReason, string decidedBy);
    }
}
