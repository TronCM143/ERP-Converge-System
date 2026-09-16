using converge_server.Models.Entities;

namespace converge_server.Services.Interfaces
{
    public interface IInvoiceService
    {
        Task<Invoice> CreateFromQuotationAsync(int quotationId, int dueInDays, string actorUsername);
        Task<Invoice> IssueAsync(int invoiceId, string actorUsername);
        Task<Invoice> CancelAsync(int invoiceId, string actorUsername);

        /// <summary>
        /// Records money received. Recalculates the invoice status from the sum
        /// of its payments - Paid is never set by hand.
        /// </summary>
        Task<Payment> RecordPaymentAsync(int invoiceId, decimal amount, string? method, string? reference, DateTime? paidAt, string actorUsername);
    }
}
